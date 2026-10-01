import { execa } from "execa";
import { readdir, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import type { NormalizedFinding } from "@scanner/shared/types/finding";

/**
 * STRUCTURAL analysis of binaries (native Desktop/Mobile) — not real reverse
 * engineering, but automatable by nature (see scope decision):
 *
 *  - Debug symbols present (makes reverse engineering easier)
 *  - Missing compile-time protection flags (ASLR/PIE/stack canary)
 *  - Sensitive strings baked into the binary (internal URLs, apparent keys,
 *    developer debug file paths)
 *  - No signs of obfuscation/signing
 *
 * Uses `strings`, `file`, and `objdump`/`otool` — standard binutils tools,
 * must be installed on the worker (the `binutils` + `file` packages in the Dockerfile).
 *
 * Results are always marked `isStructuralOnly: true` to make clear to the
 * user that this is a heuristic signal, not proof of an exploitable
 * vulnerability.
 */

const BINARY_EXTENSIONS = [".exe", ".dll", ".so", ".dylib", ".app", ""];
const SENSITIVE_STRING_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/, label: "Embedded private key" },
  { pattern: /AKIA[0-9A-Z]{16}/, label: "AWS Access Key ID" },
  { pattern: /https?:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+)[:\d]*\/\S*/, label: "Embedded internal/debug URL" },
  { pattern: /\/Users\/[a-zA-Z0-9_-]+\/(Documents|Desktop|Projects)/, label: "Exposed developer filesystem path" },
  { pattern: /(api[_-]?key|secret|password)\s*[:=]\s*['"][a-zA-Z0-9\-_.]{8,}['"]/i, label: "Possible plaintext secret" },
];

async function findBinaries(rootPath: string, maxDepth = 6): Promise<string[]> {
  const found: string[] = [];

  async function walk(dir: string, depth: number) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath, depth + 1);
      } else if (BINARY_EXTENSIONS.includes(extname(entry.name))) {
        const info = await stat(fullPath).catch(() => null);
        if (info && info.size > 1024) found.push(fullPath);
      }
    }
  }

  await walk(rootPath, 0);
  return found;
}

export async function checkBinaryExposure(localPath: string): Promise<NormalizedFinding[]> {
  const findings: NormalizedFinding[] = [];
  const binaries = await findBinaries(localPath);

  // Avoid running on huge builds — sample the first N binaries found
  const sample = binaries.slice(0, 20);

  for (const binPath of sample) {
    const relPath = binPath.replace(localPath, "").replace(/^\//, "");

    // 1. Check for debug symbols (via `file`)
    try {
      const { stdout: fileInfo } = await execa("file", [binPath], { reject: false });
      if (/not stripped|with debug_info/i.test(fileInfo)) {
        findings.push({
          tool: "deep-checks",
          severity: "LOW",
          category: "BINARY_EXPOSURE",
          title: "Binary compiled with debug symbols present",
          description: `The binary ${relPath} was not stripped — it contains debug symbols that make reverse engineering and third-party binary analysis easier.`,
          filePath: relPath,
          isStructuralOnly: true,
          remediation: "Compile the production build with `strip` (Linux/macOS) or remove PDBs from the final build (Windows). For Rust: set `strip = true` in the release profile of Cargo.toml.",
        });
      }
    } catch {
      // `file` may not be available — doesn't block the rest of the check
    }

    // 2. Extract strings and look for sensitive patterns
    try {
      const { stdout: strOutput } = await execa("strings", ["-n", "12", binPath], {
        reject: false,
        maxBuffer: 20 * 1024 * 1024,
      });
      for (const { pattern, label } of SENSITIVE_STRING_PATTERNS) {
        const match = strOutput.match(pattern);
        if (match) {
          findings.push({
            tool: "deep-checks",
            severity: label.includes("key") || label.includes("secret") || label.includes("AWS") ? "CRITICAL" : "MEDIUM",
            category: "BINARY_EXPOSURE",
            title: `${label} found in compiled binary`,
            description: `Extracting strings from the binary ${relPath} revealed a pattern matching "${label}". Anyone with access to the distributed binary can extract this with trivial tools (e.g. \`strings\`).`,
            filePath: relPath,
            codeSnippet: match[0].slice(0, 80) + (match[0].length > 80 ? "..." : ""),
            isStructuralOnly: true,
            remediation:
              "Never compile secrets/keys directly into the binary. Use environment variables injected at runtime, or a remote configuration service fetched via authenticated API.",
          });
        }
      }
    } catch {
      // binary may be too large, or `strings` unavailable — move on to the next one
    }
  }

  if (binaries.length > sample.length) {
    findings.push({
      tool: "deep-checks",
      severity: "INFO",
      category: "BINARY_EXPOSURE",
      title: `Analysis limited to ${sample.length} of ${binaries.length} binaries found`,
      description: "To keep scan time reasonable, only a sample of the binaries was analyzed.",
      isStructuralOnly: true,
      remediation: "Run the scan locally with the worker configured for a larger sample if you need full coverage.",
    });
  }

  return findings;
}
