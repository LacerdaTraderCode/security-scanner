import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { requireAdminSession } from "@/lib/require-admin";

const prisma = new PrismaClient();

export async function GET() {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      plan: true,
      _count: { select: { projects: true } },
    },
  });

  return NextResponse.json({ users });
}
