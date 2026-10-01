import type { NormalizedFinding } from "@scanner/shared/types/finding";

/**
 * HTTP security header checks against a live URL.
 * There's no well-established open-source tool dedicated solely to this —
 * it's simple enough to implement directly, and gives us full control over
 * the criteria (aligned with the original scope table).
 */

const REQUIRED_HEADERS: Array<{
  header: string;
  validate: (value: string) => boolean;
  severity: NormalizedFinding["severity"];
  advice: string;
}> = [
  {
    header: "strict-transport-security",
    validate: (v) => /max-age=\d+/.test(v),
    severity: "HIGH",
    advice: "Add `Strict-Transport-Security: max-age=31536000; includeSubDomains` to enforce HTTPS.",
  },
  {
    header: "content-security-policy",
    validate: (v) => v.length > 0,
    severity: "HIGH",
    advice: "Define a restrictive Content-Security-Policy (avoid `unsafe-inline` and `unsafe-eval`) to mitigate XSS.",
  },
  {
    header: "x-content-type-options",
    validate: (v) => v.toLowerCase() === "nosniff",
    severity: "MEDIUM",
    advice: "Add `X-Content-Type-Options: nosniff` to prevent MIME sniffing.",
  },
  {
    header: "x-frame-options",
    validate: (v) => /deny|sameorigin/i.test(v),
    severity: "MEDIUM",
    advice: "Add `X-Frame-Options: DENY` or `SAMEORIGIN` (or frame-ancestors in the CSP) against clickjacking.",
  },
];

export async function checkSecurityHeaders(url: string): Promise<NormalizedFinding[]> {
  const findings: NormalizedFinding[] = [];

  let response: Response;
  try {
    response = await fetch(url, { method: "GET", redirect: "follow" });
  } catch (err) {
    return [
      {
        tool: "deep-checks",
        severity: "INFO",
        category: "MISSING_SECURITY_HEADERS",
        title: "Could not connect to the target for header checks",
        description: err instanceof Error ? err.message : String(err),
        remediation: "Verify that the URL is publicly reachable and responds to GET requests.",
      },
    ];
  }

  for (const check of REQUIRED_HEADERS) {
    const value = response.headers.get(check.header);
    if (!value || !check.validate(value)) {
      findings.push({
        tool: "deep-checks",
        severity: check.severity,
        category: "MISSING_SECURITY_HEADERS",
        title: `Missing or misconfigured security header: ${check.header}`,
        description: value
          ? `The ${check.header} header is present but has an inadequate value: "${value}"`
          : `The ${check.header} header was not found in the response.`,
        endpointUrl: url,
        httpMethod: "GET",
        remediation: check.advice,
      });
    }
  }

  // CORS — dedicated check given its own importance
  const acao = response.headers.get("access-control-allow-origin");
  const acac = response.headers.get("access-control-allow-credentials");
  if (acao === "*" && acac?.toLowerCase() === "true") {
    findings.push({
      tool: "deep-checks",
      severity: "CRITICAL",
      category: "SECURITY_MISCONFIGURATION",
      title: "Insecure CORS: Access-Control-Allow-Origin: * combined with credentials: true",
      description:
        "This combination allows any origin to make authenticated requests (with cookies/credentials) against this API — one of the most dangerous CORS misconfigurations possible.",
      endpointUrl: url,
      remediation:
        "Never combine `Access-Control-Allow-Origin: *` with `Access-Control-Allow-Credentials: true`. Explicitly allowlist trusted origins.",
    });
  }

  // Cookies — required flags
  const setCookies = response.headers.get("set-cookie");
  if (setCookies) {
    const missingFlags: string[] = [];
    if (!/httponly/i.test(setCookies)) missingFlags.push("HttpOnly");
    if (!/secure/i.test(setCookies)) missingFlags.push("Secure");
    if (!/samesite/i.test(setCookies)) missingFlags.push("SameSite");

    if (missingFlags.length > 0) {
      findings.push({
        tool: "deep-checks",
        severity: "HIGH",
        category: "BROKEN_AUTH",
        title: `Session cookie missing security flags: ${missingFlags.join(", ")}`,
        description: "Cookies without these flags are vulnerable to theft via XSS (missing HttpOnly), interception over HTTP (missing Secure), or CSRF (missing SameSite).",
        endpointUrl: url,
        remediation: `Configure the cookie with: ${missingFlags.map((f) => `${f}${f === "SameSite" ? "=Strict or Lax" : ""}`).join(", ")}.`,
      });
    }
  }

  return findings;
}
