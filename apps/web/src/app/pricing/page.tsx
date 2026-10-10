import Link from "next/link";
import { PrismaClient, type PlanConfig } from "@prisma/client";
import { auth } from "@/lib/auth";
import { CheckoutButton } from "@/components/CheckoutButton";
import { Check, ShieldCheck } from "lucide-react";

const prisma = new PrismaClient();

export default async function PricingPage() {
  const [session, settings, plans] = await Promise.all([
    auth(),
    prisma.systemSettings.upsert({ where: { id: 1 }, create: { id: 1, billingEnabled: false }, update: {} }),
    prisma.planConfig.findMany({ where: { isAvailable: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  return (
    <div className="min-h-screen">
      <nav className="max-w-6xl mx-auto px-4 py-6 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-emerald-400" />
          <span className="font-semibold text-slate-100">Security Scanner</span>
        </Link>
        <Link
          href={session?.user ? "/dashboard" : "/login"}
          className="text-sm font-medium text-slate-300 hover:text-white border border-slate-700 hover:border-slate-600 rounded-lg px-4 py-2 transition-colors"
        >
          {session?.user ? "Dashboard" : "Sign in"}
        </Link>
      </nav>

      <div className="max-w-5xl mx-auto px-4 py-12 text-center">
        <h1 className="text-3xl font-bold text-slate-50 mb-3">Pricing</h1>

        {!settings.billingEnabled ? (
          <div className="max-w-lg mx-auto bg-emerald-950/30 border border-emerald-500/30 rounded-xl p-6 mt-8">
            <p className="text-emerald-300 font-medium mb-1">Free during soft launch</p>
            <p className="text-sm text-slate-400">
              Billing isn't enabled yet — every signed-in account can run scans without a
              concurrency limit while we're in early access.
            </p>
          </div>
        ) : (
          <>
            <p className="text-slate-400 mb-10">Pick how many scans you need running at once.</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-left">
              {plans.map((plan: PlanConfig) => (
                <div
                  key={plan.id}
                  className={`rounded-xl border p-5 flex flex-col ${
                    plan.isDefault ? "border-slate-800 bg-slate-900/40" : "border-emerald-500/30 bg-emerald-950/10"
                  }`}
                >
                  <h2 className="font-semibold text-slate-100">{plan.name}</h2>
                  <div className="mt-2 mb-4">
                    <span className="text-3xl font-bold text-slate-50">${plan.priceMonthlyUsd}</span>
                    <span className="text-slate-500 text-sm"> / month</span>
                  </div>
                  <ul className="space-y-2 text-sm text-slate-400 mb-6 flex-1">
                    <li className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                      {plan.maxConcurrentScans} concurrent scan{plan.maxConcurrentScans === 1 ? "" : "s"}
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                      SAST, SCA, secrets, deep-checks
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                      Claude-generated fix prompts
                    </li>
                  </ul>
                  {plan.priceMonthlyUsd === 0 ? (
                    <Link
                      href={session?.user ? "/dashboard" : "/login"}
                      className="text-center text-sm font-medium text-slate-300 hover:text-white border border-slate-700 hover:border-slate-600 rounded-lg px-4 py-2.5 transition-colors"
                    >
                      {session?.user ? "Current plan" : "Get started"}
                    </Link>
                  ) : (
                    <CheckoutButton
                      tier={plan.key.toUpperCase() as "STARTER" | "PRO" | "SCALE"}
                      isSignedIn={Boolean(session?.user)}
                    />
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
