# Worker Dockerfile — intentionally heavy: it contains every open-source
# security tool the orchestrator invokes via CLI.
# Recommended deploy target: Railway or Render (always-on container), NOT
# Vercel (serverless doesn't support persistent binaries or long-running jobs).

FROM node:20-bookworm AS base

# ── System dependencies for the security tools ──
RUN apt-get update && apt-get install -y \
    curl \
    git \
    unzip \
    p7zip-full \
    python3 \
    python3-pip \
    binutils \
    file \
    golang-go \
    && rm -rf /var/lib/apt/lists/*

# ── Semgrep (via pip) ──
RUN pip3 install --break-system-packages semgrep

# ── Gitleaks ──
RUN curl -sSL https://github.com/gitleaks/gitleaks/releases/latest/download/gitleaks_8.18.4_linux_x64.tar.gz \
    -o /tmp/gitleaks.tar.gz \
    && tar -xzf /tmp/gitleaks.tar.gz -C /usr/local/bin gitleaks \
    && rm /tmp/gitleaks.tar.gz

# ── OSV-Scanner ──
RUN go install github.com/google/osv-scanner/cmd/osv-scanner@latest \
    && cp /root/go/bin/osv-scanner /usr/local/bin/

# ── Nuclei + templates ──
RUN go install github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest \
    && cp /root/go/bin/nuclei /usr/local/bin/ \
    && nuclei -update-templates -silent || true

# ── Trivy (SCA + IaC) ──
RUN curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin

# ── Checkov (IaC) ──
RUN pip3 install --break-system-packages checkov

# MobSF runs as its own separate Docker service (see docker-compose.yml at
# the repo root), it is not installed in this image — the worker talks to it
# over HTTP.

WORKDIR /app

COPY package.json pnpm-workspace.yaml ./
COPY apps/worker ./apps/worker
COPY packages ./packages

RUN corepack enable && pnpm install --frozen-lockfile

WORKDIR /app/apps/worker

CMD ["pnpm", "start"]
