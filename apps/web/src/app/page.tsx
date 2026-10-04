import Link from "next/link";
import { auth } from "@/lib/auth";
import {
  ShieldCheck,
  ScanSearch,
  KeyRound,
  Bug,
  Smartphone,
  Sparkles,
  ArrowRight,
  Lock,
} from "lucide-react";

const FEATURES = [
  {
    icon: ScanSearch,
    title: "Static analysis",
    body: "SQL injection, XSS, SSRF, and weak crypto caught in your code before they ship, powered by Semgrep.",
  },
  {
    icon: KeyRound,
    title: "Secret detection",
    body: "Leaked API keys, tokens, and credentials found in code and git history, via Gitleaks.",
  },
  {
    icon: Bug,
    title: "Dependency & active scanning",
    body: "Known CVEs in your dependencies, plus an authorized live pentest against your own URL.",
  },
  {
    icon: Smartphone,
    title: "Mobile & desktop",
    body: "Insecure storage, exported components, and binary exposure across Android, iOS, and native apps.",
  },
];

export default async function HomePage() {
  const session = await auth();

  return (
    <div className="min-h-screen">
      <nav className="max-w-6xl mx-auto px-4 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-emerald-400" />
          <span className="font-semibold text-slate-100">Security Scanner</span>
        </div>
        <Link
          href={session?.user ? "/dashboard" : "/login"}
          className="text-sm font-medium text-slate-300 hover:text-white border border-slate-700 hover:border-slate-600 rounded-lg px-4 py-2 transition-colors"
        >
          {session?.user ? "Dashboard" : "Sign in"}
        </Link>
      </nav>

      <header className="max-w-3xl mx-auto px-4 pt-16 pb-20 text-center">
        <div className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 rounded-full px-3 py-1 mb-6">
          <Sparkles className="h-3.5 w-3.5" />
          Fix prompts generated for Claude Code
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-slate-50 tracking-tight mb-5">
          Find the vulnerability.
          <br />
          Ship the fix in one prompt.
        </h1>
        <p className="text-slate-400 text-lg max-w-xl mx-auto mb-8">
          Automated security scanning for Web, Mobile, and Desktop projects — SAST, SCA, secret
          detection, and authorized active pentest, every finding paired with a ready-to-paste
          Claude Code prompt.
        </p>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-6 py-3 rounded-lg transition-colors"
        >
          Sign in with GitHub
          <ArrowRight className="h-4 w-4" />
        </Link>
        <p className="text-xs text-slate-600 mt-4 flex items-center justify-center gap-1.5">
          <Lock className="h-3 w-3" />
          Every account's repositories and results are private — scoped to that login only.
        </p>
      </header>

      <section className="max-w-5xl mx-auto px-4 pb-24">
        <div className="grid sm:grid-cols-2 gap-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
              <f.icon className="h-5 w-5 text-emerald-400 mb-3" />
              <h3 className="font-medium text-slate-100 mb-1.5">{f.title}</h3>
              <p className="text-sm text-slate-400">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="max-w-6xl mx-auto px-4 pb-10 text-center text-xs text-slate-600">
        <Link href="/pricing" className="hover:text-slate-400 underline underline-offset-4">
          Pricing
        </Link>
      </footer>
    </div>
  );
}
