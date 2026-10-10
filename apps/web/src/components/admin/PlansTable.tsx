"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface AdminPlan {
  id: string;
  key: string;
  name: string;
  maxConcurrentScans: number;
  priceMonthlyUsd: number;
  isAvailable: boolean;
  isDefault: boolean;
  _count: { users: number };
}

export function PlansTable({ plans }: { plans: AdminPlan[] }) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<string, { name: string; maxConcurrentScans: number; priceMonthlyUsd: number }>>(
    Object.fromEntries(
      plans.map((p) => [p.id, { name: p.name, maxConcurrentScans: p.maxConcurrentScans, priceMonthlyUsd: p.priceMonthlyUsd }])
    )
  );
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function patch(id: string, changes: Record<string, unknown>) {
    setPendingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/plans/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Could not update plan.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="bg-red-950/40 border border-red-500/40 text-red-300 text-sm rounded-lg p-3">
          {error}
        </div>
      )}
      {plans.map((plan) => {
        const draft = drafts[plan.id] ?? {
          name: plan.name,
          maxConcurrentScans: plan.maxConcurrentScans,
          priceMonthlyUsd: plan.priceMonthlyUsd,
        };
        const busy = pendingId === plan.id;
        const dirty =
          draft.name !== plan.name ||
          draft.maxConcurrentScans !== plan.maxConcurrentScans ||
          draft.priceMonthlyUsd !== plan.priceMonthlyUsd;

        return (
          <div key={plan.id} className="border border-slate-800 rounded-lg p-4 bg-slate-900/50">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-mono text-slate-500">{plan.key}</span>
              <div className="flex items-center gap-2">
                {plan.isDefault && (
                  <span className="text-xs text-emerald-400 bg-emerald-950/30 border border-emerald-500/30 rounded-full px-2 py-0.5">
                    Default for new users
                  </span>
                )}
                <button
                  disabled={busy}
                  onClick={() => patch(plan.id, { isAvailable: !plan.isAvailable })}
                  className={`text-xs px-2 py-1 rounded-full border transition-colors disabled:opacity-50 ${
                    plan.isAvailable
                      ? "border-emerald-500/40 text-emerald-400 bg-emerald-950/30"
                      : "border-slate-600 text-slate-400 bg-slate-800/30"
                  }`}
                >
                  {plan.isAvailable ? "Available" : "Hidden"}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Name</label>
                <input
                  value={draft.name}
                  onChange={(e) => setDrafts((d) => ({ ...d, [plan.id]: { ...draft, name: e.target.value } }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-sm text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Max concurrent scans</label>
                <input
                  type="number"
                  min={1}
                  value={draft.maxConcurrentScans}
                  onChange={(e) =>
                    setDrafts((d) => ({ ...d, [plan.id]: { ...draft, maxConcurrentScans: Number(e.target.value) } }))
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-sm text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Price / month (USD)</label>
                <input
                  type="number"
                  min={0}
                  value={draft.priceMonthlyUsd}
                  onChange={(e) =>
                    setDrafts((d) => ({ ...d, [plan.id]: { ...draft, priceMonthlyUsd: Number(e.target.value) } }))
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-sm text-slate-100"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">
                {plan._count.users} user{plan._count.users === 1 ? "" : "s"} on this plan
              </span>
              <div className="flex items-center gap-2">
                {!plan.isDefault && (
                  <button
                    disabled={busy}
                    onClick={() => patch(plan.id, { isDefault: true })}
                    className="text-xs text-slate-400 hover:text-slate-200 disabled:opacity-50"
                  >
                    Make default
                  </button>
                )}
                <button
                  disabled={busy || !dirty}
                  onClick={() => patch(plan.id, draft)}
                  className="text-xs bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white px-3 py-1.5 rounded-md transition-colors"
                >
                  {busy ? "Saving…" : "Save changes"}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
