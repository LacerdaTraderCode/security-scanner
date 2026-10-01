# Security Scanner

Multi-platform security analysis platform — Web, Mobile (Android/iOS), and Desktop —
with static analysis (SAST), dependency analysis (SCA), secret detection, active
pentest (DAST) against authorized URLs, and automatic generation of fix prompts
ready to paste into Claude / Claude Code.

## What this project covers

| Category | Tool(s) |
|---|---|
| General-purpose SAST (injection, XSS, SSRF, weak crypto) | [Semgrep](https://semgrep.dev) |
| Secrets in code and git history | [Gitleaks](https://github.com/gitleaks/gitleaks) |
| Vulnerable dependencies (CVEs) + SBOM | [OSV-Scanner](https://github.com/google/osv-scanner), [Trivy](https://trivy.dev) |
| Mobile (Android/iOS) — storage, keychain, exported components, SSL pinning | [MobSF](https://mobsf.github.io/docs/) |
| Active pentest (DAST) against an authorized URL | [Nuclei](https://nuclei.projectdiscovery.io) |
| Infrastructure as code (Dockerfile, Terraform, K8s) | [Checkov](https://www.checkov.io), Trivy IaC |
| Security headers, CORS, cookies | In-house module (`deep-checks`) |
| Rate-limiting policy (no real brute force) | In-house module (`deep-checks`) |
| Structural binary exposure (Desktop/Mobile) | In-house module (`deep-checks`) |
| Fix prompt generation per finding | Claude API (Anthropic) |

For every finding, the system automatically generates a specific, ready-to-paste
prompt for Claude Code, including the file, line, code snippet, and the expected fix.

## Important — about the active pentest module

The active pentest (Nuclei + policy checks) only runs when the user explicitly
confirms they own or are authorized to test the given URL
(`liveTargetAuthorized = true`). This guard exists in two independent layers (the
API route and the orchestrator) and must not be removed — testing third-party
systems without authorization is illegal in most jurisdictions.

The `deep-checks` module (rate-limiting, binary exposure) performs **structural/
heuristic** analysis, not proof of real exploitation — its findings are marked
with `isStructuralOnly: true` throughout the system and shown with a distinct
visual badge on the dashboard.

## Architecture

```
apps/
  web/        → Next.js — dashboard, auth (GitHub OAuth + PAT), API routes. Deploy: Vercel.
  worker/     → Processes the scan queue, runs the tools via CLI/API. Deploy: Railway/Render (container).
packages/
  shared/     → Prisma schema (database), shared types (NormalizedFinding).
  scanners/   → Adapters for each tool + pipeline orchestrator.
  report-engine/ → Fix prompt generation via Claude API.
```

Why not everything on Vercel: security scans can take minutes (clone + multiple
tools running), which exceeds serverless function execution limits. The worker
runs separately, always on, consuming a queue (Redis/BullMQ).

## Running locally

```bash
cp .env.example .env
# fill in DATABASE_URL, GITHUB_CLIENT_ID/SECRET, ANTHROPIC_API_KEY, ENCRYPTION_SECRET, NEXTAUTH_SECRET

corepack enable
pnpm install

# spin up Postgres, Redis, and MobSF locally
docker compose up -d redis postgres mobsf

pnpm db:generate
pnpm db:migrate

# in two terminals:
pnpm dev          # Next.js at http://localhost:3000
pnpm worker:dev    # scan worker
```

The worker needs the CLI tools installed locally (semgrep, gitleaks, osv-scanner,
nuclei, trivy) — to run without installing anything on your machine, use
`docker compose up worker`, which builds the image with everything included
(see `apps/worker/Dockerfile`).

## Production deployment

1. **Web (dashboard)** → Vercel, connecting this repository, root directory `apps/web`.
2. **Worker** → Railway or Render, using `apps/worker/Dockerfile`. Set the same env vars.
3. **MobSF** → its own container on Railway/Render using the `opensecurity/mobile-security-framework-mobsf` image.
4. **Database** → Neon or Supabase (Postgres).
5. **Queue** → Upstash Redis.
6. **Upload storage** → Cloudflare R2 or AWS S3.

See `docs/DEPLOY.md` for the detailed step-by-step for each provider.

## This project's own security practices

- GitHub tokens (OAuth and manual PAT) are always encrypted (AES-256-GCM)
  before hitting the database — see `apps/web/src/lib/crypto.ts`.
- No detected secret is ever stored in plaintext in findings — values are masked.
- Every active scan against a URL requires explicit authorization confirmation,
  audited in `AuditLog`.

## Known limitations

- Real binary reverse engineering, real brute-force testing, and production
  runtime RASP **are not covered by nature** (they aren't safely/ethically
  automatable). The `deep-checks` module covers structural/heuristic versions
  of these three points — see the README under `packages/scanners/src/deep-checks/`.
- MobSF requires a compiled build (`.apk`/`.ipa`) — it does not analyze
  Android/iOS source projects directly.

## License

MIT
