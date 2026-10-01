# Production deployment — step by step

## 1. Database (Neon)

1. Create an account at https://neon.tech, new Postgres project.
2. Copy the connection string → `DATABASE_URL`.
3. Run migrations from your local machine (with `.env` pointing at Neon):
   ```bash
   pnpm db:migrate
   ```

## 2. Queue (Upstash Redis)

1. Create an account at https://upstash.com, new Redis database (use "Regional"
   mode, not "Global", for consistency with the worker).
2. Copy host, port, and password → `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`.

## 3. Upload storage (Cloudflare R2)

1. Create an R2 bucket in the Cloudflare dashboard.
2. Generate an API token with read/write permission on the bucket.
3. Fill in `STORAGE_ENDPOINT` (format `https://<account_id>.r2.cloudflarestorage.com`),
   `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`, `STORAGE_BUCKET`.

## 4. GitHub OAuth App

1. https://github.com/settings/developers → New OAuth App.
2. Homepage URL: `https://YOUR_DOMAIN`
3. Authorization callback URL: `https://YOUR_DOMAIN/api/auth/callback/github`
4. Copy the Client ID and generate a Client Secret → `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`.

## 5. Web (Vercel)

1. Import the repository into Vercel.
2. Root Directory: `apps/web`
3. Build Command: `cd ../.. && pnpm install && pnpm --filter @scanner/web build`
4. Add every env var from `.env.example` (except the worker/local-MobSF-specific ones).
5. Deploy.

## 6. Worker (Railway)

1. New Railway project, "Deploy from GitHub repo".
2. Configure it to build using `apps/worker/Dockerfile` (Railway auto-detects this
   if you point it at the monorepo root and the Dockerfile path).
3. Add the same env vars (`DATABASE_URL`, `REDIS_*`, `ANTHROPIC_API_KEY`, `MOBSF_URL`,
   `MOBSF_API_KEY`).
4. No HTTP port needs to be exposed — this is a queue worker, not a web server.

Alternative: Render, using "Background Worker" as the service type (not
"Web Service"), same Dockerfile.

## 7. MobSF (Railway or Render, separate service)

1. New service from the public Docker image `opensecurity/mobile-security-framework-mobsf:latest`.
2. Expose port 8000.
3. Set `MOBSF_API_KEY` to a strong value (this will be the same value used in the worker).
4. Copy the generated public URL → `MOBSF_URL` in the worker.

## 8. Final check

Once everything is live:
1. Open the dashboard, sign in with GitHub.
2. Create a test project pointing at a small public repository.
3. Trigger a scan and watch the status move from `QUEUED` → `COMPLETED` on the scan page.
4. If something gets stuck in `RUNNING_*`, check the worker logs on Railway/Render — it's
   likely a CLI tool that failed to install in the Docker image.

## Expected costs (free tiers)

- Vercel Hobby: free for personal use.
- Neon: free up to 0.5 GB of storage.
- Upstash: free up to 10k commands/day.
- Railway: trial credits, then usage-based billing (a worker running 24/7 is the
  project's main real recurring cost).
- Cloudflare R2: free up to 10 GB/month, no egress fees.

The worker (Railway/Render) is the only component that tends to carry a real
ongoing cost, since it needs to stay always-on to process the queue — everything
else has generous free tiers for personal/low-volume use.
