"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface AdminUser {
  id: string;
  name: string | null;
  email: string;
  githubLogin: string | null;
  role: "USER" | "ADMIN";
  isActive: boolean;
  planId: string | null;
  plan: { id: string; name: string } | null;
  createdAt: string;
  _count: { projects: number };
}

interface PlanOption {
  id: string;
  name: string;
}

export function UsersTable({ users, plans, currentUserId }: { users: AdminUser[]; plans: PlanOption[]; currentUserId: string }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function updateUser(id: string, changes: Record<string, unknown>) {
    setPendingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Could not update user.");
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
    <div>
      {error && (
        <div className="bg-red-950/40 border border-red-500/40 text-red-300 text-sm rounded-lg p-3 mb-4">
          {error}
        </div>
      )}
      <div className="border border-slate-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-900 text-left text-slate-400">
              <th className="px-4 py-2.5 font-medium">User</th>
              <th className="px-4 py-2.5 font-medium">Role</th>
              <th className="px-4 py-2.5 font-medium">Plan</th>
              <th className="px-4 py-2.5 font-medium">Projects</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {users.map((user) => {
              const isSelf = user.id === currentUserId;
              const busy = pendingId === user.id;
              return (
                <tr key={user.id} className="text-slate-300">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-slate-100">{user.name ?? user.email}</div>
                    <div className="text-xs text-slate-500">
                      {user.githubLogin ? `@${user.githubLogin}` : user.email}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <select
                      value={user.role}
                      disabled={busy || isSelf}
                      onChange={(e) => updateUser(user.id, { role: e.target.value })}
                      className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs disabled:opacity-50"
                    >
                      <option value="USER">User</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                  </td>
                  <td className="px-4 py-2.5">
                    <select
                      value={user.planId ?? ""}
                      disabled={busy}
                      onChange={(e) => updateUser(user.id, { planId: e.target.value || null })}
                      className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs disabled:opacity-50"
                    >
                      <option value="">— none —</option>
                      {plans.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2.5 text-slate-400">{user._count.projects}</td>
                  <td className="px-4 py-2.5">
                    <button
                      disabled={busy || isSelf}
                      onClick={() => updateUser(user.id, { isActive: !user.isActive })}
                      className={`text-xs px-2 py-1 rounded-full border transition-colors disabled:opacity-50 ${
                        user.isActive
                          ? "border-emerald-500/40 text-emerald-400 bg-emerald-950/30"
                          : "border-red-500/40 text-red-400 bg-red-950/30"
                      }`}
                    >
                      {user.isActive ? "Active" : "Disabled"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
