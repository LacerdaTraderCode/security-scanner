import Link from "next/link";
import { redirect } from "next/navigation";
import { PrismaClient, type Project } from "@prisma/client";
import { auth, signOut } from "@/lib/auth";
import { Plus, ShieldCheck, LogOut, FolderGit2 } from "lucide-react";

const prisma = new PrismaClient();

const PLATFORM_LABELS: Record<string, string> = {
  WEB: "Web",
  MOBILE_ANDROID: "Android",
  MOBILE_IOS: "iOS",
  DESKTOP: "Desktop",
  API_BACKEND: "API",
  INFRA_IAC: "IaC",
};

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const projects = await prisma.project.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: { scans: { orderBy: { createdAt: "desc" }, take: 1 } },
  });

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-emerald-400" />
          <span className="font-semibold text-slate-100">Security Scanner</span>
        </div>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </form>
      </div>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-slate-100">Your projects</h1>
        <Link
          href="/projects/new"
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="h-4 w-4" />
          New project
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-slate-800 rounded-lg">
          <FolderGit2 className="h-10 w-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 mb-4">No projects yet.</p>
          <Link
            href="/projects/new"
            className="text-emerald-400 hover:text-emerald-300 text-sm font-medium underline underline-offset-4"
          >
            Create your first project
          </Link>
        </div>
      ) : (
        <div className="grid gap-3">
          {projects.map((project: Project & { scans: { status: string }[] }) => {
            const lastScan = project.scans[0];
            return (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="block bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-lg p-4 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-medium text-slate-100">{project.name}</h2>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {project.platforms.map((p: string) => (
                        <span
                          key={p}
                          className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded"
                        >
                          {PLATFORM_LABELS[p] ?? p}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {lastScan ? (
                      <>
                        <div className="text-xs text-slate-500">Last scan</div>
                        <div
                          className={`text-sm font-medium ${
                            lastScan.status === "COMPLETED"
                              ? "text-emerald-400"
                              : lastScan.status === "FAILED"
                              ? "text-red-400"
                              : "text-blue-400"
                          }`}
                        >
                          {lastScan.status}
                        </div>
                      </>
                    ) : (
                      <div className="text-sm text-slate-500">Never scanned</div>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
