import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { requireAdminSession } from "@/lib/require-admin";

const prisma = new PrismaClient();

const UpdatePlanSchema = z.object({
  name: z.string().min(1).optional(),
  maxConcurrentScans: z.number().int().min(1).optional(),
  priceMonthlyUsd: z.number().int().min(0).optional(),
  stripePriceId: z.string().nullable().optional(),
  // Toggling a plan's availability off hides it from /pricing and blocks
  // new checkouts, but never touches users already on it — this is the
  // "activate / deactivate a tier" control from scope.
  isAvailable: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = UpdatePlanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Exactly one plan may be isDefault (new users land on it) — setting a
  // new default atomically clears the flag on every other plan first.
  if (parsed.data.isDefault === true) {
    await prisma.planConfig.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
  }

  const plan = await prisma.planConfig.update({ where: { id }, data: parsed.data });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id!,
      action: "admin.plan_updated",
      metadata: { planId: id, changes: parsed.data },
    },
  });

  return NextResponse.json({ plan });
}
