import { execa } from "execa";
import type { NormalizedFinding, ScanModuleResult, ScanTarget } from "@scanner/shared/types/finding";

/**
 * Semgrep adapter — primary SAST engine.
 * Covers: SQLi, command injection, XSS, SSRF, weak crypto, path traversal,
 * and hundreds of other rules via the public registries `p/owasp-top-ten`,
 * `p/secrets`, `p/security-audit`, plus per-language rules.
 *
 * Requires the `semgrep` binary installed on the worker (pip install semgrep,
 * or use the official returntocorp/semgrep image as the Dockerfile base).
 */

interface SemgrepResult {
  results: Array<{
    check_id: string;
    path: string;
    start: { line: number; col: number };
    end: { line: number; col: number };
    extra: {
      message: string;
      severity: "ERROR" | "WARNING" | "INFO";
      lines: string;
      metadata?: {
        cwe?: string[];
        owasp?: string[];
        references?: string[];
        category?: string;
        confidence?: string;
      };
    };
  }>;
  errors: unknown[];
}

const SEVERITY_MAP: Record<string, NormalizedFinding["severity"]> = {
  ERROR: "HIGH",
  WARNING: "MEDIUM",
  INFO: "LOW",
};

function categorize(checkId: string, metadata?: { category?: string; cwe?: string[] }): NormalizedFinding["category"] {
  const id = checkId.toLowerCase();
  const cwe = (metadata?.cwe ?? []).join(" ").toLowerCase();

  if (id.includes("sql") || cwe.includes("89")) return "INJECTION";
  if (id.includes("command-injection") || id.includes("exec") || cwe.includes("78")) return "INJECTION";
  if (id.includes("xss") || cwe.includes("79")) return "XSS";
  if (id.includes("ssrf") || cwe.includes("918")) return "SSRF";
  if (id.includes("deserializ")) return "INSECURE_DESERIALIZATION";
  if (id.includes("hardcoded") || id.includes("secret")) return "SECRET_LEAK";
  if (id.includes("crypto") || id.includes("weak-hash") || id.includes("cipher")) return "SENSITIVE_DATA_EXPOSURE";
  if (id.includes("cors") || id.includes("csp") || id.includes("header")) return "MISSING_SECURITY_HEADERS";
  if (id.includes("auth") || id.includes("session")) return "BROKEN_AUTH";
  if (id.includes("access-control") || id.includes("idor")) return "BROKEN_ACCESS_CONTROL";
  return "OTHER";
}

export async function runSemgrep(target: ScanTarget): Promise<ScanModuleResult> {
  const start = Date.now();
  try {
    // p/owasp-top-ten covers the "Cross-cutting Fundamentals" and "Web" scope table.
    // p/secrets also catches secrets via structural grep (redundancy with Gitleaks is intentional).
    const { stdout } = await execa(
      "semgrep",
      [
        "scan",
        "--config",
        "p/owasp-top-ten",
        "--config",
        "p/security-audit",
        "--config",
        "p/secrets",
        "--json",
        "--quiet",
        "--no-git-ignore",
        target.localPath,
      ],
      { reject: false, timeout: 10 * 60 * 1000 } // 10 min hard cap
    );

    const parsed: SemgrepResult = JSON.parse(stdout);

    const findings: NormalizedFinding[] = parsed.results.map((r) => ({
      tool: "semgrep",
      ruleId: r.check_id,
      severity: SEVERITY_MAP[r.extra.severity] ?? "MEDIUM",
      category: categorize(r.check_id, r.extra.metadata),
      title: r.check_id.split(".").pop() ?? r.check_id,
      description: r.extra.message,
      filePath: r.path.replace(target.localPath, "").replace(/^\//, ""),
      lineStart: r.start.line,
      lineEnd: r.end.line,
      codeSnippet: r.extra.lines,
      remediation:
        r.extra.metadata?.references?.join("\n") ??
        "Review the flagged logic and apply appropriate validation/sanitization. Consult the OWASP references for this vulnerability pattern.",
    }));

    return {
      tool: "semgrep",
      status: "success",
      findings,
      rawOutput: parsed,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      tool: "semgrep",
      status: "failed",
      findings: [],
      errorMessage: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    };
  }
}
