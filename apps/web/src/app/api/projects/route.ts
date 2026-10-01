import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { auth } from "@/lib/auth";

const prisma = new PrismaClient();

const CreateProjectSchema = z.object({
  name: z.string().min(1).max(200),
  sourceType: z.enum(["GITHUB_REPO", "UPLOAD_ZIP", "UPLOAD_ARCHIVE", "PUBLIC_URL_ONLY"]),
  repoUrl: z.string().url().optional(),
  repoBranch: z.string().optional(),
  uploadStorageKey: z.string().optional(),
  liveTargetUrl: z.string().url().optional(),
  // Explicit checkbox in the UI — exact text shown to the user documented below.
  // This field is the only authorization mechanism for the active pentest module.
  liveTargetAuthorized: z.boolean().default(false),
  platforms: z.array(z.enum(["WEB", "MOBILE_ANDROID", "MOBILE_IOS", "DESKTOP", "API_BACKEND", "INFRA_IAC"])).min(1),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  const body = await req.json();
  const parsed = CreateProjectSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;

  // Public repositories don't require login — everything else does.
  if (data.sourceType !== "PUBLIC_URL_ONLY" && !session?.user) {
    return NextResponse.json({ error: "Authentication required for this source type." }, { status: 401 });
  }

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

  // Without a userId (anonymous public flow): creating a "ghost" user tied to
  // a browser session would be an option, but for simplicity and auditability
  // we require at least an anonymous email/temporary session. Here we assume
  // the frontend always creates an anonymous session before reaching this
  // route (guest-session implementation lives in apps/web/src/lib/guest-session.ts).
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "User session not found." }, { status: 401 });
  }

  const project = await prisma.project.create({
    data: {
      userId,
      name: data.name,
      sourceType: data.sourceType,
      repoUrl: data.repoUrl,
      repoBranch: data.repoBranch ?? "main",
      uploadStorageKey: data.uploadStorageKey,
      liveTargetUrl: data.liveTargetUrl,
      liveTargetAuthorized: data.liveTargetAuthorized,
      platforms: data.platforms,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId,
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
