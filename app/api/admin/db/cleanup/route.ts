import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || session.user?.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { dryRun = false } = await req.json().catch(() => ({}));
  const now = new Date();
  const results: { label: string; found: number; fixed: number }[] = [];

  // ── 1. Mark OVERDUE loans ────────────────────────────────────────────────
  const overdueLoans = await prisma.loan.findMany({
    where: { status: "ACTIVE", dueDate: { lt: now } },
    select: { id: true },
  });
  let overdueFixed = 0;
  if (!dryRun && overdueLoans.length > 0) {
    const r = await prisma.loan.updateMany({
      where: { status: "ACTIVE", dueDate: { lt: now } },
      data: { status: "OVERDUE" },
    });
    overdueFixed = r.count;
  }
  results.push({ label: "Loans marked OVERDUE", found: overdueLoans.length, fixed: overdueFixed });

  // ── 2. Expire stale reservations ─────────────────────────────────────────
  const expiredRes = await prisma.reservation.findMany({
    where: { status: { in: ["PENDING", "APPROVED"] }, expiresAt: { lt: now } },
    select: { id: true },
  });
  let resFixed = 0;
  if (!dryRun && expiredRes.length > 0) {
    const r = await prisma.reservation.updateMany({
      where: { status: { in: ["PENDING", "APPROVED"] }, expiresAt: { lt: now } },
      data: { status: "EXPIRED" },
    });
    resFixed = r.count;
  }
  results.push({ label: "Reservations marked EXPIRED", found: expiredRes.length, fixed: resFixed });

  // ── 3. Deactivate expired memberships ────────────────────────────────────
  const expiredMembers = await prisma.member.findMany({
    where: { isActive: true, expireDate: { lt: now } },
    select: { id: true },
  });
  let memberFixed = 0;
  if (!dryRun && expiredMembers.length > 0) {
    const r = await prisma.member.updateMany({
      where: { isActive: true, expireDate: { lt: now } },
      data: { isActive: false },
    });
    memberFixed = r.count;
  }
  results.push({ label: "Expired memberships deactivated", found: expiredMembers.length, fixed: memberFixed });

  // ── 4. Create missing fines for OVERDUE take-home loans ─────────────────
  // IN_LIBRARY loans are same-day reads — they do not generate daily fines.
  const fineRateSetting = await prisma.settings.findUnique({ where: { key: "FINE_PER_DAY" } });
  const finePerDay = parseFloat(fineRateSetting?.value ?? "0.50");

  const overdueNoFine = await prisma.loan.findMany({
    where: { status: "OVERDUE", loanType: "HOME", fine: { is: null } },
    select: { id: true, memberId: true, dueDate: true },
  });
  let fineFixed = 0;
  if (!dryRun && overdueNoFine.length > 0) {
    for (const loan of overdueNoFine) {
      const daysLate = Math.max(1, Math.ceil((now.getTime() - loan.dueDate.getTime()) / 86_400_000));
      await prisma.fine.create({
        data: {
          loanId:   loan.id,
          memberId: loan.memberId,
          amount:   parseFloat((daysLate * finePerDay).toFixed(2)),
          daysLate,
          status: "UNPAID",
        },
      });
      fineFixed++;
    }
  }
  results.push({ label: "Fines created for overdue take-home loans", found: overdueNoFine.length, fixed: fineFixed });

  // Heal READY reservations whose copy isn't actually RESERVED
  const orphanReady = await prisma.reservation.findMany({
    where:  { status: "READY", copyId: { not: null } },
    select: { id: true, copy: { select: { status: true } } },
  });
  const reservationsToHeal = orphanReady.filter((r) => r.copy?.status !== "RESERVED");
  let readyFixed = 0;
  if (!dryRun && reservationsToHeal.length > 0) {
    for (const r of reservationsToHeal) {
      await prisma.reservation.update({
        where: { id: r.id },
        data:  { status: "APPROVED", copyId: null, holdShelf: null },
      });
      readyFixed++;
    }
  }
  results.push({ label: "Orphan READY reservations reverted to APPROVED", found: reservationsToHeal.length, fixed: readyFixed });

  // Release orphan RESERVED copies (no READY reservation holds them)
  const reservedCopies = await prisma.bookCopy.findMany({
    where:  { status: "RESERVED" },
    select: { id: true, bookId: true, reservations: { where: { status: "READY" }, select: { id: true } } },
  });
  const copiesToRelease = reservedCopies.filter((c) => c.reservations.length === 0);
  let copyFixed = 0;
  if (!dryRun && copiesToRelease.length > 0) {
    for (const c of copiesToRelease) {
      await prisma.$transaction([
        prisma.bookCopy.update({ where: { id: c.id }, data: { status: "AVAILABLE" } }),
        prisma.book.update({ where: { id: c.bookId }, data: { availableCopies: { increment: 1 } } }),
      ]);
      copyFixed++;
    }
  }
  results.push({ label: "Orphan RESERVED copies released to AVAILABLE", found: copiesToRelease.length, fixed: copyFixed });

  // ── 7. Recalculate denormalized copy counters ────────────────────────────
  const allBooks = await prisma.book.findMany({
    select: {
      id: true, totalCopies: true, availableCopies: true,
      copies: { select: { status: true } },
    },
  });
  const driftedBooks = allBooks.filter((b) => {
    const realTotal = b.copies.length;
    const realAvail = b.copies.filter((c) => c.status === "AVAILABLE").length;
    return realTotal !== b.totalCopies || realAvail !== b.availableCopies;
  });
  let countsFixed = 0;
  if (!dryRun && driftedBooks.length > 0) {
    for (const b of driftedBooks) {
      const realTotal = b.copies.length;
      const realAvail = b.copies.filter((c) => c.status === "AVAILABLE").length;
      await prisma.book.update({
        where: { id: b.id },
        data:  { totalCopies: realTotal, availableCopies: realAvail },
      });
      countsFixed++;
    }
  }
  results.push({ label: "Book copy counts recalculated", found: driftedBooks.length, fixed: countsFixed });

  const totalFound = results.reduce((s, r) => s + r.found, 0);
  const totalFixed = results.reduce((s, r) => s + r.fixed, 0);

  return NextResponse.json({ dryRun, results, totalFound, totalFixed });
}
