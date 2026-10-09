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

  const settings = await prisma.systemSettings.upsert({
    where: { id: 1 },
    create: { id: 1, billingEnabled: false },
    update: {},
  });

  return NextResponse.json({ settings });
}

const UpdateSettingsSchema = z.object({
  billingEnabled: z.boolean(),
});

export async function PATCH(req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const body = await req.json();
  const parsed = UpdateSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const settings = await prisma.systemSettings.upsert({
    where: { id: 1 },
    create: { id: 1, billingEnabled: parsed.data.billingEnabled },
    update: { billingEnabled: parsed.data.billingEnabled },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id!,
      action: "admin.settings_updated",
      metadata: { billingEnabled: parsed.data.billingEnabled },
    },
  });

  return NextResponse.json({ settings });
}
