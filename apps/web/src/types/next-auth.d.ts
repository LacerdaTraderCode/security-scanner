import type { DefaultSession } from "next-auth";

/**
 * Extends Auth.js's built-in types with the fields our callbacks add:
 * - `token.userId` / `session.user.id`: our internal User.id (not GitHub's),
 *   used by every API route to scope queries to the signed-in account.
 * - `token.role` / `session.user.role`: USER or ADMIN, used to gate /admin
 *   and grant unlimited concurrent scans.
 * - `token.githubTokenEnc` / `session.user.githubTokenEnc`: the user's
 *   encrypted GitHub access token, carried through for convenience — the
 *   authoritative copy lives on User.githubTokenEnc in the database.
 */
declare module "next-auth" {
  interface Session {
    user: {
      id?: string;
      role?: "USER" | "ADMIN";
      githubTokenEnc?: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    role?: "USER" | "ADMIN";
    githubTokenEnc?: string;
  }
}
