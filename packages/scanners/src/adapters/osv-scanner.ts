import { execa } from "execa";
import type { NormalizedFinding, ScanModuleResult, ScanTarget } from "@scanner/shared/types/finding";

/**
 * OSV-Scanner adapter (Google) — SCA (Software Composition Analysis).
 * Detects known CVEs in dependencies for any language by reading
 * package-lock.json, yarn.lock, go.sum, Pipfile.lock, Cargo.lock, etc.
 * Covers "Supply Chain Security" from the scope.
 *
 * Requires the `osv-scanner` binary (go install github.com/google/osv-scanner/cmd/osv-scanner@latest).
 */

interface OsvResult {
  results: Array<{
    source: { path: string; type: string };
    packages: Array<{
      package: { name: string; version: string; ecosystem: string };
      vulnerabilities: Array<{
        id: string;
        summary?: string;
        details?: string;
        severity?: Array<{ type: string; score: string }>;
        references?: Array<{ url: string }>;
      }>;
    }>;
  }>;
}

function cvssToSeverity(score?: number): NormalizedFinding["severity"] {
  if (score === undefined) return "MEDIUM";
  if (score >= 9.0) return "CRITICAL";
  if (score >= 7.0) return "HIGH";
  if (score >= 4.0) return "MEDIUM";
  return "LOW";
}

function parseCvssScore(severity?: Array<{ type: string; score: string }>): number | undefined {
  const cvss = severity?.find((s) => s.type.startsWith("CVSS"));
  if (!cvss) return undefined;
  // CVSS vector string format — extract a plain numeric score if given as "7.5",
  // otherwise leave undefined (the full vector goes in the description).
  const num = Number.parseFloat(cvss.score);
  return Number.isNaN(num) ? undefined : num;
}

export async function runOsvScanner(target: ScanTarget): Promise<ScanModuleResult> {
  const start = Date.now();
  try {
    const { stdout } = await execa(
      "osv-scanner",
      ["scan", "--recursive", "--format", "json", target.localPath],
      { reject: false, timeout: 5 * 60 * 1000 }
    );

    const parsed: OsvResult = JSON.parse(stdout || '{"results":[]}');

    const findings: NormalizedFinding[] = [];
    for (const result of parsed.results ?? []) {
      for (const pkg of result.packages ?? []) {
        for (const vuln of pkg.vulnerabilities ?? []) {
          const score = parseCvssScore(vuln.severity);
          findings.push({
            tool: "osv-scanner",
            ruleId: vuln.id,
            severity: cvssToSeverity(score),
            category: "VULNERABLE_DEPENDENCY",
            title: `${pkg.package.name}@${pkg.package.version}: ${vuln.id}`,
            description: vuln.summary ?? vuln.details ?? "Known vulnerability in this dependency version.",
            filePath: result.source.path.replace(target.localPath, "").replace(/^\//, ""),
            packageName: pkg.package.name,
            packageVersion: pkg.package.version,
            cveId: vuln.id,
            cvssScore: score,
            remediation: `Update ${pkg.package.name} to a patched version. See: ${
              vuln.references?.[0]?.url ?? `https://osv.dev/vulnerability/${vuln.id}`
            }`,
          });
        }
      }
    }

    return { tool: "osv-scanner", status: "success", findings, rawOutput: parsed, durationMs: Date.now() - start };
  } catch (err) {
    return {
      tool: "osv-scanner",
      status: "failed",
      findings: [],
      errorMessage: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    };
  }
}
