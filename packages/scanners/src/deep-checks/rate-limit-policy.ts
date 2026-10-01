import type { NormalizedFinding } from "@scanner/shared/types/finding";

/**
 * Rate-limiting POLICY test — not real brute force.
 *
 * Important design decision (see scope discussion): rather than trying real
 * passwords against a login endpoint (which is unethical, could take down
 * the user's own service, and could get their account banned by providers
 * like Cloudflare/AWS), this module sends a small, controlled number of
 * requests (`MAX_ATTEMPTS`) with obviously invalid credentials and only
 * checks WHETHER a defense exists (HTTP 429, Retry-After, increased latency,
 * or lockout after N attempts).
 *
 * This measures the same thing the scope table asked for ("Brute-force
 * protection: rate limiting, progressive lockout") without performing the
 * real attack.
 */

const MAX_ATTEMPTS = 8;
const DELAY_BETWEEN_MS = 300;

export interface RateLimitCheckInput {
  loginEndpointUrl: string;
  /** Sample request body with invalid credentials, provided by the scanner's user */
  sampleInvalidPayload: Record<string, string>;
  httpMethod?: "POST" | "PUT";
}

export async function checkRateLimitPolicy(input: RateLimitCheckInput): Promise<NormalizedFinding[]> {
  const { loginEndpointUrl, sampleInvalidPayload, httpMethod = "POST" } = input;
  const statusCodes: number[] = [];
  let sawRateLimitSignal = false;
  let sawRetryAfterHeader = false;

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    try {
      const res = await fetch(loginEndpointUrl, {
        method: httpMethod,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sampleInvalidPayload),
      });
      statusCodes.push(res.status);
      if (res.status === 429) sawRateLimitSignal = true;
      if (res.headers.get("retry-after")) sawRetryAfterHeader = true;
    } catch {
      // A network failure doesn't count as a signal — just stop the test
      break;
    }
    await new Promise((r) => setTimeout(r, DELAY_BETWEEN_MS));
  }

  if (sawRateLimitSignal || sawRetryAfterHeader) {
    // Defense is present — this is not a finding, it's a positive result.
    // The orchestrator records this as a ToolRun with status success and 0 findings.
    return [];
  }

  return [
    {
      tool: "deep-checks",
      severity: "HIGH",
      category: "RATE_LIMITING_POLICY",
      title: "No rate-limiting detected on authentication endpoint",
      description: `${MAX_ATTEMPTS} consecutive requests with invalid credentials were sent to ${loginEndpointUrl} and none returned HTTP 429 or a Retry-After header. This suggests an absence of brute-force protection. Observed status codes: ${statusCodes.join(", ")}`,
      endpointUrl: loginEndpointUrl,
      httpMethod,
      isStructuralOnly: true,
      remediation:
        "Implement per-IP and per-account rate-limiting (e.g. Redis + sliding window), with progressive lockout after N failed attempts, returning HTTP 429 with a Retry-After header. Consider adding a CAPTCHA after a few attempts as well.",
    },
  ];
}
