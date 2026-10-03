import { signIn } from "@/lib/auth";
import { Github, ShieldCheck } from "lucide-react";

export default function LoginPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 text-center">
      <ShieldCheck className="h-14 w-14 text-emerald-400 mb-6" />
      <h1 className="text-2xl font-semibold text-slate-100 mb-2">Sign in</h1>
      <p className="text-slate-400 max-w-sm mb-8 text-sm">
        Connect your GitHub account to scan private repositories, or continue without an
        account to scan a public repository.
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

      <div className="flex items-center gap-3 my-6 w-full max-w-xs">
        <div className="h-px bg-slate-800 flex-1" />
        <span className="text-xs text-slate-500">or</span>
        <div className="h-px bg-slate-800 flex-1" />
      </div>

      <a
        href="/projects/new?source=public"
        className="text-sm text-slate-400 hover:text-slate-200 underline underline-offset-4"
      >
        Scan a public repository without signing in
      </a>
    </div>
  );
}
