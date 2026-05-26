/**
 * db-health.ts
 * Run: npm run db:health
 *
 * Checks database integrity and prints a full report:
 *   - Row counts per table
 *   - Loans marked ACTIVE but past due date (should be OVERDUE)
 *   - Orphaned records (fines without loans, etc.)
 *   - Members with no linked user account
 *   - Books with availableCopies out of sync
 *   - Unpaid fines summary
 *   - Expired reservations not yet marked
 */

import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

function section(title: string) {
  console.log(`\n${"─".repeat(55)}`);
  console.log(`  ${title}`);
  console.log("─".repeat(55));
}

function ok(msg: string)   { console.log(`  ✅  ${msg}`); }
function warn(msg: string) { console.log(`  ⚠️   ${msg}`); }
function err(msg: string)  { console.log(`  ❌  ${msg}`); }
function info(msg: string) { console.log(`       ${msg}`); }

async function main() {
  console.log("\n🏥  PVD Library — Database Health Check");
  console.log(`    ${new Date().toLocaleString()}`);

  let issues = 0;

  // ── Table counts ──────────────────────────────────────────────────────────
  section("Table Row Counts");
  const counts = {
    Users:         await prisma.user.count(),
    Members:       await prisma.member.count(),
    Books:         await prisma.book.count(),
    BookCopies:    await prisma.bookCopy.count(),
    Authors:       await prisma.author.count(),
    Publishers:    await prisma.publisher.count(),
    Categories:    await prisma.category.count(),
    Locations:     await prisma.location.count(),
    Loans:         await prisma.loan.count(),
    Fines:         await prisma.fine.count(),
    Reservations:  await prisma.reservation.count(),
    Ebooks:        await prisma.ebook.count(),
    BookRequests:  await prisma.bookRequest.count(),
    InventoryRuns: await prisma.inventory.count(),
    Baskets:       await prisma.basket.count(),
    BasketItems:   await prisma.basketItem.count(),
    Notifications: await prisma.notification.count(),
  };
  for (const [name, count] of Object.entries(counts)) {
    console.log(`    ${name.padEnd(20)} ${count.toLocaleString()} rows`);
  }

  // ── Loan status integrity ─────────────────────────────────────────────────
  section("Loan Status Integrity");
  const now = new Date();

  const overdueNotMarked = await prisma.loan.count({
    where: {
      status: "ACTIVE",
      dueDate: { lt: now },
    },
  });
  if (overdueNotMarked > 0) {
    warn(`${overdueNotMarked} loan(s) are past due but still marked ACTIVE`);
    info("→ Run: npm run db:cleanup  to auto-fix");
    issues += overdueNotMarked;
  } else {
    ok("All overdue loans are correctly marked");
  }

  const activeWithReturn = await prisma.loan.count({
    where: { status: "ACTIVE", returnDate: { not: null } },
  });
  if (activeWithReturn > 0) {
    warn(`${activeWithReturn} loan(s) have a returnDate but are still ACTIVE`);
    issues += activeWithReturn;
  } else {
    ok("No active loans with a returnDate anomaly");
  }

  // ── Reservation integrity ─────────────────────────────────────────────────
  section("Reservation Integrity");

  const expiredNotMarked = await prisma.reservation.count({
    where: {
      status: { in: ["PENDING", "APPROVED"] },
      expiresAt: { lt: now },
    },
  });
  if (expiredNotMarked > 0) {
    warn(`${expiredNotMarked} reservation(s) past expiresAt but not marked EXPIRED`);
    info("→ Run: npm run db:cleanup  to auto-fix");
    issues += expiredNotMarked;
  } else {
    ok("All expired reservations correctly marked");
  }

  const pendingOld = await prisma.reservation.count({
    where: {
      status: "PENDING",
      createdAt: { lt: new Date(Date.now() - 30 * 86_400_000) },
    },
  });
  if (pendingOld > 0) {
    warn(`${pendingOld} reservation(s) have been PENDING for over 30 days`);
    issues++;
  } else {
    ok("No stale pending reservations (>30 days)");
  }

  // READY reservations whose linked copy isn't actually RESERVED
  const readyReservations = await prisma.reservation.findMany({
    where:  { status: "READY", copyId: { not: null } },
    select: { id: true, copyId: true, copy: { select: { status: true } } },
  });
  const desync = readyReservations.filter((r) => r.copy?.status !== "RESERVED");
  if (desync.length > 0) {
    warn(`${desync.length} READY reservation(s) whose copy is NOT actually RESERVED (data drift)`);
    info("→ Run: npm run db:cleanup  to auto-revert these to APPROVED");
    issues += desync.length;
  } else {
    ok("All READY reservations correctly hold a RESERVED copy");
  }

  // RESERVED copies with no active reservation pointing at them
  const reservedCopies = await prisma.bookCopy.findMany({
    where:  { status: "RESERVED" },
    select: { id: true, reservations: { where: { status: "READY" }, select: { id: true } } },
  });
  const orphanReserved = reservedCopies.filter((c) => c.reservations.length === 0);
  if (orphanReserved.length > 0) {
    warn(`${orphanReserved.length} copy/copies marked RESERVED with no READY reservation holding them`);
    info("→ Run: npm run db:cleanup  to release these back to AVAILABLE");
    issues += orphanReserved.length;
  } else {
    ok("No orphan RESERVED copies");
  }

  // ── Copy <-> Loan integrity ───────────────────────────────────────────────
  section("Copy / Loan Integrity");

  // BORROWED copies that have no active loan
  const borrowedCopies = await prisma.bookCopy.findMany({
    where:  { status: "BORROWED" },
    select: { id: true, loans: { where: { status: { in: ["ACTIVE", "OVERDUE"] } }, select: { id: true } } },
  });
  const orphanBorrowed = borrowedCopies.filter((c) => c.loans.length === 0);
  if (orphanBorrowed.length > 0) {
    warn(`${orphanBorrowed.length} copy/copies marked BORROWED with no ACTIVE/OVERDUE loan`);
    issues += orphanBorrowed.length;
  } else {
    ok("All BORROWED copies have an active loan");
  }

  // Active loans whose linked copy isn't BORROWED
  const activeLoans = await prisma.loan.findMany({
    where:  { status: { in: ["ACTIVE", "OVERDUE"] }, copyId: { not: null } },
    select: { id: true, copy: { select: { status: true } } },
  });
  const loanDesync = activeLoans.filter((l) => l.copy?.status !== "BORROWED");
  if (loanDesync.length > 0) {
    warn(`${loanDesync.length} active loan(s) whose copy isn't BORROWED`);
    issues += loanDesync.length;
  } else {
    ok("All active loans have their copy correctly BORROWED");
  }

  // ── Notification integrity ────────────────────────────────────────────────
  section("Notification Integrity");

  const pendingNotifs = await prisma.notification.count({ where: { status: "PENDING", createdAt: { lt: new Date(Date.now() - 24 * 3_600_000) } } });
  if (pendingNotifs > 0) {
    warn(`${pendingNotifs} notification(s) stuck in PENDING for >24h`);
    issues += pendingNotifs;
  } else {
    ok("No stuck PENDING notifications");
  }

  const failedRecent = await prisma.notification.count({ where: { status: "FAILED", createdAt: { gte: new Date(Date.now() - 24 * 3_600_000) } } });
  if (failedRecent > 0) {
    warn(`${failedRecent} FAILED notification(s) in the last 24h — check SMTP credentials`);
  } else {
    ok("No recent notification failures");
  }

  // ── Fine integrity ────────────────────────────────────────────────────────
  section("Fine Integrity");

  const finesNoLoan = await prisma.fine.count({
    where: { loan: { is: undefined } },
  });
  // Note: Prisma enforces FK so this shouldn't happen, but good to check
  if (finesNoLoan > 0) {
    err(`${finesNoLoan} fine(s) with no linked loan (orphaned)`);
    issues += finesNoLoan;
  } else {
    ok("No orphaned fines");
  }

  const unpaidFines = await prisma.fine.aggregate({
    where: { status: "UNPAID" },
    _count: true,
    _sum: { amount: true },
  });
  if (unpaidFines._count > 0) {
    warn(
      `${unpaidFines._count} unpaid fine(s) totalling ` +
      `$${(unpaidFines._sum.amount ?? 0).toFixed(2)}`
    );
  } else {
    ok("No unpaid fines");
  }

  // ── Book copy counts ──────────────────────────────────────────────────────
  section("Book Copy Count Integrity");

  const books = await prisma.book.findMany({
    select: { id: true, title: true, totalCopies: true, availableCopies: true },
  });

  const negativeAvail = books.filter((b) => b.availableCopies < 0);
  const overAvail = books.filter((b) => b.availableCopies > b.totalCopies);

  if (negativeAvail.length > 0) {
    err(`${negativeAvail.length} book(s) have negative availableCopies:`);
    negativeAvail.slice(0, 5).forEach((b) =>
      info(`  "${b.title}" → availableCopies = ${b.availableCopies}`)
    );
    issues += negativeAvail.length;
  } else {
    ok("No books with negative availableCopies");
  }

  if (overAvail.length > 0) {
    err(`${overAvail.length} book(s) have availableCopies > totalCopies:`);
    overAvail.slice(0, 5).forEach((b) =>
      info(`  "${b.title}" → ${b.availableCopies} / ${b.totalCopies}`)
    );
    issues += overAvail.length;
  } else {
    ok("No books with availableCopies > totalCopies");
  }

  // ── Member integrity ──────────────────────────────────────────────────────
  section("Member Integrity");

  const membersNoUser = await prisma.member.count({
    where: { userId: null },
  });
  if (membersNoUser > 0) {
    info(`${membersNoUser} member(s) have no linked User account (walk-in members — OK if intentional)`);
  } else {
    ok("All members are linked to a user account");
  }

  const expiredMembers = await prisma.member.count({
    where: {
      isActive: true,
      expireDate: { lt: now },
    },
  });
  if (expiredMembers > 0) {
    warn(`${expiredMembers} member(s) are past their expireDate but still marked active`);
    issues++;
  } else {
    ok("No expired-but-active members");
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  section("Summary");
  if (issues === 0) {
    console.log("  ✅  Database is healthy — no issues found.\n");
  } else {
    console.log(`  ⚠️   Found ${issues} issue(s) that need attention.`);
    console.log("       Run: npm run db:cleanup  to auto-fix what can be fixed.\n");
  }
}

main()
  .catch((e) => { console.error("❌  Health check error:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
