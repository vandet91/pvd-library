import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session || !can(session.user?.role, "ADMIN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { reason, isRecurring } = await req.json();

  const day = await prisma.closedDay.update({
    where: { id },
    data: {
      ...(reason      !== undefined && { reason:      reason?.trim() || null }),
      ...(isRecurring !== undefined && { isRecurring }),
    },
  });
  return NextResponse.json(day);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session || !can(session.user?.role, "ADMIN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await prisma.closedDay.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
