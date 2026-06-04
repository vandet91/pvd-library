import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";

/**
 * POST /api/acquisitions/orders/[id]/receive
 * Mark items as received. For each item linked to a book, increments
 * availableCopies and creates BookCopy records via the stock-receive flow.
 *
 * Body: { items: [{ itemId, received }] }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const receivedItems: { itemId: string; received: number }[] = body.items ?? [];

  if (!receivedItems.length)
    return NextResponse.json({ error: "items[] is required" }, { status: 400 });

  const order = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: { items: true },
  });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.status === "CANCELLED")
    return NextResponse.json({ error: "Cannot receive items on a cancelled order" }, { status: 409 });

  const actorName = session.user?.name ?? session.user?.email ?? "Staff";

  await prisma.$transaction(async (tx) => {
    for (const ri of receivedItems) {
      const item = order.items.find((i) => i.id === ri.itemId);
      if (!item) continue;

      const delta = Math.max(0, Math.min(ri.received, item.quantity - item.received));
      if (delta === 0) continue;

      await tx.purchaseOrderItem.update({
        where: { id: ri.itemId },
        data:  { received: { increment: delta } },
      });

      if (item.bookId) {
        // Add physical copies to the book
        const book = await tx.book.findUnique({
          where:  { id: item.bookId },
          select: { totalCopies: true, copies: { select: { copyNumber: true }, orderBy: { copyNumber: "desc" }, take: 1 } },
        });
        if (book) {
          const nextCopyNum = (book.copies[0]?.copyNumber ?? 0) + 1;
          for (let n = 0; n < delta; n++) {
            const copy = await tx.bookCopy.create({
              data: {
                bookId:     item.bookId,
                copyNumber: nextCopyNum + n,
                status:     "AVAILABLE",
                acquiredAt: new Date(),
                price:      item.unitPrice || null,
              },
            });
            await tx.stockMovement.create({
              data: {
                copyId:    copy.id,
                bookId:    item.bookId,
                type:      "RECEIVED",
                toStatus:  "AVAILABLE",
                source:    "PURCHASE",
                reference: order.orderNumber,
                unitCost:  item.unitPrice || null,
                currency:  item.currency,
                actorName,
              },
            });
          }
          await tx.book.update({
            where: { id: item.bookId },
            data:  {
              availableCopies: { increment: delta },
              totalCopies:     { increment: delta },
            },
          });
        }
      }
    }

    // Recompute order status
    const updatedItems = await tx.purchaseOrderItem.findMany({ where: { orderId: id } });
    const allReceived  = updatedItems.every((i) => i.received >= i.quantity);
    const anyReceived  = updatedItems.some((i)  => i.received > 0);
    const newStatus = allReceived ? "RECEIVED" : anyReceived ? "PARTIAL" : order.status;

    await tx.purchaseOrder.update({
      where: { id },
      data:  {
        status:      newStatus as never,
        receivedDate: allReceived ? new Date() : order.receivedDate,
      },
    });
  });

  const updated = await prisma.purchaseOrder.findUnique({
    where:   { id },
    include: {
      vendor: { select: { id: true, name: true } },
      items:  { include: { book: { select: { id: true, title: true, coverImage: true } } } },
    },
  });

  return NextResponse.json(updated);
}
