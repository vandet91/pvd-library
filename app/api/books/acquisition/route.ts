import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";

/**
 * GET /api/books/acquisition
 * Returns acquisition intelligence in three signals:
 *  1. highDemand      — books with pending reservations but 0 available copies
 *  2. understocked    — most-borrowed last 30 days with < 2 available / < 3 total
 *  3. pendingRequests — member purchase requests still PENDING
 */
export async function GET() {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const bookSelect = {
    id: true, title: true, isbn: true,
    availableCopies: true, totalCopies: true, price: true,
    author:   { select: { name: true } },
    category: { select: { name: true } },
  } as const;

  // ── 1. High-demand: pending reservations + 0 available ───────────────────
  const reservationGroups = await prisma.reservation.groupBy({
    by:      ["bookId"],
    where:   { status: { in: ["PENDING", "APPROVED", "READY"] } },
    _count:  { bookId: true },
    orderBy: { _count: { bookId: "desc" } },
    take:    30,
  });

  const hdBookIds = reservationGroups.map((r) => r.bookId);
  const hdBooks   = await prisma.book.findMany({
    where:  { id: { in: hdBookIds } },
    select: bookSelect,
  });
  const hdMap      = new Map(hdBooks.map((b) => [b.id, b]));
  const highDemand = reservationGroups
    .map((r) => ({ ...hdMap.get(r.bookId)!, pendingReservations: r._count.bookId }))
    .filter((r) => r.id)
    .sort((a, b) => b.pendingReservations - a.pendingReservations);

  // ── 2. Popular but understocked ───────────────────────────────────────────
  const loanGroups = await prisma.loan.groupBy({
    by:      ["bookId"],
    where:   { createdAt: { gte: thirtyDaysAgo } },
    _count:  { bookId: true },
    orderBy: { _count: { bookId: "desc" } },
    take:    60,
  });

  const popularBookIds = loanGroups.map((l) => l.bookId);
  const popularBooks   = await prisma.book.findMany({
    where:  { id: { in: popularBookIds }, totalCopies: { lt: 3 } },
    select: bookSelect,
  });
  const loanMap    = new Map(loanGroups.map((l) => [l.bookId, l._count.bookId]));
  const understocked = popularBooks
    .map((b) => ({ ...b, recentLoans: loanMap.get(b.id) ?? 0 }))
    .filter((b) => b.recentLoans >= 2)
    .sort((a, b) => b.recentLoans - a.recentLoans)
    .slice(0, 20);

  // ── 3. Pending member purchase requests ───────────────────────────────────
  const pendingRequests = await prisma.bookRequest.findMany({
    where:   { status: "PENDING" },
    include: { member: { select: { name: true, memberType: true } } },
    orderBy: { createdAt: "desc" },
    take:    30,
  });

  return NextResponse.json({ highDemand, understocked, pendingRequests });
}
