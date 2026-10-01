import { readdir } from "node:fs/promises";
import { join, extname } from "node:path";
import type { NormalizedFinding, ScanModuleResult, ScanTarget } from "@scanner/shared/types/finding";

/**
 * MobSF adapter — full SAST for Android (.apk) and iOS (.ipa).
 * Directly covers the "Mobile Development" table from the original scope:
 * insecure storage, Keystore/Keychain, SSL pinning, exported components,
 * deep links, excessive permissions.
 *
 * Requires the MobSF service running separately (see docker-compose.yml) —
 * this adapter is an HTTP client for the MobSF REST API, it does not run a local binary.
 */

const MOBSF_URL = process.env.MOBSF_URL ?? "http://localhost:8000";
const MOBSF_API_KEY = process.env.MOBSF_API_KEY ?? "";

interface MobSFUploadResponse {
  hash: string;
  file_name: string;
  scan_type: "apk" | "ipa";
}

interface MobSFFinding {
  title: string;
  severity: "high" | "warning" | "info" | "good"; // MobSF uses its own naming convention
  description?: string;
  file?: string;
}

interface MobSFReport {
  file_name: string;
  permissions?: Record<string, { status: string; info: string; description: string }>;
  code_analysis?: {
    findings?: Record<string, MobSFFinding>;
  };
  binary_analysis?: MobSFFinding[];
  network_security?: { network_findings?: MobSFFinding[] };
}

const SEVERITY_MAP: Record<string, NormalizedFinding["severity"]> = {
  high: "HIGH",
  warning: "MEDIUM",
  info: "LOW",
  good: "INFO",
};

async function findMobilePackage(localPath: string): Promise<{ path: string; type: "apk" | "ipa" } | null> {
  const entries = await readdir(localPath, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase();
      if (ext === ".apk") return { path: join(localPath, entry.name), type: "apk" };
      if (ext === ".ipa") return { path: join(localPath, entry.name), type: "ipa" };
    }
  }
  return null;
}

export async function runMobSF(target: ScanTarget): Promise<ScanModuleResult> {
  const start = Date.now();

  const pkg = await findMobilePackage(target.localPath);
  if (!pkg) {
    return {
      tool: "mobsf",
      status: "skipped",
      findings: [],
      errorMessage: "No .apk or .ipa file found at the project root for MobSF analysis. For Android/iOS source projects, build first, or point to the compiled artifact path.",
      durationMs: 0,
    };
  }

  try {
    // 1. Upload
    const fileBuffer = await import("node:fs/promises").then((fs) => fs.readFile(pkg.path));
    const formData = new FormData();
    formData.append("file", new Blob([fileBuffer]), pkg.path.split("/").pop());

    const uploadRes = await fetch(`${MOBSF_URL}/api/v1/upload`, {
      method: "POST",
      headers: { Authorization: MOBSF_API_KEY },
      body: formData,
    });
    const upload: MobSFUploadResponse = await uploadRes.json();

    // 2. Trigger the scan
    await fetch(`${MOBSF_URL}/api/v1/scan`, {
      method: "POST",
      headers: { Authorization: MOBSF_API_KEY, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ hash: upload.hash, scan_type: upload.scan_type }),
    });

    // 3. Fetch the JSON report
    const reportRes = await fetch(`${MOBSF_URL}/api/v1/report_json`, {
      method: "POST",
      headers: { Authorization: MOBSF_API_KEY, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ hash: upload.hash }),
    });
    const report: MobSFReport = await reportRes.json();

    const findings: NormalizedFinding[] = [];

    // Code analysis findings (vulnerabilities in decompiled code)
    for (const [key, f] of Object.entries(report.code_analysis?.findings ?? {})) {
      if (f.severity === "good") continue; // "good" = check passed, not a finding
      findings.push({
        tool: "mobsf",
        ruleId: key,
        severity: SEVERITY_MAP[f.severity] ?? "MEDIUM",
        category: "INSECURE_STORAGE_MOBILE",
        title: f.title,
        description: f.description ?? f.title,
        filePath: f.file,
        remediation: "Consult the MobSF documentation for this finding (mobile insecure storage/communication category) and apply the platform-appropriate mitigation.",
      });
    }

    // Binary analysis (mobile equivalent of our deep-checks binary-exposure)
    for (const f of report.binary_analysis ?? []) {
      if (f.severity === "good") continue;
      findings.push({
        tool: "mobsf",
        severity: SEVERITY_MAP[f.severity] ?? "MEDIUM",
        category: "BINARY_EXPOSURE",
        title: f.title,
        description: f.description ?? f.title,
        remediation: "Review the compilation flags and binary protections (PIE, stack canary, obfuscation) recommended by MobSF.",
      });
    }

    // Network security findings (SSL pinning, cleartext traffic, etc.)
    for (const f of report.network_security?.network_findings ?? []) {
      if (f.severity === "good") continue;
      findings.push({
        tool: "mobsf",
        severity: SEVERITY_MAP[f.severity] ?? "MEDIUM",
        category: "INSECURE_COMMUNICATION",
        title: f.title,
        description: f.description ?? f.title,
        remediation: "Implement SSL/TLS Pinning and disable cleartext traffic in the app's network security configuration.",
      });
    }

    // Dangerous/excessive permissions
    for (const [permName, permInfo] of Object.entries(report.permissions ?? {})) {
      if (permInfo.status === "dangerous") {
        findings.push({
          tool: "mobsf",
          severity: "MEDIUM",
          category: "SECURITY_MISCONFIGURATION",
          title: `Dangerous permission declared: ${permName}`,
          description: permInfo.description || permInfo.info,
          remediation: "Verify whether this permission is strictly necessary. Remove it if unused, or document the justification for privacy review.",
        });
      }
    }

    return { tool: "mobsf", status: "success", findings, rawOutput: report, durationMs: Date.now() - start };
  } catch (err) {
    return {
      tool: "mobsf",
      status: "failed",
      findings: [],
      errorMessage: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    };
  }
}
