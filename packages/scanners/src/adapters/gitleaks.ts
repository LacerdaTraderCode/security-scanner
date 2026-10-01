import { execa } from "execa";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { NormalizedFinding, ScanModuleResult, ScanTarget } from "@scanner/shared/types/finding";

/**
 * Gitleaks adapter — secret detection in code and git history.
 * Directly covers the "Secrets Management" section of the scope:
 * API keys, passwords, JWT tokens, connection strings in source code.
 *
 * Requires the `gitleaks` binary on the worker (go install github.com/gitleaks/gitleaks/v8@latest,
 * or the official zricethezav/gitleaks image).
 */

interface GitleaksFinding {
  Description: string;
  File: string;
  StartLine: number;
  EndLine: number;
  RuleID: string;
  Match: string;
  Secret: string;
}

export async function runGitleaks(target: ScanTarget): Promise<ScanModuleResult> {
  const start = Date.now();
  const outputPath = join(target.localPath, ".gitleaks-report.json");

  try {
    // --no-git: also scans the directory as a plain filesystem, not just git history,
    // to cover zip uploads that don't have a .git folder
    await execa(
      "gitleaks",
      [
        "detect",
        "--source",
        target.localPath,
        "--report-format",
        "json",
        "--report-path",
        outputPath,
        "--no-banner",
        "--exit-code",
        "0", // don't fail the process on findings — we want the report regardless
      ],
      { reject: false, timeout: 5 * 60 * 1000 }
    );

    const raw = await readFile(outputPath, "utf-8").catch(() => "[]");
    const parsed: GitleaksFinding[] = JSON.parse(raw || "[]");

    const findings: NormalizedFinding[] = parsed.map((f) => ({
      tool: "gitleaks",
      ruleId: f.RuleID,
      severity: "CRITICAL", // a leaked secret is always critical by default
      category: "SECRET_LEAK",
      title: `Exposed secret: ${f.RuleID}`,
      description: f.Description,
      filePath: f.File.replace(target.localPath, "").replace(/^\//, ""),
      lineStart: f.StartLine,
      lineEnd: f.EndLine,
      // Never expose the real secret in the report — mask it
      codeSnippet: f.Secret ? f.Secret.slice(0, 4) + "****REDACTED****" : undefined,
      remediation:
        "Revoke this credential immediately (it should be considered compromised even if the commit is later removed). " +
        "Move the secret to a vault (Vault, AWS/Azure Secrets Manager, or environment variables on the deploy provider). " +
        "Rewrite git history if the secret was already committed (git filter-repo or BFG Repo-Cleaner) and force-push.",
    }));

    return { tool: "gitleaks", status: "success", findings, rawOutput: parsed, durationMs: Date.now() - start };
  } catch (err) {
    return {
      tool: "gitleaks",
      status: "failed",
      findings: [],
      errorMessage: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    };
  }
}
