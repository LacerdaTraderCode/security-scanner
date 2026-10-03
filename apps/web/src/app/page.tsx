import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { auth } from "@/lib/auth";

export default async function HomePage() {
  const session = await auth();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 text-center">
      <ShieldCheck className="h-16 w-16 text-emerald-400 mb-6" />
      <h1 className="text-4xl font-bold mb-3">Security Scanner</h1>
      <p className="text-slate-400 max-w-xl mb-8">
        Automated security analysis for Web, Mobile, and Desktop projects — SAST, SCA,
        secret detection, and active pentest, with ready-to-use fix prompts for Claude.
      </p>
      <div className="flex items-center gap-3">
        <Link
          href={session?.user ? "/dashboard" : "/login"}
          className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-6 py-3 rounded-lg transition-colors"
        >
          {session?.user ? "Go to dashboard" : "Sign in"}
        </Link>
        {!session?.user && (
          <Link
            href="/projects/new?source=public"
            className="text-slate-400 hover:text-slate-200 text-sm font-medium px-4 py-3 underline underline-offset-4"
          >
            Scan a public repo
          </Link>
        )}
      </div>
    </div>
  );
}
