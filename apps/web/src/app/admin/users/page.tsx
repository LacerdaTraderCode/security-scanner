import { PrismaClient } from "@prisma/client";
import { requireAdminSession } from "@/lib/require-admin";
import { UsersTable } from "@/components/admin/UsersTable";

const prisma = new PrismaClient();

export default async function AdminUsersPage() {
  const session = await requireAdminSession();

  const [users, plans] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      include: { plan: { select: { id: true, name: true } }, _count: { select: { projects: true } } },
    }),
    prisma.planConfig.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-100 mb-1">Users</h1>
      <p className="text-slate-500 text-sm mb-6">
        {users.length} account{users.length === 1 ? "" : "s"} · the first account to sign in on this
        deployment is automatically made Admin.
      </p>
      <UsersTable
        users={JSON.parse(JSON.stringify(users))}
        plans={plans}
        currentUserId={session!.user.id!}
      />
    </div>
  );
}
