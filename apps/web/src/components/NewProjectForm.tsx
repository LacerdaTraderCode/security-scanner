"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, Lock, Globe, GitFork, RefreshCw } from "lucide-react";
import clsx from "clsx";

type Platform = "WEB" | "MOBILE_ANDROID" | "MOBILE_IOS" | "DESKTOP" | "API_BACKEND" | "INFRA_IAC";

interface GitHubRepoOption {
  id: number;
  fullName: string;
  url: string;
  description: string | null;
  isPrivate: boolean;
  isFork: boolean;
  defaultBranch: string;
  language: string | null;
}

const PLATFORM_OPTIONS: { value: Platform; label: string }[] = [
  { value: "WEB", label: "Web" },
  { value: "API_BACKEND", label: "API / Backend" },
  { value: "MOBILE_ANDROID", label: "Android" },
  { value: "MOBILE_IOS", label: "iOS" },
  { value: "DESKTOP", label: "Desktop" },
  { value: "INFRA_IAC", label: "Infrastructure as Code" },
];

export function NewProjectForm() {
  const router = useRouter();

  // ── Step 1: pick a repo the signed-in user actually owns/can access ──
  const [repos, setRepos] = useState<GitHubRepoOption[]>([]);
  const [reposLoading, setReposLoading] = useState(true);
  const [reposError, setReposError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepoOption | null>(null);

  // ── Step 2: scan configuration for the selected repo ──
  const [liveTargetUrl, setLiveTargetUrl] = useState("");
  const [liveTargetAuthorized, setLiveTargetAuthorized] = useState(false);
  const [platforms, setPlatforms] = useState<Platform[]>(["WEB"]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const fetchRepos = useCallback(async (query: string) => {
    setReposLoading(true);
    setReposError(null);
    try {
      const res = await fetch(`/api/github/repos${query ? `?q=${encodeURIComponent(query)}` : ""}`);
      const data = await res.json();
      if (!res.ok) {
        setReposError(typeof data.error === "string" ? data.error : "Could not load repositories.");
        setRepos([]);
        return;
      }
      setRepos(data.repos);
    } catch {
      setReposError("Network error — please try again.");
    } finally {
      setReposLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => fetchRepos(search), 300);
    return () => clearTimeout(timeout);
  }, [search, fetchRepos]);

  function togglePlatform(p: Platform) {
    setPlatforms((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    if (!selectedRepo) {
      setSubmitError("Select a repository first.");
      return;
    }
    if (platforms.length === 0) {
      setSubmitError("Select at least one platform.");
      return;
    }
    if (liveTargetUrl && !liveTargetAuthorized) {
      setSubmitError("You must confirm authorization before testing a live URL.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: selectedRepo.fullName,
          sourceType: "GITHUB_REPO",
          repoUrl: selectedRepo.url,
          repoBranch: selectedRepo.defaultBranch,
          isPrivate: selectedRepo.isPrivate,
          liveTargetUrl: liveTargetUrl || undefined,
          liveTargetAuthorized,
          platforms,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setSubmitError(typeof data.error === "string" ? data.error : "Could not create project.");
        setSubmitting(false);
        return;
      }

      router.push(`/projects/${data.project.id}`);
    } catch {
      setSubmitError("Network error — please try again.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1.5">
          Repository
          <span className="text-slate-500 font-normal"> — only repos your GitHub account can access</span>
        </label>

        <div className="relative mb-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-600" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search your repositories…"
            className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
          />
        </div>

        {reposError && (
          <div className="bg-red-950/40 border border-red-500/40 text-red-300 text-sm rounded-lg p-3 mb-2 flex items-center justify-between gap-2">
            <span>{reposError}</span>
            <button
              type="button"
              onClick={() => fetchRepos(search)}
              className="flex items-center gap-1 text-xs underline underline-offset-2 shrink-0"
            >
              <RefreshCw className="h-3 w-3" />
              Retry
            </button>
          </div>
        )}

        <div className="border border-slate-800 rounded-lg max-h-72 overflow-y-auto divide-y divide-slate-800">
          {reposLoading && (
            <div className="flex items-center justify-center gap-2 text-sm text-slate-500 py-8">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading repositories…
            </div>
          )}

          {!reposLoading && !reposError && repos.length === 0 && (
            <div className="text-center text-sm text-slate-500 py-8">
              No repositories found{search ? ` matching "${search}"` : ""}.
            </div>
          )}

          {!reposLoading &&
            repos.map((repo) => (
              <button
                key={repo.id}
                type="button"
                onClick={() => setSelectedRepo(repo)}
                className={clsx(
                  "w-full text-left px-3 py-2.5 flex items-start gap-2.5 transition-colors",
                  selectedRepo?.id === repo.id ? "bg-emerald-600/10" : "hover:bg-slate-900"
                )}
              >
                {repo.isPrivate ? (
                  <Lock className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                ) : (
                  <Globe className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-slate-200 truncate">{repo.fullName}</span>
                    {repo.isFork && <GitFork className="h-3 w-3 text-slate-600 shrink-0" />}
                  </div>
                  {repo.description && (
                    <p className="text-xs text-slate-500 truncate">{repo.description}</p>
                  )}
                </div>
                {selectedRepo?.id === repo.id && (
                  <span className="text-xs text-emerald-400 shrink-0">Selected</span>
                )}
              </button>
            ))}
        </div>

        {selectedRepo && (
          <p className="text-xs text-slate-500 mt-2 flex items-center gap-1.5">
            {selectedRepo.isPrivate ? (
              <>
                <Lock className="h-3 w-3" /> Private repository — only scannable because it&rsquo;s yours.
              </>
            ) : (
              <>
                <Globe className="h-3 w-3" /> Public repository.
              </>
            )}
            {selectedRepo.isFork && " This is a fork, which is why it shows up in your list."}
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1.5">
          Platforms (select all that apply)
        </label>
        <div className="flex flex-wrap gap-2">
          {PLATFORM_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => togglePlatform(opt.value)}
              className={clsx(
                "text-sm px-3 py-1.5 rounded-full border transition-colors",
                platforms.includes(opt.value)
                  ? "bg-emerald-600/20 border-emerald-500 text-emerald-300"
                  : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-slate-800 pt-6">
        <label className="block text-sm font-medium text-slate-300 mb-1.5">
          Live URL for active pentest <span className="text-slate-500 font-normal">(optional)</span>
        </label>
        <input
          type="url"
          value={liveTargetUrl}
          onChange={(e) => setLiveTargetUrl(e.target.value)}
          placeholder="https://staging.myapp.com"
          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 mb-3"
        />
        {liveTargetUrl && (
          <label className="flex items-start gap-2.5 text-sm text-slate-300 bg-amber-950/20 border border-amber-500/30 rounded-lg p-3">
            <input
              type="checkbox"
              checked={liveTargetAuthorized}
              onChange={(e) => setLiveTargetAuthorized(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              I confirm that I own this target or have explicit authorization to run active
              security tests against it. Unauthorized testing of third-party systems may be
              illegal.
            </span>
          </label>
        )}
      </div>

      {submitError && (
        <div className="bg-red-950/40 border border-red-500/40 text-red-300 text-sm rounded-lg p-3">
          {submitError}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting || !selectedRepo}
        className="flex items-center justify-center gap-2 w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-medium px-4 py-2.5 rounded-lg transition-colors"
      >
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        {submitting ? "Creating…" : "Create project"}
      </button>
    </form>
  );
}
