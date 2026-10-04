import Link from "next/link";
import { notFound } from "next/navigation";
import { PrismaClient } from "@prisma/client";
import { redirect } from "next/navigation";
import { ArrowLeft, Clock, Lock, Globe } from "lucide-react";
import { auth } from "@/lib/auth";
import { RunScanButton } from "@/components/RunScanButton";

const prisma = new PrismaClient();

const STATUS_STYLES: Record<string, string> = {
  COMPLETED: "text-emerald-400 bg-emerald-950/30 border-emerald-500/30",
  FAILED: "text-red-400 bg-red-950/30 border-red-500/30",
  QUEUED: "text-slate-400 bg-slate-800/30 border-slate-600",
};

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: { scans: { orderBy: { createdAt: "desc" } } },
  });

  // Every project is strictly scoped to its owner — there is no public
  // viewing path, matching the "always require login" policy.
  if (!project || project.userId !== session.user.id) notFound();

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link
        href="/dashboard"
        className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </Link>

      <div className="flex items-start justify-between gap-4 mb-2">
        <h1 className="text-2xl font-semibold text-slate-100">{project.name}</h1>
        <RunScanButton projectId={project.id} />
      </div>
      {project.repoUrl && (
        <p className="text-sm text-slate-500 mb-1 break-all flex items-center gap-1.5">
          {project.isPrivate ? (
            <Lock className="h-3.5 w-3.5 text-amber-500 shrink-0" />
          ) : (
            <Globe className="h-3.5 w-3.5 text-slate-600 shrink-0" />
          )}
          {project.repoUrl}
        </p>
      )}
      <div className="flex flex-wrap gap-1.5 mb-8">
        {project.platforms.map((p: string) => (
          <span key={p} className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded">
            {p}
          </span>
        ))}
      </div>

      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">
        Scan history
      </h2>

      {project.scans.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-slate-800 rounded-lg text-slate-500 text-sm">
          No scans yet — click &ldquo;Run scan&rdquo; to get started.
        </div>
      ) : (
        <div className="space-y-2">
          {project.scans.map((scan: { id: string; createdAt: Date; status: string; totalFindings: number }) => (
            <Link
              key={scan.id}
              href={`/scans/${scan.id}`}
              className="flex items-center justify-between bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-lg px-4 py-3 transition-colors"
            >
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Clock className="h-3.5 w-3.5" />
                {new Date(scan.createdAt).toLocaleString()}
              </div>
              <div className="flex items-center gap-3">
                {scan.status === "COMPLETED" && (
                  <span className="text-xs text-slate-500">
                    {scan.totalFindings} finding{scan.totalFindings === 1 ? "" : "s"}
                  </span>
                )}
                <span
                  className={`text-xs px-2 py-0.5 rounded-full border ${
                    STATUS_STYLES[scan.status] ?? "text-blue-400 bg-blue-950/30 border-blue-500/30"
                  }`}
                >
                  {scan.status}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
