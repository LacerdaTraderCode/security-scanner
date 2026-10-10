"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function BillingToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !enabled;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billingEnabled: next }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(typeof data.error === "string" ? data.error : "Could not update settings.");
        return;
      }
      setEnabled(next);
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-slate-800 rounded-lg p-4 bg-slate-900/50">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-medium text-slate-100">Billing mode</h2>
          <p className="text-sm text-slate-500 mt-1 max-w-md">
            {enabled
              ? "Plan limits are enforced and the pricing page is visible. Users past their plan's concurrent-scan limit are blocked from starting new scans."
              : "Soft launch mode — plan limits are NOT enforced for anyone, and the pricing/checkout pages are hidden. Everyone can scan without restriction."}
          </p>
        </div>
        <button
          disabled={busy}
          onClick={toggle}
          className={`shrink-0 w-12 h-7 rounded-full transition-colors relative disabled:opacity-50 ${
            enabled ? "bg-emerald-600" : "bg-slate-700"
          }`}
        >
          <span
            className={`absolute top-1 h-5 w-5 bg-white rounded-full transition-transform ${
              enabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>
      {error && <p className="text-red-400 text-xs mt-3">{error}</p>}
    </div>
  );
}
