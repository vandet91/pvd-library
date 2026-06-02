import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { logActivity, actorFromSession, Actions } from "@/lib/activity-log";

/**
 * POST /api/admin/db/reset-sales
 * Wipes all sale data.
 *
 * Copy status logic:
 *  - Copies from COMPLETED orders  → left as SOLD (physically gone, buyer has them)
 *  - Copies from incomplete orders → reset to STOCK (never actually collected)
 *
 * ADMIN only. Irreversible — take a backup first.
 */
export async function POST() {
  const session = await auth();
  if (!session || !can(session.user?.role, "ADMIN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await prisma.$transaction(async (tx) => {
    // ── Collect copy IDs to reset (only from non-completed orders) ─────────
    // Completed orders = buyer physically collected the book → leave as SOLD.
    // Anything else (pending, cancelled, etc.) → book never left → reset to STOCK.
    const incompleteItems = await tx.saleOrderItem.findMany({
      where: {
        order: {
          status: { notIn: ["COMPLETED", "DELIVERED"] },
        },
      },
      select: { copyId: true },
    });
    const incompleteOrderCopyIds = incompleteItems
      .map((i) => i.copyId)
      .filter((id): id is string => id !== null);

    // Also pick up any SOLD copies that are orphaned (no order item) — safe to reset
    const allSoldCopyIds = (await tx.bookCopy.findMany({
      where:  { status: "SOLD" },
      select: { id: true },
    })).map((c) => c.id);

    const orderedCopyIds = new Set(
      (await tx.saleOrderItem.findMany({ select: { copyId: true } }))
        .map((i) => i.copyId)
        .filter((id): id is string => id !== null),
    );

    const orphanedSoldIds = allSoldCopyIds.filter((id) => !orderedCopyIds.has(id));

    const copyIdsToReset = [
      ...new Set([...incompleteOrderCopyIds, ...orphanedSoldIds]),
    ];

    // Count summaries
    const orderCount     = await tx.saleOrder.count();
    const cartCount      = await tx.saleCart.count();
    const completedCount = await tx.saleOrder.count({
      where: { status: { in: ["COMPLETED", "DELIVERED"] } },
    });

    // 1. Delete stock movements tied to incomplete sales only
    if (copyIdsToReset.length > 0) {
      await tx.stockMovement.deleteMany({
        where: { copyId: { in: copyIdsToReset }, toStatus: "SOLD" },
      });
    }

    // 2. Delete all sale order items → orders
    await tx.saleOrderItem.deleteMany({});
    await tx.saleOrder.deleteMany({});

    // 3. Delete cart items → carts
    await tx.saleCartItem.deleteMany({});
    await tx.saleCart.deleteMany({});

    // 4. Clear sale-related activity log entries (so logs/reports don't show stale data)
    await tx.activityLog.deleteMany({
      where: {
        action: {
          in: [
            "sale.order_created",
            "sale.order_shipped",
            "sale.order_completed",
            "sale.order_cancelled",
          ],
        },
      },
    });

    // 5. Reset only incomplete-order copies → STOCK
    let copiesReset = 0;
    if (copyIdsToReset.length > 0) {
      const { count } = await tx.bookCopy.updateMany({
        where: { id: { in: copyIdsToReset } },
        data:  { status: "STOCK" },
      });
      copiesReset = count;
    }

    const copiesLeft = allSoldCopyIds.length - copiesReset;

    return { orderCount, cartCount, completedCount, copiesReset, copiesLeft };
  });

  await logActivity(actorFromSession(session), Actions.BOOK_UPDATED, {
    entityType: "System",
    entityId:   "sale-reset",
    entityName: "Sale Data Reset",
    detail:     result,
  });

  return NextResponse.json({
    success:        true,
    ordersDeleted:  result.orderCount,
    cartsDeleted:   result.cartCount,
    completedKept:  result.completedCount,
    copiesReset:    result.copiesReset,
    copiesLeft:     result.copiesLeft,
  });
}
