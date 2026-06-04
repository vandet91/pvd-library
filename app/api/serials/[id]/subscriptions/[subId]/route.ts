import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; subId: string }> },
) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { subId } = await params;
  const body = await req.json();
  const { vendorId, startDate, endDate, cost, currency, autoRenew, status, notes } = body;

  const sub = await prisma.subscription.update({
    where: { id: subId },
    data: {
      ...(vendorId  !== undefined && { vendorId:  vendorId  || null }),
      ...(startDate !== undefined && { startDate: new Date(startDate) }),
      ...(endDate   !== undefined && { endDate:   endDate ? new Date(endDate) : null }),
      ...(cost      !== undefined && { cost:      cost ? Number(cost) : null }),
      ...(currency  !== undefined && { currency }),
      ...(autoRenew !== undefined && { autoRenew }),
      ...(status    !== undefined && { status }),
      ...(notes     !== undefined && { notes: notes?.trim() || null }),
    },
    include: { vendor: { select: { id: true, name: true } } },
  });
  return NextResponse.json(sub);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; subId: string }> },
) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { subId } = await params;
  await prisma.subscription.delete({ where: { id: subId } });
  return NextResponse.json({ success: true });
}
