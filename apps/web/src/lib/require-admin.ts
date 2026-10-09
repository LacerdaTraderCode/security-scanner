import { auth } from "@/lib/auth";

/**
 * Shared guard for every /admin page and /api/admin/* route. Returns the
 * session when the caller is an ADMIN, or null otherwise — callers decide
 * whether to redirect() (pages) or return a 403 (API routes), since the
 * right response differs by context.
 */
export async function requireAdminSession() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") return null;
  return session;
}
