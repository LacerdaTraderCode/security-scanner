import { runSemgrep } from "./adapters/semgrep";
import { runGitleaks } from "./adapters/gitleaks";
import { runOsvScanner } from "./adapters/osv-scanner";
import { runNuclei } from "./adapters/nuclei";
import { runMobSF } from "./adapters/mobsf";
import { checkSecurityHeaders } from "./deep-checks/security-headers";
import { checkRateLimitPolicy, type RateLimitCheckInput } from "./deep-checks/rate-limit-policy";
import { checkBinaryExposure } from "./deep-checks/binary-exposure";
import type { ScanModule, ScanModuleResult, ScanTarget } from "@scanner/shared/types/finding";

export interface OrchestratorInput {
  target: ScanTarget;
  modulesRequested: ScanModule[];
  /**
   * Explicit authorization guard — must come from the database (project.liveTargetAuthorized).
   * The orchestrator refuses to run any active DAST module (nuclei, rate-limit-policy)
   * without this, regardless of what's in modulesRequested. This is the only line of
   * defense against unauthorized testing of third-party targets — do not remove it.
   */
  liveTargetAuthorized: boolean;
  /** Only required if the rate-limit-policy module is requested */
  rateLimitCheckInput?: RateLimitCheckInput;
  /** Optional callback for progress reporting (used by the worker to update status in the database) */
  onModuleComplete?: (result: ScanModuleResult) => Promise<void> | void;
}

export async function runScanPipeline(input: OrchestratorInput): Promise<ScanModuleResult[]> {
  const { target, modulesRequested, liveTargetAuthorized, rateLimitCheckInput, onModuleComplete } = input;
  const results: ScanModuleResult[] = [];

  const emit = async (r: ScanModuleResult) => {
    results.push(r);
    await onModuleComplete?.(r);
  };

  // ── Static modules (always safe, don't depend on live-target authorization) ──

  if (modulesRequested.includes("semgrep")) {
    await emit(await runSemgrep(target));
  }

  if (modulesRequested.includes("gitleaks")) {
    await emit(await runGitleaks(target));
  }

  if (modulesRequested.includes("osv-scanner")) {
    await emit(await runOsvScanner(target));
  }

  if (modulesRequested.includes("mobsf") && target.platforms.some((p) => p === "MOBILE_ANDROID" || p === "MOBILE_IOS")) {
    await emit(await runMobSF(target));
  }

  if (modulesRequested.includes("deep-checks") && target.platforms.some((p) => p === "DESKTOP" || p === "MOBILE_ANDROID" || p === "MOBILE_IOS")) {
    const start = Date.now();
    try {
      const findings = await checkBinaryExposure(target.localPath);
      await emit({ tool: "deep-checks-binary", status: "success", findings, durationMs: Date.now() - start });
    } catch (err) {
      await emit({
        tool: "deep-checks-binary",
        status: "failed",
        findings: [],
        errorMessage: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
      });
    }
  }

  // ── Active modules (DAST) — REQUIRE liveTargetAuthorized === true ──

  if (!liveTargetAuthorized) {
    if (modulesRequested.includes("nuclei") || target.liveTargetUrl) {
      await emit({
        tool: "nuclei",
        status: "skipped",
        findings: [],
        errorMessage: "Active pentest not executed: the project does not have liveTargetAuthorized=true. The user must explicitly confirm they own or are authorized to test the target.",
        durationMs: 0,
      });
    }
    return results;
  }

  if (modulesRequested.includes("nuclei") && target.liveTargetUrl) {
    await emit(await runNuclei(target));
  }

  if (modulesRequested.includes("deep-checks") && target.liveTargetUrl) {
    const start = Date.now();
    const findings = await checkSecurityHeaders(target.liveTargetUrl);
    await emit({ tool: "deep-checks-headers", status: "success", findings, durationMs: Date.now() - start });

    if (rateLimitCheckInput) {
      const rlStart = Date.now();
      const rlFindings = await checkRateLimitPolicy(rateLimitCheckInput);
      await emit({ tool: "deep-checks-ratelimit", status: "success", findings: rlFindings, durationMs: Date.now() - rlStart });
    }
  }

  return results;
}
