import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { NewProjectForm } from "@/components/NewProjectForm";

export default async function NewProjectPage() {
  const session = await auth();

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <Link
        href={session?.user ? "/dashboard" : "/"}
        className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </Link>

      <h1 className="text-xl font-semibold text-slate-100 mb-1">New project</h1>
      <p className="text-slate-400 text-sm mb-8">
        Connect a repository to scan it for security issues across code, dependencies, and —
        optionally — a live, authorized URL.
      </p>

      <NewProjectForm allowPrivateSource={Boolean(session?.user)} />
    </div>
  );
}
