import { execa } from "execa";
import type { NormalizedFinding, ScanModuleResult, ScanTarget } from "@scanner/shared/types/finding";

/**
 * Nuclei adapter — active pentest (DAST) against a live URL.
 *
 * IMPORTANT — AUTHORIZATION GUARD:
 * This module must only be invoked by the orchestrator when
 * `project.liveTargetAuthorized === true` AND `target.liveTargetUrl` is set.
 * The orchestrator (packages/scanners/src/orchestrator.ts) is responsible for
 * that check before even importing this adapter. Never remove this guard.
 *
 * Requires the `nuclei` binary (go install github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest)
 * with up-to-date community templates (`nuclei -update-templates`).
 */

interface NucleiFinding {
  "template-id": string;
  info: {
    name: string;
    severity: "critical" | "high" | "medium" | "low" | "info";
    description?: string;
    reference?: string[];
    classification?: { "cwe-id"?: string[] };
  };
  "matched-at": string;
  type: string;
  request?: string;
  response?: string;
}

const SEVERITY_MAP: Record<string, NormalizedFinding["severity"]> = {
  critical: "CRITICAL",
  high: "HIGH",
  medium: "MEDIUM",
  low: "LOW",
  info: "INFO",
};

function categorize(templateId: string): NormalizedFinding["category"] {
  const id = templateId.toLowerCase();
  if (id.includes("sqli") || id.includes("sql-injection")) return "INJECTION";
  if (id.includes("xss")) return "XSS";
  if (id.includes("ssrf")) return "SSRF";
  if (id.includes("cors")) return "MISSING_SECURITY_HEADERS";
  if (id.includes("header") || id.includes("hsts") || id.includes("csp")) return "MISSING_SECURITY_HEADERS";
  if (id.includes("exposure") || id.includes("disclosure")) return "SENSITIVE_DATA_EXPOSURE";
  if (id.includes("takeover") || id.includes("auth")) return "BROKEN_AUTH";
  if (id.includes("default-login") || id.includes("misconfig")) return "SECURITY_MISCONFIGURATION";
  return "OTHER";
}

export async function runNuclei(target: ScanTarget): Promise<ScanModuleResult> {
  const start = Date.now();

  if (!target.liveTargetUrl) {
    return { tool: "nuclei", status: "skipped", findings: [], durationMs: 0 };
  }

  try {
    // -es (exclude severity) empty: we want everything, from critical to informational.
    // -rl (rate limit): 50 req/s — conservative so we don't overwhelm the target (see deep-checks
    // for the dedicated, controlled rate-limiting policy test).
    const { stdout } = await execa(
      "nuclei",
      [
        "-u",
        target.liveTargetUrl,
        "-jsonl",
        "-silent",
        "-rl",
        "50",
        "-timeout",
        "10",
        "-tags",
        "owasp,cve,exposure,misconfig,default-login",
      ],
      { reject: false, timeout: 15 * 60 * 1000 }
    );

    const lines = stdout.split("\n").filter(Boolean);
    const parsed: NucleiFinding[] = lines.map((l) => JSON.parse(l));

    const findings: NormalizedFinding[] = parsed.map((f) => ({
      tool: "nuclei",
      ruleId: f["template-id"],
      severity: SEVERITY_MAP[f.info.severity] ?? "MEDIUM",
      category: categorize(f["template-id"]),
      title: f.info.name,
      description: f.info.description ?? f.info.name,
      endpointUrl: f["matched-at"],
      codeSnippet: f.request ? `Request:\n${f.request.slice(0, 500)}` : undefined,
      remediation: f.info.reference?.join("\n") ?? "Consult the corresponding Nuclei template documentation for the recommended fix.",
    }));

    return { tool: "nuclei", status: "success", findings, rawOutput: parsed, durationMs: Date.now() - start };
  } catch (err) {
    return {
      tool: "nuclei",
      status: "failed",
      findings: [],
      errorMessage: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    };
  }
}
