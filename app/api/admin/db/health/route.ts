import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session || session.user?.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const now = new Date();
  const issues: string[] = [];

  // ── Table counts ─────────────────────────────────────────────────────────
  const counts = {
    users:         await prisma.user.count(),
    members:       await prisma.member.count(),
    books:         await prisma.book.count(),
    bookCopies:    await prisma.bookCopy.count(),
    authors:       await prisma.author.count(),
    publishers:    await prisma.publisher.count(),
    categories:    await prisma.category.count(),
    locations:     await prisma.location.count(),
    loans:         await prisma.loan.count(),
    fines:         await prisma.fine.count(),
    reservations:  await prisma.reservation.count(),
    ebooks:        await prisma.ebook.count(),
    bookRequests:  await prisma.bookRequest.count(),
    inventoryRuns: await prisma.inventory.count(),
    baskets:       await prisma.basket.count(),
    basketItems:   await prisma.basketItem.count(),
    notifications: await prisma.notification.count(),
  };

  // ── Loan status ───────────────────────────────────────────────────────────
  const overdueNotMarked = await prisma.loan.count({
    where: { status: "ACTIVE", dueDate: { lt: now } },
  });
  if (overdueNotMarked > 0)
    issues.push(`${overdueNotMarked} loan(s) past due but still marked ACTIVE`);

  const activeWithReturn = await prisma.loan.count({
    where: { status: "ACTIVE", returnDate: { not: null } },
  });
  if (activeWithReturn > 0)
    issues.push(`${activeWithReturn} loan(s) have returnDate but status = ACTIVE`);

  // ── Reservations ──────────────────────────────────────────────────────────
  const expiredNotMarked = await prisma.reservation.count({
    where: { status: { in: ["PENDING", "APPROVED"] }, expiresAt: { lt: now } },
  });
  if (expiredNotMarked > 0)
    issues.push(`${expiredNotMarked} reservation(s) past expiresAt but not EXPIRED`);

  const stalePending = await prisma.reservation.count({
    where: {
      status: "PENDING",
      createdAt: { lt: new Date(Date.now() - 30 * 86_400_000) },
    },
  });
  if (stalePending > 0)
    issues.push(`${stalePending} reservation(s) PENDING for over 30 days`);

  // ── Fines ─────────────────────────────────────────────────────────────────
  const unpaidFines = await prisma.fine.aggregate({
    where: { status: "UNPAID" },
    _count: true,
    _sum: { amount: true },
  });

  // Only take-home loans generate daily fines — in-library loans are same-day reads
  const overdueNoFine = await prisma.loan.count({
    where: { status: "OVERDUE", loanType: "HOME", fine: { is: null } },
  });
  if (overdueNoFine > 0)
    issues.push(`${overdueNoFine} overdue take-home loan(s) have no fine created yet`);

  // In-library loans not returned by end of issue day
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const staleInLibrary = await prisma.loan.count({
    where: { loanType: "IN_LIBRARY", status: { in: ["ACTIVE", "OVERDUE"] }, dueDate: { lt: startOfToday } },
  });
  if (staleInLibrary > 0)
    issues.push(`${staleInLibrary} in-library loan(s) not returned — book(s) may still be on reading desk`);

  // ── Book copy counts ──────────────────────────────────────────────────────
  const books = await prisma.book.findMany({
    select: { id: true, title: true, totalCopies: true, availableCopies: true },
  });
  const negativeAvail = books.filter((b) => b.availableCopies < 0);
  const overAvail     = books.filter((b) => b.availableCopies > b.totalCopies);
  if (negativeAvail.length > 0)
    issues.push(`${negativeAvail.length} book(s) have negative availableCopies`);
  if (overAvail.length > 0)
    issues.push(`${overAvail.length} book(s) have availableCopies > totalCopies`);

  // ── Members ───────────────────────────────────────────────────────────────
  const expiredActiveMembers = await prisma.member.count({
    where: { isActive: true, expireDate: { lt: now } },
  });
  if (expiredActiveMembers > 0)
    issues.push(`${expiredActiveMembers} member(s) past expireDate but still active`);

  return NextResponse.json({
    checkedAt: now.toISOString(),
    counts,
    issues,
    healthy: issues.length === 0,
    unpaidFines: {
      count:  unpaidFines._count,
      total:  unpaidFines._sum.amount ?? 0,
    },
  });
}
