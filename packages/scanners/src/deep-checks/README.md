# deep-checks

An in-house module (not a wrapper around a third-party tool) covering three
points from the original scope that either have no adequate dedicated
open-source tool, or that by nature require a structural/controlled approach
instead of a real exploitation test.

## 1. `security-headers.ts`
Checks HTTP security headers (HSTS, CSP, X-Frame-Options, X-Content-Type-Options),
CORS configuration, and cookie flags (HttpOnly/Secure/SameSite) against a live
URL. This runs as part of the active pentest flow — only executes with
`liveTargetAuthorized: true`.

## 2. `rate-limit-policy.ts`
**Not real brute force.** Sends a small, fixed number of requests (8 by
default) with invalid credentials and checks whether the endpoint returns
HTTP 429 / a Retry-After header. Measures the *existence* of the defense
without performing a real attack — avoiding the risk of taking down the
user's own service or triggering automatic WAF/Cloudflare bans.

## 3. `binary-exposure.ts`
**Not real reverse engineering.** Runs `file` and `strings` over compiled
binaries (Desktop: .exe/.dll/.so/.dylib; Mobile: handled inside MobSF) to
detect structural signals: unstripped debug symbols, plaintext secrets/keys
baked into the binary, exposed internal URLs or developer paths. It's an
automatable heuristic scan, not a security researcher's manual analysis.

## Why this is marked `isStructuralOnly: true`

Every finding from these three modules carries this flag in
`NormalizedFinding`. The dashboard shows a distinct visual badge to make it
clear to the user: this is a signal that something might be wrong, not proof
of successful exploitation. Being honest about this distinction matters — the
goal is to provide real value without overpromising coverage the tool doesn't
actually have.
