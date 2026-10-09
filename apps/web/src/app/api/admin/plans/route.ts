import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { requireAdminSession } from "@/lib/require-admin";

const prisma = new PrismaClient();

export async function GET() {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const plans = await prisma.planConfig.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { users: true } } },
  });

  return NextResponse.json({ plans });
}

const CreatePlanSchema = z.object({
  key: z.string().min(1).regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers, and hyphens only."),
  name: z.string().min(1),
  maxConcurrentScans: z.number().int().min(1),
  priceMonthlyUsd: z.number().int().min(0),
  isAvailable: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export async function POST(req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const body = await req.json();
  const parsed = CreatePlanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const plan = await prisma.planConfig.create({ data: parsed.data });

  await prisma.auditLog.create({
    data: { userId: session.user.id!, action: "admin.plan_created", metadata: { planId: plan.id } },
  });

  return NextResponse.json({ plan }, { status: 201 });
}
