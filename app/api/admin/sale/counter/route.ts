import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { z } from "zod";
import { logActivity, actorFromSession, Actions } from "@/lib/activity-log";
import { notifyAdmin, tg } from "@/lib/telegram";

const itemSchema = z.object({
  copyId:    z.string(),
  bookId:    z.string(),
  unitPrice: z.number().min(0),
});

const schema = z.object({
  items:         z.array(itemSchema).min(1, "At least one item required"),
  paymentMethod: z.enum(["cash", "card_counter", "qr"]),
  currency:      z.string().default("USD"),
  // Customer — one of these must be present
  memberId:      z.string().optional(),   // existing member
  walkInName:    z.string().optional(),   // walk-in customer name
  walkInPhone:   z.string().optional(),
  staffNote:     z.string().optional(),
  taxRate:       z.number().min(0).max(100).default(0),
});

/** Auto-generates next order number like SO-2025-0042 */
async function nextOrderNumber(): Promise<string> {
  const year  = new Date().getFullYear();
  const count = await prisma.saleOrder.count();
  return `SO-${year}-${String(count + 1).padStart(4, "0")}`;
}

/**
 * POST /api/admin/sale/counter
 * Staff processes a walk-in / counter sale.
 * Creates a COMPLETED order immediately — no payment proof needed.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "STAFF"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body   = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.errors.map((e) => e.message).join(", ") }, { status: 400 });

  const { items, paymentMethod, currency, memberId, walkInName, walkInPhone, staffNote, taxRate } = parsed.data;

  // Require either a member or a walk-in name
  if (!memberId && !walkInName?.trim())
    return NextResponse.json({ error: "Provide a member or a walk-in customer name" }, { status: 400 });

  // Verify member exists (if provided)
  if (memberId) {
    const member = await prisma.member.findUnique({ where: { id: memberId }, select: { id: true } });
    if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  // Verify all copies are FOR_SALE
  const copies = await prisma.bookCopy.findMany({
    where: { id: { in: items.map((i) => i.copyId) } },
    select: { id: true, status: true, bookId: true },
  });
  const notAvailable = copies.filter((c) => c.status !== "FOR_SALE");
  if (notAvailable.length > 0)
    return NextResponse.json({ error: `${notAvailable.length} item(s) are no longer available for sale` }, { status: 409 });

  const subtotal  = items.reduce((s, i) => s + i.unitPrice, 0);
  const taxAmount = taxRate > 0 ? subtotal * (taxRate / 100) : 0;
  const total     = subtotal + taxAmount;
  const orderNumber = await nextOrderNumber();
  const now       = new Date();

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.saleOrder.create({
      data: {
        orderNumber,
        memberId:      memberId ?? null,
        status:        "COMPLETED",
        deliveryType:  "PICKUP",
        saleChannel:   "COUNTER",
        walkInName:    walkInName?.trim() ?? null,
        walkInPhone:   walkInPhone?.trim() ?? null,
        paymentMethod,
        paidAt:        now,
        subtotal,
        taxAmount,
        shippingFee:   0,
        total,
        currency,
        staffNote:     staffNote ?? null,
        items: {
          create: items.map((i) => ({
            copyId:    i.copyId,
            bookId:    i.bookId,
            unitPrice: i.unitPrice,
            currency,
          })),
        },
      },
      include: {
        items: {
          include: {
            book: { select: { title: true, isbn: true, coverImage: true, author: { select: { name: true } } } },
            copy: { select: { copyNumber: true, barcode: true, condition: true } },
          },
        },
        memberRel: { select: { id: true, name: true, email: true } },
      },
    });

    // Mark copies as SOLD + stock movements
    for (const item of items) {
      await tx.bookCopy.update({
        where: { id: item.copyId },
        data:  { status: "SOLD" },
      });
      await tx.stockMovement.create({
        data: {
          copyId:     item.copyId,
          bookId:     item.bookId,
          type:       "SOLD",
          fromStatus: "FOR_SALE",
          toStatus:   "SOLD",
          notes:      `Counter sale — order ${orderNumber}${walkInName ? ` (${walkInName})` : ""}`,
          actorId:    session.user?.id   ?? null,
          actorName:  session.user?.name ?? null,
        },
      });
    }

    return created;
  });

  await logActivity(actorFromSession(session), Actions.SALE_ORDER_CREATED, {
    entityType: "SaleOrder",
    entityId:   order.id,
    entityName: order.orderNumber,
    detail:     { total, currency, itemCount: items.length, saleChannel: "COUNTER", paymentMethod },
  });

  // Notify admin of counter sale (fire-and-forget)
  const customerName = order.memberRel?.name ?? walkInName ?? "Walk-in customer";
  notifyAdmin(
    tg.adminNewOrder(customerName, order.orderNumber, total, currency, "PICKUP", paymentMethod)
  ).catch(() => {});

  return NextResponse.json(order, { status: 201 });
}
