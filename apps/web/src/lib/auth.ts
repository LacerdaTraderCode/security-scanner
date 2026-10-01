import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { PrismaClient } from "@prisma/client";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { encryptToken } from "./crypto";

const prisma = new PrismaClient();

/**
 * Auth with two supported paths, as decided in scope:
 *
 * 1. GitHub OAuth — standard login, grants access to whichever repositories
 *    the user authorizes in the OAuth consent screen (`repo` scope for
 *    private repos, `public_repo` if the user prefers to restrict to public
 *    ones).
 *
 * 2. Manual Personal Access Token — for users who don't want to go through
 *    the full OAuth flow, or who want to use a more narrowly scoped token.
 *    This is handled outside NextAuth, in
 *    apps/web/src/app/api/projects/link-token/route.ts, and the token is
 *    always encrypted before hitting the database (never stored in plaintext).
 *
 * Public repos without login: supported by allowing a Project to be created
 * with sourceType=PUBLIC_URL_ONLY without requiring a session — see the
 * validation in the projects route.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      authorization: {
        params: {
          // 'repo' grants access to private repos; if the user prefers public-only,
          // the UI offers a toggle that switches to 'public_repo' before the redirect.
          scope: "read:user user:email repo",
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account?.access_token) {
        // The raw token is never stored in plaintext in the JWT — always encrypted first.
        token.githubTokenEnc = await encryptToken(account.access_token);
      }
      return token;
    },
    async session({ session, token }) {
      if (token.githubTokenEnc && session.user) {
        (session.user as { githubTokenEnc?: string }).githubTokenEnc = token.githubTokenEnc as string;
      }
      return session;
    },
  },
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
});
