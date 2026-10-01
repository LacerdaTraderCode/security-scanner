import { Worker, Job } from "bullmq";
import { PrismaClient, ScanStatus } from "@prisma/client";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execa } from "execa";
import { runScanPipeline } from "@scanner/scanners/orchestrator";
import { generateFixPromptsBatch } from "@scanner/report-engine/claude-prompt-generator";
import type { ScanModule, ScanTarget } from "@scanner/shared/types/finding";

const prisma = new PrismaClient();

const connection = {
  host: process.env.REDIS_HOST ?? "localhost",
  port: Number(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD,
};

export interface ScanJobData {
  scanId: string;
  projectId: string;
  sourceType: "GITHUB_REPO" | "UPLOAD_ZIP" | "UPLOAD_ARCHIVE" | "PUBLIC_URL_ONLY";
  repoUrl?: string;
  repoBranch?: string;
  /** Decrypted GitHub token — comes from the worker-runner, never log this */
  githubToken?: string;
  uploadStorageKey?: string;
  liveTargetUrl?: string;
  liveTargetAuthorized: boolean;
  platforms: ScanTarget["platforms"];
  modulesRequested: ScanModule[];
}

async function updateScanStatus(scanId: string, status: ScanStatus, extra?: Record<string, unknown>) {
  await prisma.scan.update({ where: { id: scanId }, data: { status, ...extra } });
}

/**
 * Prepares the source code locally: clones via git (with token if private) or
 * extracts an already-uploaded zip/7z from storage. Returns the local temp path.
 */
async function prepareSource(job: ScanJobData, workDir: string): Promise<string> {
  const codePath = join(workDir, "source");

  if (job.sourceType === "GITHUB_REPO" && job.repoUrl) {
    const authedUrl = job.githubToken
      ? job.repoUrl.replace("https://", `https://x-access-token:${job.githubToken}@`)
      : job.repoUrl;

    await execa("git", ["clone", "--depth", "1", "--branch", job.repoBranch ?? "main", authedUrl, codePath], {
      timeout: 5 * 60 * 1000,
    });
    return codePath;
  }

  if ((job.sourceType === "UPLOAD_ZIP" || job.sourceType === "UPLOAD_ARCHIVE") && job.uploadStorageKey) {
    // Download from storage (S3/R2) — storage client implementation lives in
    // apps/worker/src/storage-client.ts (see separate file)
    const { downloadAndExtract } = await import("./storage-client");
    await downloadAndExtract(job.uploadStorageKey, codePath);
    return codePath;
  }

  throw new Error(`No source code provided or unsupported source type: ${job.sourceType}`);
}

export const scanWorker = new Worker<ScanJobData>(
  "security-scans",
  async (job: Job<ScanJobData>) => {
    const { scanId } = job.data;
    const startedAt = new Date();
    let workDir: string | null = null;

    try {
      await updateScanStatus(scanId, "CLONING", { startedAt });
      workDir = await mkdtemp(join(tmpdir(), "scan-"));
      const codePath = await prepareSource(job.data, workDir);

      const target: ScanTarget = {
        localPath: codePath,
        platforms: job.data.platforms,
        liveTargetUrl: job.data.liveTargetAuthorized ? job.data.liveTargetUrl : undefined,
      };

      await updateScanStatus(scanId, "RUNNING_SAST");

      const moduleResults = await runScanPipeline({
        target,
        modulesRequested: job.data.modulesRequested,
        liveTargetAuthorized: job.data.liveTargetAuthorized,
        onModuleComplete: async (result) => {
          // Persist the ToolRun as soon as each module finishes —
          // this lets the dashboard show live progress.
          await prisma.toolRun.create({
            data: {
              scanId,
              tool: result.tool,
              status: result.status,
              finishedAt: new Date(),
              errorMessage: result.errorMessage,
            },
          });
        },
      });

      await updateScanStatus(scanId, "GENERATING_REPORT");

      const allFindings = moduleResults.flatMap((r) => r.findings);

      // Generate fix prompts in batch (only for real findings, not skipped)
      const promptMap = await generateFixPromptsBatch(allFindings);

      await prisma.finding.createMany({
        data: allFindings.map((f) => ({
          scanId,
          tool: f.tool,
          ruleId: f.ruleId,
          severity: f.severity,
          category: f.category,
          title: f.title,
          description: f.description,
          filePath: f.filePath,
          lineStart: f.lineStart,
          lineEnd: f.lineEnd,
          packageName: f.packageName,
          packageVersion: f.packageVersion,
          cveId: f.cveId,
          cvssScore: f.cvssScore,
          endpointUrl: f.endpointUrl,
          httpMethod: f.httpMethod,
          codeSnippet: f.codeSnippet,
          remediation: f.remediation,
          claudePrompt: promptMap.get(f),
          isStructuralOnly: f.isStructuralOnly ?? false,
        })),
      });

      const counts = {
        criticalCount: allFindings.filter((f) => f.severity === "CRITICAL").length,
        highCount: allFindings.filter((f) => f.severity === "HIGH").length,
        mediumCount: allFindings.filter((f) => f.severity === "MEDIUM").length,
        lowCount: allFindings.filter((f) => f.severity === "LOW").length,
        infoCount: allFindings.filter((f) => f.severity === "INFO").length,
      };

      await updateScanStatus(scanId, "COMPLETED", {
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt.getTime(),
        totalFindings: allFindings.length,
        ...counts,
      });
    } catch (err) {
      await updateScanStatus(scanId, "FAILED", {
        finishedAt: new Date(),
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      throw err;
    } finally {
      if (workDir) await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  },
  { connection, concurrency: Number(process.env.WORKER_CONCURRENCY ?? 2) }
);

scanWorker.on("failed", (job, err) => {
  console.error(`Scan job ${job?.id} failed:`, err.message);
});

console.log("Scan worker started, waiting for jobs on the 'security-scans' queue...");
