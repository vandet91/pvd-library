import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";

async function nextOrderNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `PO-${year}-`;
  const last = await prisma.purchaseOrder.findFirst({
    where:   { orderNumber: { startsWith: prefix } },
    orderBy: { orderNumber: "desc" },
    select:  { orderNumber: true },
  });
  const seq = last ? parseInt(last.orderNumber.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status   = searchParams.get("status");
  const vendorId = searchParams.get("vendorId");

  const orders = await prisma.purchaseOrder.findMany({
    where: {
      ...(status   ? { status: status as never }     : {}),
      ...(vendorId ? { vendorId }                    : {}),
    },
    include: {
      vendor: { select: { id: true, name: true } },
      items:  { include: { book: { select: { id: true, title: true, coverImage: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(orders);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { vendorId, expectedDate, currency = "USD", notes, items = [] } = body;

  if (!vendorId)
    return NextResponse.json({ error: "vendorId is required" }, { status: 400 });
  if (!Array.isArray(items) || items.length === 0)
    return NextResponse.json({ error: "At least one item is required" }, { status: 400 });

  const orderNumber = await nextOrderNumber();
  const subtotal = items.reduce(
    (s: number, i: { quantity: number; unitPrice: number }) => s + (i.quantity ?? 1) * (i.unitPrice ?? 0), 0
  );

  const order = await prisma.purchaseOrder.create({
    data: {
      orderNumber,
      vendorId,
      currency,
      subtotal,
      expectedDate: expectedDate ? new Date(expectedDate) : null,
      notes:        notes?.trim() || null,
      createdById:  session.user?.id ?? null,
      items: {
        create: items.map((i: { bookId?: string; title: string; isbn?: string; quantity: number; unitPrice: number; notes?: string }) => ({
          bookId:    i.bookId    || null,
          title:     i.title?.trim() || "Untitled",
          isbn:      i.isbn?.trim()  || null,
          quantity:  Number(i.quantity)  || 1,
          unitPrice: Number(i.unitPrice) || 0,
          currency,
          notes:     i.notes?.trim() || null,
        })),
      },
    },
    include: {
      vendor: { select: { id: true, name: true } },
      items:  { include: { book: { select: { id: true, title: true, coverImage: true } } } },
    },
  });

  return NextResponse.json(order, { status: 201 });
}
