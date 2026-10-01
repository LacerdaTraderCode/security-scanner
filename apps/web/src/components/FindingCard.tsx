"use client";

import { useState } from "react";
import { Copy, Check, AlertTriangle, ShieldAlert, Info } from "lucide-react";
import clsx from "clsx";

type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

interface FindingCardProps {
  finding: {
    id: string;
    tool: string;
    severity: Severity;
    category: string;
    title: string;
    description: string;
    filePath?: string | null;
    lineStart?: number | null;
    lineEnd?: number | null;
    codeSnippet?: string | null;
    remediation: string;
    claudePrompt?: string | null;
    isStructuralOnly: boolean;
  };
}

const SEVERITY_STYLES: Record<Severity, { bg: string; text: string; border: string; icon: typeof AlertTriangle }> = {
  CRITICAL: { bg: "bg-red-950/40", text: "text-red-400", border: "border-red-500/40", icon: ShieldAlert },
  HIGH: { bg: "bg-orange-950/40", text: "text-orange-400", border: "border-orange-500/40", icon: AlertTriangle },
  MEDIUM: { bg: "bg-yellow-950/40", text: "text-yellow-400", border: "border-yellow-500/40", icon: AlertTriangle },
  LOW: { bg: "bg-blue-950/40", text: "text-blue-400", border: "border-blue-500/40", icon: Info },
  INFO: { bg: "bg-slate-800/40", text: "text-slate-400", border: "border-slate-500/40", icon: Info },
};

export function FindingCard({ finding }: FindingCardProps) {
  const [copied, setCopied] = useState(false);
  const style = SEVERITY_STYLES[finding.severity];
  const Icon = style.icon;

  async function copyPrompt() {
    if (!finding.claudePrompt) return;
    await navigator.clipboard.writeText(finding.claudePrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={clsx("rounded-lg border p-4 space-y-3", style.bg, style.border)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Icon className={clsx("mt-0.5 h-5 w-5 shrink-0", style.text)} />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={clsx("text-xs font-semibold uppercase tracking-wide", style.text)}>{finding.severity}</span>
              <span className="text-xs text-slate-500">· {finding.tool}</span>
              {finding.isStructuralOnly && (
                <span className="text-xs bg-slate-700/50 text-slate-300 px-1.5 py-0.5 rounded">Structural analysis</span>
              )}
            </div>
            <h3 className="font-medium text-slate-100 mt-1">{finding.title}</h3>
          </div>
        </div>
      </div>

      <p className="text-sm text-slate-300">{finding.description}</p>

      {finding.filePath && (
        <div className="text-xs font-mono text-slate-400 bg-slate-900/50 rounded px-2 py-1 inline-block">
          {finding.filePath}
          {finding.lineStart && `:${finding.lineStart}${finding.lineEnd && finding.lineEnd !== finding.lineStart ? `-${finding.lineEnd}` : ""}`}
        </div>
      )}

      {finding.codeSnippet && (
        <pre className="text-xs bg-slate-950 border border-slate-800 rounded p-3 overflow-x-auto text-slate-300">
          {finding.codeSnippet}
        </pre>
      )}

      <div className="pt-2 border-t border-slate-700/50">
        <p className="text-xs font-medium text-slate-400 mb-1">Recommendation</p>
        <p className="text-sm text-slate-300">{finding.remediation}</p>
      </div>

      {finding.claudePrompt && (
        <div className="pt-2">
          <button
            onClick={copyPrompt}
            className="flex items-center gap-2 text-sm bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-md transition-colors"
          >
            {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied!" : "Copy fix prompt for Claude"}
          </button>
        </div>
      )}
    </div>
  );
}
