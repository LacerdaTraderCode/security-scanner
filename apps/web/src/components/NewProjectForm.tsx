"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import clsx from "clsx";

type SourceType = "GITHUB_REPO" | "UPLOAD_ZIP" | "UPLOAD_ARCHIVE" | "PUBLIC_URL_ONLY";
type Platform = "WEB" | "MOBILE_ANDROID" | "MOBILE_IOS" | "DESKTOP" | "API_BACKEND" | "INFRA_IAC";

const PLATFORM_OPTIONS: { value: Platform; label: string }[] = [
  { value: "WEB", label: "Web" },
  { value: "API_BACKEND", label: "API / Backend" },
  { value: "MOBILE_ANDROID", label: "Android" },
  { value: "MOBILE_IOS", label: "iOS" },
  { value: "DESKTOP", label: "Desktop" },
  { value: "INFRA_IAC", label: "Infrastructure as Code" },
];

export function NewProjectForm({ allowPrivateSource }: { allowPrivateSource: boolean }) {
  const router = useRouter();
  const [sourceType, setSourceType] = useState<SourceType>(
    allowPrivateSource ? "GITHUB_REPO" : "PUBLIC_URL_ONLY"
  );
  const [name, setName] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [repoBranch, setRepoBranch] = useState("main");
  const [liveTargetUrl, setLiveTargetUrl] = useState("");
  const [liveTargetAuthorized, setLiveTargetAuthorized] = useState(false);
  const [platforms, setPlatforms] = useState<Platform[]>(["WEB"]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function togglePlatform(p: Platform) {
    setPlatforms((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (platforms.length === 0) {
      setError("Select at least one platform.");
      return;
    }
    if (liveTargetUrl && !liveTargetAuthorized) {
      setError("You must confirm authorization before testing a live URL.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          sourceType,
          repoUrl: sourceType === "GITHUB_REPO" || sourceType === "PUBLIC_URL_ONLY" ? repoUrl : undefined,
          repoBranch: repoBranch || undefined,
          liveTargetUrl: liveTargetUrl || undefined,
          liveTargetAuthorized,
          platforms,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Could not create project.");
        setSubmitting(false);
        return;
      }

      router.push(`/projects/${data.project.id}`);
    } catch {
      setError("Network error — please try again.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-950/40 border border-red-500/40 text-red-300 text-sm rounded-lg p-3">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1.5">Project name</label>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My API"
          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1.5">Source</label>
        <div className="grid grid-cols-2 gap-2">
          {allowPrivateSource && (
            <SourceOption
              active={sourceType === "GITHUB_REPO"}
              onClick={() => setSourceType("GITHUB_REPO")}
              label="GitHub repository"
              hint="Public or private, via your account"
            />
          )}
          <SourceOption
            active={sourceType === "PUBLIC_URL_ONLY"}
            onClick={() => setSourceType("PUBLIC_URL_ONLY")}
            label="Public repository"
            hint="No sign-in required"
          />
          {allowPrivateSource && (
            <>
              <SourceOption
                active={sourceType === "UPLOAD_ZIP"}
                onClick={() => setSourceType("UPLOAD_ZIP")}
                label="Upload .zip"
                hint="Coming soon"
                disabled
              />
              <SourceOption
                active={sourceType === "UPLOAD_ARCHIVE"}
                onClick={() => setSourceType("UPLOAD_ARCHIVE")}
                label="Upload .7z / archive"
                hint="Coming soon"
                disabled
              />
            </>
          )}
        </div>
      </div>

      {(sourceType === "GITHUB_REPO" || sourceType === "PUBLIC_URL_ONLY") && (
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Repository URL
            </label>
            <input
              type="url"
              required
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/owner/repo"
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Branch</label>
            <input
              type="text"
              value={repoBranch}
              onChange={(e) => setRepoBranch(e.target.value)}
              placeholder="main"
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>
      )}

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

      <button
        type="submit"
        disabled={submitting}
        className="flex items-center justify-center gap-2 w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-medium px-4 py-2.5 rounded-lg transition-colors"
      >
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        {submitting ? "Creating…" : "Create project"}
      </button>
    </form>
  );
}

function SourceOption({
  active,
  onClick,
  label,
  hint,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  hint: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        "text-left rounded-lg border p-3 transition-colors",
        disabled && "opacity-40 cursor-not-allowed",
        !disabled && active
          ? "bg-emerald-600/10 border-emerald-500"
          : "bg-slate-900 border-slate-800 hover:border-slate-700"
      )}
    >
      <div className="text-sm font-medium text-slate-200">{label}</div>
      <div className="text-xs text-slate-500 mt-0.5">{hint}</div>
    </button>
  );
}
