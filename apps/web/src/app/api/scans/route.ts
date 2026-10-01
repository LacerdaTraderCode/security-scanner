import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { Queue } from "bullmq";
import { auth } from "@/lib/auth";
import { decryptToken } from "@/lib/crypto";
import type { ScanModule } from "@scanner/shared/types/finding";

const prisma = new PrismaClient();

const connection = {
  host: process.env.REDIS_HOST ?? "localhost",
  port: Number(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD,
};

const scanQueue = new Queue("security-scans", { connection });

const CreateScanSchema = z.object({
  projectId: z.string(),
  // If omitted, the system picks modules automatically by platform
  // (see resolveModulesForPlatforms below).
  modulesRequested: z.array(z.string()).optional(),
});

/** Picks the default modules based on the project's declared platforms */
function resolveModulesForPlatforms(platforms: string[], hasLiveTarget: boolean): ScanModule[] {
  const modules = new Set<ScanModule>(["semgrep", "gitleaks", "osv-scanner", "deep-checks"]);

  if (platforms.includes("MOBILE_ANDROID") || platforms.includes("MOBILE_IOS")) {
    modules.add("mobsf");
  }
  if (platforms.includes("INFRA_IAC")) {
    modules.add("trivy-iac");
  }
  if (hasLiveTarget) {
    modules.add("nuclei");
  }

  return Array.from(modules);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const body = await req.json();
  const parsed = CreateScanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const project = await prisma.project.findUnique({ where: { id: parsed.data.projectId } });
  if (!project || project.userId !== session.user.id) {
    return NextResponse.json({ error: "Project not found or access denied." }, { status: 404 });
  }

  const modulesRequested =
    (parsed.data.modulesRequested as ScanModule[]) ??
    resolveModulesForPlatforms(project.platforms, Boolean(project.liveTargetUrl && project.liveTargetAuthorized));

  const scan = await prisma.scan.create({
    data: {
      projectId: project.id,
      status: "QUEUED",
      modulesRequested,
    },
  });

  // Decrypt the GitHub token only at the moment of enqueueing, and it travels
  // to the worker via the queue payload (internal Redis, not exposed) — it
  // never goes back to plaintext in the database.
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  const githubToken = user?.githubTokenEnc ? await decryptToken(user.githubTokenEnc) : undefined;

  await scanQueue.add("run-scan", {
    scanId: scan.id,
    projectId: project.id,
    sourceType: project.sourceType,
    repoUrl: project.repoUrl,
    repoBranch: project.repoBranch,
    githubToken,
    uploadStorageKey: project.uploadStorageKey,
    liveTargetUrl: project.liveTargetUrl,
    liveTargetAuthorized: project.liveTargetAuthorized,
    platforms: project.platforms,
    modulesRequested,
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "scan.started",
      metadata: { scanId: scan.id, projectId: project.id, modulesRequested },
    },
  });

  return NextResponse.json({ scan }, { status: 201 });
}
