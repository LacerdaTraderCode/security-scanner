import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { auth } from "@/lib/auth";

const prisma = new PrismaClient();

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const scan = await prisma.scan.findUnique({
    where: { id: params.id },
    include: {
      project: true,
      toolRuns: true,
      findings: {
        orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
      },
    },
  });

  if (!scan || scan.project.userId !== session.user.id) {
    return NextResponse.json({ error: "Scan not found or access denied." }, { status: 404 });
  }

  return NextResponse.json({ scan });
}
