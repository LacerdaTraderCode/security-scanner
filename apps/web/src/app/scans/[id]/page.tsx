import { PrismaClient, type Finding, type ToolRun } from "@prisma/client";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { FindingCard } from "@/components/FindingCard";

const prisma = new PrismaClient();

const SEVERITY_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"] as const;

export default async function ScanResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) notFound();
  const { id } = await params;

  const scan = await prisma.scan.findUnique({
    where: { id },
    include: {
      project: true,
      toolRuns: true,
      findings: true,
    },
  });

  if (!scan || scan.project.userId !== session.user.id) notFound();

  const findingsBySeverity = SEVERITY_ORDER.map((sev) => ({
    severity: sev,
    findings: scan.findings.filter((f: Finding) => f.severity === sev),
  })).filter((g) => g.findings.length > 0);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-100">{scan.project.name}</h1>
        <p className="text-slate-400 text-sm mt-1">
          Scan #{scan.id.slice(0, 8)} · {scan.status} · {scan.modulesRequested.join(", ")}
        </p>
      </div>

      {/* Summary — the quick overview the user asked for: "show everything found" */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Critical", count: scan.criticalCount, color: "text-red-400" },
          { label: "High", count: scan.highCount, color: "text-orange-400" },
          { label: "Medium", count: scan.mediumCount, color: "text-yellow-400" },
          { label: "Low", count: scan.lowCount, color: "text-blue-400" },
          { label: "Info", count: scan.infoCount, color: "text-slate-400" },
        ].map((s) => (
          <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-lg p-4 text-center">
            <div className={`text-3xl font-bold ${s.color}`}>{s.count}</div>
            <div className="text-xs text-slate-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Status of each tool that ran */}
      <div className="flex flex-wrap gap-2">
        {scan.toolRuns.map((run: ToolRun) => (
          <span
            key={run.id}
            className={`text-xs px-2 py-1 rounded-full border ${
              run.status === "success"
                ? "border-green-500/30 text-green-400 bg-green-950/30"
                : run.status === "skipped"
                ? "border-slate-600 text-slate-400 bg-slate-800/30"
                : "border-red-500/30 text-red-400 bg-red-950/30"
            }`}
          >
            {run.tool}: {run.status}
          </span>
        ))}
      </div>

      {scan.status !== "COMPLETED" && (
        <div className="bg-blue-950/30 border border-blue-500/30 rounded-lg p-4 text-blue-300 text-sm">
          Scan in progress — this page refreshes automatically. Current status: {scan.status}
        </div>
      )}

      {/* Findings grouped by severity — the core of what was requested */}
      <div className="space-y-6">
        {findingsBySeverity.map((group) => (
          <div key={group.severity} className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">
              {group.severity} ({group.findings.length})
            </h2>
            <div className="space-y-3">
              {group.findings.map((finding: Finding) => (
                <FindingCard
                  key={finding.id}
                  finding={{
                    ...finding,
                    severity: finding.severity as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO",
                    codeSnippet: finding.codeSnippet,
                    claudePrompt: finding.claudePrompt,
                  }}
                />
              ))}
            </div>
          </div>
        ))}

        {scan.findings.length === 0 && scan.status === "COMPLETED" && (
          <div className="text-center py-12 text-slate-500">
            No security findings detected with the modules that ran.
          </div>
        )}
      </div>
    </div>
  );
}
