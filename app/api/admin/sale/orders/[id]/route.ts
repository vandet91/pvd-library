import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { z } from "zod";
import { logActivity, actorFromSession, Actions } from "@/lib/activity-log";
import { notifyMember, tg } from "@/lib/telegram";

const schema = z.object({
  action:          z.enum(["confirm_payment", "prepare", "ready_for_pickup", "ship", "complete", "cancel", "approve_return", "refund"]),
  staffNote:       z.string().optional(),
  // ship fields
  logisticsCompany: z.string().optional(),
  trackingNumber:   z.string().optional(),
  expectedDelivery: z.string().optional(),   // ISO date string
  // refund
  refundNote:      z.string().optional(),
  cancelReason:    z.string().optional(),
});

const STATUS_TRANSITIONS: Record<string, string> = {
  confirm_payment:  "PAYMENT_CONFIRMED",
  prepare:          "PREPARING",
  ready_for_pickup: "READY_FOR_PICKUP",
  ship:             "SHIPPED",
  complete:         "COMPLETED",
  cancel:           "CANCELLED",
  approve_return:   "RETURNED",
  refund:           "REFUNDED",
};

/**
 * PATCH /api/admin/sale/orders/[id]
 * Staff updates an order status through its lifecycle.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !can(session.user?.role, "STAFF"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id }   = await params;
  const body     = await request.json().catch(() => ({}));
  const parsed   = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors.map((e) => e.message).join(", ") }, { status: 400 });

  const order = await prisma.saleOrder.findUnique({
    where:   { id },
    include: {
      items:     { select: { copyId: true } },
      memberRel: { select: { id: true, name: true } },
      branch:    { select: { name: true } },
    },
  });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const { action, staffNote, logisticsCompany, trackingNumber, expectedDelivery, refundNote, cancelReason } = parsed.data;
  const newStatus = STATUS_TRANSITIONS[action];

  const updateData: Record<string, unknown> = { status: newStatus };
  if (staffNote) updateData.staffNote = staffNote;

  if (action === "confirm_payment") {
    updateData.paidAt = new Date();
  }

  if (action === "ship") {
    if (!logisticsCompany) return NextResponse.json({ error: "logisticsCompany is required" }, { status: 400 });
    updateData.logisticsCompany = logisticsCompany;
    updateData.trackingNumber   = trackingNumber ?? null;
    updateData.expectedDelivery = expectedDelivery ? new Date(expectedDelivery) : null;
    updateData.shippedAt        = new Date();
  }

  if (action === "complete" || action === "ship") {
    // When completing / shipping, mark copies as SOLD + create stock movement
    await prisma.$transaction(async (tx) => {
      await tx.saleOrder.update({ where: { id }, data: updateData });
      if (action === "complete" || (action === "ship" && order.deliveryType === "PICKUP")) {
        for (const item of order.items) {
          await tx.bookCopy.update({
            where: { id: item.copyId },
            data:  { status: "SOLD" },
          });
          await tx.stockMovement.create({
            data: {
              copyId:    item.copyId,
              bookId:    (await tx.bookCopy.findUnique({ where: { id: item.copyId }, select: { bookId: true } }))!.bookId,
              type:      "SOLD",
              fromStatus: "FOR_SALE",
              toStatus:   "SOLD",
              notes:      `Order ${order.orderNumber}`,
              actorId:    session.user?.id   ?? null,
              actorName:  session.user?.name ?? null,
            },
          });
        }
      }
    });
  } else if (action === "cancel") {
    await prisma.saleOrder.update({
      where: { id },
      data: { ...updateData, cancelledAt: new Date(), cancelReason: cancelReason ?? "Cancelled by staff" },
    });
  } else if (action === "refund") {
    await prisma.$transaction(async (tx) => {
      await tx.saleOrder.update({ where: { id }, data: updateData });
      // Return copies to FOR_SALE stock
      for (const item of order.items) {
        await tx.bookCopy.update({ where: { id: item.copyId }, data: { status: "FOR_SALE" } });
        await tx.stockMovement.create({
          data: {
            copyId:    item.copyId,
            bookId:    (await tx.bookCopy.findUnique({ where: { id: item.copyId }, select: { bookId: true } }))!.bookId,
            type:      "SALE_RETURNED",
            fromStatus: "SOLD",
            toStatus:   "FOR_SALE",
            notes:      `Refund for order ${order.orderNumber}. ${refundNote ?? ""}`.trim(),
            actorId:    session.user?.id   ?? null,
            actorName:  session.user?.name ?? null,
          },
        });
      }
    });
  } else {
    await prisma.saleOrder.update({ where: { id }, data: updateData });
  }

  const actionMap: Record<string, string> = {
    confirm_payment: Actions.SALE_PAYMENT_CONFIRMED,
    ship:            Actions.SALE_ORDER_SHIPPED,
    complete:        Actions.SALE_ORDER_COMPLETED,
    cancel:          Actions.SALE_ORDER_CANCELLED,
    refund:          Actions.SALE_REFUNDED,
  };
  if (actionMap[action]) {
    await logActivity(actorFromSession(session), actionMap[action], {
      entityType: "SaleOrder",
      entityId:   id,
      entityName: order.orderNumber,
    });
  }

  // ── Telegram notification (fire-and-forget) ──────────────────────────────
  const memberName  = order.memberRel.name;
  const memberId    = order.memberRel.id;
  const branchName  = order.branch?.name ?? null;

  const notifyMap: Record<string, string> = {
    confirm_payment:  tg.saleOrderConfirmed(memberName, order.orderNumber),
    prepare:          tg.saleOrderPreparing(memberName, order.orderNumber),
    ready_for_pickup: tg.saleOrderReadyForPickup(memberName, order.orderNumber, branchName),
    complete:         tg.saleOrderCompleted(memberName, order.orderNumber),
    approve_return:   tg.saleReturnApproved(memberName, order.orderNumber),
    cancel:           tg.saleOrderCancelled(memberName, order.orderNumber, cancelReason),
    ship:             tg.saleOrderShipped(
      memberName,
      order.orderNumber,
      logisticsCompany ?? "",
      trackingNumber,
      expectedDelivery ? new Date(expectedDelivery) : null,
    ),
    refund: tg.saleRefunded(memberName, order.orderNumber, order.total, order.currency),
  };

  if (notifyMap[action]) {
    notifyMember(memberId, notifyMap[action]).catch(() => {});
  }
  // ─────────────────────────────────────────────────────────────────────────

  const updated = await prisma.saleOrder.findUnique({
    where:   { id },
    include: {
      memberRel: { select: { name: true, email: true } },
      items:     { include: { book: { select: { title: true } }, copy: true } },
    },
  });
  return NextResponse.json(updated);
}
