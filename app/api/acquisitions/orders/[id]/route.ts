import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const order = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      vendor: true,
      items:  { include: { book: { select: { id: true, title: true, coverImage: true } } } },
    },
  });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(order);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { status, vendorId, expectedDate, receivedDate, currency, notes } = body;

  const order = await prisma.purchaseOrder.update({
    where: { id },
    data: {
      ...(status       !== undefined && { status:       status }),
      ...(vendorId     !== undefined && { vendorId }),
      ...(currency     !== undefined && { currency }),
      ...(notes        !== undefined && { notes:        notes?.trim() || null }),
      ...(expectedDate !== undefined && { expectedDate: expectedDate ? new Date(expectedDate) : null }),
      ...(receivedDate !== undefined && { receivedDate: receivedDate ? new Date(receivedDate) : null }),
    },
    include: {
      vendor: { select: { id: true, name: true } },
      items:  { include: { book: { select: { id: true, title: true, coverImage: true } } } },
    },
  });
  return NextResponse.json(order);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session || !can(session.user?.role, "ADMIN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const order = await prisma.purchaseOrder.findUnique({ where: { id }, select: { status: true } });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (order.status !== "DRAFT" && order.status !== "CANCELLED")
    return NextResponse.json({ error: "Only DRAFT or CANCELLED orders can be deleted." }, { status: 409 });

  await prisma.purchaseOrder.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
