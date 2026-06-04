import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";

/**
 * GET /api/alerts
 * Returns pending action counts for the sidebar badges.
 * Requires at least STAFF role.
 */
export async function GET() {
  const session = await auth();
  if (!session || !can(session.user?.role, "STAFF")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Auto-expire stale reservations first
  await prisma.reservation.updateMany({
    where: { status: "PENDING", expiresAt: { lt: new Date() } },
    data:  { status: "EXPIRED" },
  });

  const soonDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const [
    reservationsPending,
    reservationsApproved,
    reservationsReady,
    bookRequestsPending,
    loansOverdue,
    finesUnpaid,
    processingUntagged,
    pendingTasks,
    pendingMembers,
    salePaymentSubmitted,
    saleReturnRequested,
    serialIssuesMissing,
    subscriptionsExpiring,
    ordersAwaitingReceive,
  ] = await Promise.all([
    prisma.reservation.count({ where: { status: "PENDING"  } }),
    prisma.reservation.count({ where: { status: "APPROVED" } }),
    prisma.reservation.count({ where: { status: "READY"    } }),
    prisma.bookRequest.count({ where: { status: "PENDING"  } }),
    prisma.loan.count({        where: { status: "OVERDUE"   } }),
    prisma.fine.count({        where: { status: "UNPAID"    } }),
    prisma.bookCopy.count({    where: { labelPrinted: false } }),
    prisma.staffTask.count({   where: { status: { in: ["PENDING", "IN_PROGRESS"] } } }),
    // Members awaiting staff approval after self-registration
    prisma.member.count({ where: { pendingApproval: true } }),
    // Sale orders: member uploaded payment proof, needs staff confirmation
    prisma.saleOrder.count({ where: { status: "PAYMENT_SUBMITTED" } }),
    // Sale orders: member requested a return
    prisma.saleOrder.count({ where: { status: "RETURN_REQUESTED" } }),
    // Serial issues: overdue / missing and not resolved
    prisma.serialIssue.count({ where: { status: { in: ["MISSING", "CLAIMED"] } } }),
    // Serial subscriptions expiring within 30 days
    prisma.subscription.count({ where: { status: "ACTIVE", endDate: { lte: soonDate, gte: new Date() } } }),
    // Purchase orders sent to vendor but not fully received yet
    prisma.purchaseOrder.count({ where: { status: { in: ["SENT", "PARTIAL"] } } }),
  ]);

  return NextResponse.json({
    reservations:          reservationsPending,
    approved:              reservationsApproved,
    readyPickup:           reservationsReady,
    bookRequests:          bookRequestsPending,
    overdue:               loansOverdue,
    fines:                 finesUnpaid,
    processing:            processingUntagged,
    pendingTasks,
    pendingMembers,
    salePaymentSubmitted,
    saleReturnRequested,
    serialIssuesMissing,
    subscriptionsExpiring,
    ordersAwaitingReceive,
  });
}
