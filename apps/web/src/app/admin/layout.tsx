import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/require-admin";
import { ShieldAlert, Users, CreditCard, Settings } from "lucide-react";

const NAV = [
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/plans", label: "Plans", icon: CreditCard },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdminSession();
  if (!session) redirect("/dashboard");

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center gap-2 mb-8">
        <ShieldAlert className="h-5 w-5 text-amber-400" />
        <span className="font-semibold text-slate-100">Admin</span>
        <Link href="/dashboard" className="text-sm text-slate-500 hover:text-slate-300 ml-auto">
          Back to app
        </Link>
      </div>

      <div className="flex gap-8">
        <nav className="w-44 shrink-0 space-y-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-100 hover:bg-slate-900 rounded-lg px-3 py-2 transition-colors"
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
