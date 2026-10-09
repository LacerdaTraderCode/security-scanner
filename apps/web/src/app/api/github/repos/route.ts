import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { auth } from "@/lib/auth";
import { decryptToken } from "@/lib/crypto";

const prisma = new PrismaClient();

interface GitHubRepo {
  id: number;
  full_name: string;
  html_url: string;
  description: string | null;
  private: boolean;
  fork: boolean;
  default_branch: string;
  language: string | null;
  updated_at: string;
  permissions?: { admin: boolean; push: boolean; pull: boolean };
}

/**
 * Lists the signed-in user's own GitHub repositories (never another
 * account's) using their OAuth token, with optional `?q=` search. This is
 * how the app enforces "you can only scan a repo you have access to" at the
 * data-fetching level, not just as a UI suggestion: the GitHub API itself
 * only returns repos this token can see — a repo belonging to someone else
 * that the user hasn't forked simply never appears in the list.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user?.githubTokenEnc) {
    return NextResponse.json({ error: "No GitHub account connected." }, { status: 400 });
  }

  const token = await decryptToken(user.githubTokenEnc);
  const query = req.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";

  // affiliation=owner,collaborator,organization_member: everything this
  // token can push to — matches what "appears in your repositories" means
  // on github.com, including repos the user owns via a fork.
  const res = await fetch(
    "https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member",
    {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    }
  );

  if (!res.ok) {
    return NextResponse.json(
      { error: `GitHub API error (${res.status}). Try reconnecting your GitHub account.` },
      { status: 502 }
    );
  }

  const repos: GitHubRepo[] = await res.json();

  const filtered = query
    ? repos.filter((r) => r.full_name.toLowerCase().includes(query) || r.description?.toLowerCase().includes(query))
    : repos;

  return NextResponse.json({
    repos: filtered.map((r) => ({
      id: r.id,
      fullName: r.full_name,
      url: r.html_url,
      description: r.description,
      isPrivate: r.private,
      isFork: r.fork,
      defaultBranch: r.default_branch,
      language: r.language,
      updatedAt: r.updated_at,
    })),
  });
}
