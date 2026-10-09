import { PrismaClient } from "@prisma/client";
import { PlansTable } from "@/components/admin/PlansTable";

const prisma = new PrismaClient();

export default async function AdminPlansPage() {
  const plans = await prisma.planConfig.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { users: true } } },
  });

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-100 mb-1">Plans</h1>
      <p className="text-slate-500 text-sm mb-6">
        Edit limits and pricing at any time — changes apply immediately, with no deploy needed.
        Hiding a plan removes it from the pricing page without affecting existing subscribers.
      </p>
      <PlansTable plans={JSON.parse(JSON.stringify(plans))} />
    </div>
  );
}
