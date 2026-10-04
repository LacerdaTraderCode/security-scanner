import { signIn } from "@/lib/auth";
import { Github, ShieldCheck, Lock } from "lucide-react";

export default function LoginPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 text-center">
      <ShieldCheck className="h-14 w-14 text-emerald-400 mb-6" />
      <h1 className="text-2xl font-semibold text-slate-100 mb-2">Sign in to continue</h1>
      <p className="text-slate-400 max-w-sm mb-8 text-sm">
        A GitHub sign-in is required for every scan — this is what lets us confirm a repository
        is actually yours (or that you've forked it) before testing it, and keeps your results
        private to your account.
      </p>

      <form
        action={async () => {
          "use server";
          await signIn("github", { redirectTo: "/dashboard" });
        }}
      >
        <button
          type="submit"
          className="flex items-center gap-2 bg-slate-100 hover:bg-white text-slate-900 font-medium px-6 py-3 rounded-lg transition-colors"
        >
          <Github className="h-5 w-5" />
          Continue with GitHub
        </button>
      </form>

      <p className="flex items-center gap-1.5 text-xs text-slate-600 mt-6">
        <Lock className="h-3 w-3" />
        Your repositories and scan results are never visible to other accounts.
      </p>
    </div>
  );
}
