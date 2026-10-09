import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { requireAdminSession } from "@/lib/require-admin";

const prisma = new PrismaClient();

const UpdateUserSchema = z.object({
  role: z.enum(["USER", "ADMIN"]).optional(),
  isActive: z.boolean().optional(),
  planId: z.string().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = UpdateUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // An admin may not demote or deactivate their own account — this prevents
  // the last admin from ever locking themselves out of /admin by mistake.
  if (id === session.user.id) {
    if (parsed.data.role === "USER" || parsed.data.isActive === false) {
      return NextResponse.json(
        { error: "You cannot demote or deactivate your own admin account." },
        { status: 400 }
      );
    }
  }

  const user = await prisma.user.update({
    where: { id },
    data: parsed.data,
    include: { plan: true },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id!,
      action: "admin.user_updated",
      metadata: { targetUserId: id, changes: parsed.data },
    },
  });

  return NextResponse.json({ user });
}
