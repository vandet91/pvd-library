import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { logActivity, actorFromSession, Actions } from "@/lib/activity-log";

const schema = z.object({
  deliveryType:    z.enum(["PICKUP", "DELIVERY"]),
  branchId:        z.string().optional(),          // required if PICKUP
  deliveryAddress: z.string().optional(),          // required if DELIVERY
  paymentMethod:   z.enum(["qr", "cash_on_pickup"]),
  memberNote:      z.string().optional(),
});

/** Auto-generates next order number like SO-2025-0042 */
async function nextOrderNumber(): Promise<string> {
  const year  = new Date().getFullYear();
  const count = await prisma.saleOrder.count();
  return `SO-${year}-${String(count + 1).padStart(4, "0")}`;
}

/**
 * POST /api/sale/checkout
 * Creates a SaleOrder from the member's cart.
 * Cart items are cleared; copies stay FOR_SALE until payment confirmed.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body   = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { deliveryType, branchId, deliveryAddress, paymentMethod, memberNote } = parsed.data;

  if (deliveryType === "PICKUP" && !branchId)
    return NextResponse.json({ error: "branchId is required for pickup" }, { status: 400 });
  if (deliveryType === "DELIVERY" && !deliveryAddress)
    return NextResponse.json({ error: "deliveryAddress is required for delivery" }, { status: 400 });

  // Sale enabled?
  const saleSetting = await prisma.settings.findUnique({ where: { key: "BOOK_SALE_ENABLED" } });
  if (saleSetting?.value !== "true")
    return NextResponse.json({ error: "Book sale is not enabled" }, { status: 403 });

  const member = await prisma.member.findFirst({
    where: { userId: session.user?.id ?? "" },
    select: { id: true, name: true },
  });
  if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  // Load cart with items
  const cart = await prisma.saleCart.findUnique({
    where:   { memberId: member.id },
    include: {
      items: {
        include: {
          copy: { select: { id: true, status: true, price: true, bookId: true } },
          book: { select: { id: true, title: true } },
        },
      },
    },
  });
  if (!cart || cart.items.length === 0)
    return NextResponse.json({ error: "Your cart is empty" }, { status: 400 });

  // Verify all copies still FOR_SALE
  const notAvailable = cart.items.filter((i) => i.copy.status !== "FOR_SALE");
  if (notAvailable.length > 0) {
    return NextResponse.json(
      { error: `Some items are no longer available: ${notAvailable.map((i) => i.book.title).join(", ")}` },
      { status: 409 },
    );
  }

  // Load settings for shipping fee + currency
  const [shippingFeeSetting, currencySetting] = await Promise.all([
    prisma.settings.findUnique({ where: { key: "BOOK_SALE_SHIPPING_FEE" } }),
    prisma.settings.findUnique({ where: { key: "STOCK_CURRENCY" } }),
  ]);
  const shippingFee    = deliveryType === "DELIVERY" ? parseFloat(shippingFeeSetting?.value ?? "2.00") : 0;
  const currency       = currencySetting?.value ?? "USD";
  const subtotal       = cart.items.reduce((s, i) => s + (i.copy.price ?? 0), 0);
  const total          = subtotal + shippingFee;
  const orderNumber    = await nextOrderNumber();

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.saleOrder.create({
      data: {
        orderNumber,
        memberId:        member.id,
        deliveryType,
        branchId:        branchId        ?? null,
        deliveryAddress: deliveryAddress ?? null,
        paymentMethod,
        subtotal,
        shippingFee,
        total,
        currency,
        memberNote:      memberNote ?? null,
        items: {
          create: cart.items.map((i) => ({
            copyId:    i.copyId,
            bookId:    i.bookId,
            unitPrice: i.copy.price ?? 0,
            currency,
          })),
        },
      },
      include: { items: true },
    });

    // Clear cart
    await tx.saleCartItem.deleteMany({ where: { cartId: cart.id } });

    return created;
  });

  await logActivity(actorFromSession(session), Actions.SALE_ORDER_CREATED, {
    entityType: "SaleOrder",
    entityId:   order.id,
    entityName: order.orderNumber,
    detail:     { total, currency, itemCount: order.items.length, deliveryType },
  });

  return NextResponse.json(order, { status: 201 });
}
