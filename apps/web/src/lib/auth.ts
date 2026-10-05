import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { PrismaClient } from "@prisma/client";
import { encryptToken } from "./crypto";

const prisma = new PrismaClient();

/**
 * Fails fast with a clear message instead of the opaque Auth.js
 * "Configuration" error page when required env vars are missing. This is
 * the #1 cause of that error in local/dev setups — GITHUB_CLIENT_ID,
 * GITHUB_CLIENT_SECRET or NEXTAUTH_SECRET not set in .env.local.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env (or .env.local for apps/web) and fill it in — see README for how to create a GitHub OAuth App.`
    );
  }
  return value;
}

/**
 * Auth strategy, as decided in scope:
 *
 * 1. GitHub OAuth — standard login, grants access to whichever repositories
 *    the user authorizes in the OAuth consent screen (`repo` scope for
 *    private repos, `public_repo` if the user prefers to restrict to public
 *    ones). GitHub is connected ONLY from inside the app, after the user has
 *    already signed in — there is no "browse GitHub without an account" path.
 *
 * 2. Manual Personal Access Token — for users who don't want to go through
 *    the full OAuth flow, or who want to use a more narrowly scoped token.
 *    Handled outside NextAuth, in apps/web/src/app/api/projects/link-token,
 *    always encrypted before hitting the database.
 *
 * We do NOT use @auth/prisma-adapter: with a pure JWT session strategy the
 * adapter is unnecessary overhead (and pulls PrismaClient into the Edge
 * runtime code path, which is unsupported). Instead, the `signIn` callback
 * below upserts our own `User` row directly, keyed by GitHub account id —
 * this keeps every user's data (projects, scans, findings) strictly scoped
 * to `userId`, so one account can never see another's repos or results.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    GitHub({
      clientId: requireEnv("GITHUB_CLIENT_ID"),
      clientSecret: requireEnv("GITHUB_CLIENT_SECRET"),
      authorization: {
        params: {
          // 'repo' grants access to private repos; a per-request scope switch
          // (public_repo-only) is offered in the UI before the redirect.
          scope: "read:user user:email repo",
        },
      },
    }),
  ],
  secret: requireEnv("NEXTAUTH_SECRET"),
  callbacks: {
    async signIn({ user, account, profile }) {
      if (!account || account.provider !== "github" || !user.email) return false;

      const githubId = String(account.providerAccountId);
      const githubLogin =
        profile && "login" in profile ? String((profile as { login: unknown }).login) : undefined;

      // A deactivated account (see /admin/users) can no longer sign in at
      // all — existing projects/scans/findings are preserved, just
      // inaccessible until an admin reactivates them.
      const existingAccount = await prisma.user.findUnique({ where: { githubId } });
      if (existingAccount && !existingAccount.isActive) {
        return false;
      }

      // Bootstrap: the very first account ever created on this deployment
      // becomes ADMIN automatically, with unlimited concurrent scans (see
      // resolveConcurrentScanLimit in packages/shared/src/plans.ts). Every
      // account after that is a normal USER. This only ever fires once per
      // deployment — checked against the User table being empty, not
      // against any config flag, so there's nothing to misconfigure.
      const existingUserCount = await prisma.user.count();
      const role = existingUserCount === 0 ? "ADMIN" : "USER";

      const defaultPlan = await prisma.planConfig.findFirst({ where: { isDefault: true } });

      // Upsert keyed by githubId: first sign-in creates the account, every
      // later sign-in just refreshes name/avatar/login — the user's row
      // (and therefore their projects/scans) is stable across sessions.
      // `role` and `planId` are only set on create — signing in again must
      // never downgrade an admin or silently change someone's plan.
      await prisma.user.upsert({
        where: { githubId },
        create: {
          email: user.email,
          name: user.name,
          image: user.image,
          githubId,
          githubLogin,
          role,
          planId: defaultPlan?.id,
        },
        update: {
          email: user.email,
          name: user.name,
          image: user.image,
          githubLogin,
        },
      });

      return true;
    },
    async jwt({ token, account }) {
      // Resolve our internal User.id (and role) once, right after sign-in,
      // and carry them in the JWT — every API route reads session.user.id /
      // session.user.role to scope queries and check admin access.
      if (account?.providerAccountId) {
        const dbUser = await prisma.user.findUnique({
          where: { githubId: String(account.providerAccountId) },
        });
        if (dbUser) {
          token.userId = dbUser.id;
          token.role = dbUser.role;
        }
      }
      if (account?.access_token) {
        // Raw token is never stored in plaintext — always encrypted first,
        // and persisted on the User row (not just the JWT) so background
        // jobs (the worker) can use it after the session itself has expired.
        const encrypted = await encryptToken(account.access_token);
        token.githubTokenEnc = encrypted;
        if (token.userId) {
          await prisma.user.update({
            where: { id: token.userId as string },
            data: { githubTokenEnc: encrypted },
          });
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        if (token.userId) session.user.id = token.userId as string;
        if (token.role) session.user.role = token.role as "USER" | "ADMIN";
        if (token.githubTokenEnc) session.user.githubTokenEnc = token.githubTokenEnc as string;
      }
      return session;
    },
  },
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
});
