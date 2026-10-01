/**
 * Universal "security finding" contract.
 *
 * Every integrated tool (Semgrep, Gitleaks, OSV-Scanner, Trivy, MobSF,
 * Nuclei, Checkov, deep-checks) must produce an array of `NormalizedFinding`.
 * This is what lets the dashboard, the report engine, and the prompt
 * generator treat any tool the same way — plugging in a new tool is just
 * writing an adapter that returns this shape.
 */

export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

export type FindingCategory =
  | "INJECTION"
  | "BROKEN_AUTH"
  | "BROKEN_ACCESS_CONTROL"
  | "SENSITIVE_DATA_EXPOSURE"
  | "SECURITY_MISCONFIGURATION"
  | "XSS"
  | "INSECURE_DESERIALIZATION"
  | "VULNERABLE_DEPENDENCY"
  | "SECRET_LEAK"
  | "SSRF"
  | "INSECURE_STORAGE_MOBILE"
  | "INSECURE_COMMUNICATION"
  | "MEMORY_SAFETY"
  | "IPC_INSECURE"
  | "SUPPLY_CHAIN"
  | "MISSING_SECURITY_HEADERS"
  | "RATE_LIMITING_POLICY"
  | "BINARY_EXPOSURE"
  | "IAC_MISCONFIGURATION"
  | "OTHER";

export interface NormalizedFinding {
  /** Name of the source tool, e.g. "semgrep", "gitleaks", "mobsf" */
  tool: string;
  /** Rule/CVE id in the source tool, for dedup and reference */
  ruleId?: string;
  severity: Severity;
  category: FindingCategory;
  title: string;
  description: string;

  filePath?: string;
  lineStart?: number;
  lineEnd?: number;

  packageName?: string;
  packageVersion?: string;
  cveId?: string;
  cvssScore?: number;

  endpointUrl?: string;
  httpMethod?: string;

  codeSnippet?: string;

  /** Fix recommendation in natural language — filled by the adapter when
   * the tool already provides it, or by the report-engine via Claude
   * when it doesn't. */
  remediation: string;

  /** true for deep-checks module findings — flags that this is structural/
   * heuristic analysis, not proof of real exploitation. The dashboard
   * should make this visually clear to the user. */
  isStructuralOnly?: boolean;
}

export interface ScanModuleResult {
  tool: string;
  status: "success" | "failed" | "skipped";
  findings: NormalizedFinding[];
  rawOutput?: unknown;
  errorMessage?: string;
  durationMs: number;
}

/** Modules available in the pipeline — each one becomes a ToolRun in the database */
export type ScanModule =
  | "semgrep"
  | "gitleaks"
  | "trufflehog"
  | "osv-scanner"
  | "trivy"
  | "trivy-iac"
  | "mobsf"
  | "nuclei"
  | "deep-checks";

export interface ScanTarget {
  /** Local path of the already cloned/extracted code, inside the worker */
  localPath: string;
  /** Platforms detected or declared by the user */
  platforms: Array<"WEB" | "MOBILE_ANDROID" | "MOBILE_IOS" | "DESKTOP" | "API_BACKEND" | "INFRA_IAC">;
  /** Authorized live URL for DAST — only filled if liveTargetAuthorized=true */
  liveTargetUrl?: string;
}
