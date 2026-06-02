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

  const [
    reservationsPending,
    reservationsApproved,
    reservationsReady,
    bookRequestsPending,
    loansOverdue,
    finesUnpaid,
    processingUntagged,
    pendingTasks,
  ] = await Promise.all([
    prisma.reservation.count({ where: { status: "PENDING"  } }),
    prisma.reservation.count({ where: { status: "APPROVED" } }),
    prisma.reservation.count({ where: { status: "READY"    } }),
    prisma.bookRequest.count({ where: { status: "PENDING"  } }),
    prisma.loan.count({        where: { status: "OVERDUE"   } }),
    prisma.fine.count({        where: { status: "UNPAID"    } }),
    // Count copies that still need a physical spine label — primary processing signal
    prisma.bookCopy.count({    where: { labelPrinted: false  } }),
    // Active staff tasks (PENDING + IN_PROGRESS)
    prisma.staffTask.count({   where: { status: { in: ["PENDING", "IN_PROGRESS"] } } }),
  ]);

  return NextResponse.json({
    reservations: reservationsPending,    // pending approval
    approved:     reservationsApproved,   // approved — book needs to be pulled from shelf
    readyPickup:  reservationsReady,      // book on hold shelf, awaiting member pickup
    bookRequests: bookRequestsPending,
    overdue:      loansOverdue,
    fines:        finesUnpaid,
    processing:   processingUntagged,     // basket items needing physical labeling
    pendingTasks,                         // active staff tasks
  });
}
