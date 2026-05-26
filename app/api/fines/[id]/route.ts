import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !can(session.user?.role, "STAFF"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  if (body.action === "pay") {
    const fine = await prisma.fine.update({
      where: { id },
      data: { status: "PAID", paidAt: new Date() },
      include: { member: true, loan: { include: { book: true } } },
    });
    return NextResponse.json(fine);
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
