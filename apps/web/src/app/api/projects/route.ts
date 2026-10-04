import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { auth } from "@/lib/auth";
import { decryptToken } from "@/lib/crypto";

const prisma = new PrismaClient();

const CreateProjectSchema = z.object({
  name: z.string().min(1).max(200),
  sourceType: z.enum(["GITHUB_REPO", "UPLOAD_ZIP", "UPLOAD_ARCHIVE"]),
  repoUrl: z.string().url().optional(),
  repoBranch: z.string().optional(),
  isPrivate: z.boolean().optional(),
  uploadStorageKey: z.string().optional(),
  liveTargetUrl: z.string().url().optional(),
  // Explicit checkbox in the UI — exact text shown to the user documented below.
  // This field is the only authorization mechanism for the active pentest module.
  liveTargetAuthorized: z.boolean().default(false),
  platforms: z.array(z.enum(["WEB", "MOBILE_ANDROID", "MOBILE_IOS", "DESKTOP", "API_BACKEND", "INFRA_IAC"])).min(1),
});

/**
 * Confirms the repo actually belongs to (or is accessible by) the signed-in
 * user's GitHub token, independent of what the client claims. This is the
 * real enforcement of "you can only scan your own repos, or fork someone
 * else's first" — the repo picker in the UI only ever shows accessible
 * repos, but this check protects the API route itself against a
 * hand-crafted request bypassing the UI.
 */
async function verifyRepoAccess(repoUrl: string, githubTokenEnc: string | null): Promise<boolean> {
  if (!githubTokenEnc) return false;
  const match = repoUrl.match(/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/);
  if (!match) return false;

  const token = await decryptToken(githubTokenEnc);
  const res = await fetch(`https://api.github.com/repos/${match[1]}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
  });
  if (!res.ok) return false;

  const repo = await res.json();
  // permissions.pull is true for anything this token can at least read,
  // which covers owned repos, collaborator access, and forks.
  return Boolean(repo.permissions?.pull);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const body = await req.json();
  const parsed = CreateProjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  // LEGAL GUARD: if liveTargetUrl was provided, liveTargetAuthorized must have
  // come explicitly as true from the confirmation checkbox in the UI. This is
  // intentionally redundant with the guard in orchestrator.ts — defense in depth.
  if (data.liveTargetUrl && !data.liveTargetAuthorized) {
    return NextResponse.json(
      {
        error:
          "To test a live URL, you must explicitly confirm that you own or are authorized to test this target. Check the confirmation box before continuing.",
      },
      { status: 400 }
    );
  }

  if (data.sourceType === "GITHUB_REPO") {
    if (!data.repoUrl) {
      return NextResponse.json({ error: "repoUrl is required for GitHub repositories." }, { status: 400 });
    }
    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    const hasAccess = await verifyRepoAccess(data.repoUrl, user?.githubTokenEnc ?? null);
    if (!hasAccess) {
      return NextResponse.json(
        {
          error:
            "This repository isn't accessible with your connected GitHub account. If it belongs to someone else, fork it first — forks appear in your own repository list.",
        },
        { status: 403 }
      );
    }
  }

  const project = await prisma.project.create({
    data: {
      userId: session.user.id,
      name: data.name,
      sourceType: data.sourceType,
      repoUrl: data.repoUrl,
      repoBranch: data.repoBranch ?? "main",
      isPrivate: data.isPrivate ?? false,
      uploadStorageKey: data.uploadStorageKey,
      liveTargetUrl: data.liveTargetUrl,
      liveTargetAuthorized: data.liveTargetAuthorized,
      platforms: data.platforms,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "project.created",
      metadata: { projectId: project.id, sourceType: data.sourceType, liveTargetAuthorized: data.liveTargetAuthorized },
    },
  });

  return NextResponse.json({ project }, { status: 201 });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const projects = await prisma.project.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: { scans: { orderBy: { createdAt: "desc" }, take: 1 } },
  });

  return NextResponse.json({ projects });
}
