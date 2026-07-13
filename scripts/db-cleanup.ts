/**
 * db-cleanup.ts
 * Run: npm run db:cleanup
 * Dry run (no changes): npm run db:cleanup -- --dry-run
 *
 * Auto-fixes common data issues:
 *   1. Marks loans as OVERDUE when past due date
 *   2. Marks reservations as EXPIRED when past expiresAt
 *   3. Deactivates members past their expireDate
 *   4. Generates a summary report
 */

import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes("--dry-run");

function section(title: string) {
  console.log(`\n${"─".repeat(55)}`);
  console.log(`  ${title}`);
  console.log("─".repeat(55));
}

async function main() {
  const now = new Date();

  console.log("\n🔧  PVD Library — Database Cleanup");
  console.log(`    ${now.toLocaleString()}`);
  if (DRY_RUN) console.log("    MODE: DRY RUN — no changes will be made\n");

  let totalFixed = 0;

  // ── 1. Mark overdue loans ────────────────────────────────────────────────
  section("1. Overdue Loans");

  const overdueLoans = await prisma.loan.findMany({
    where: { status: "ACTIVE", dueDate: { lt: now } },
    select: { id: true, memberId: true, bookId: true, dueDate: true },
  });

  if (overdueLoans.length === 0) {
    console.log("  ✅  No loans to update.");
  } else {
    console.log(`  Found ${overdueLoans.length} loan(s) to mark OVERDUE`);
    if (!DRY_RUN) {
      const result = await prisma.loan.updateMany({
        where: { status: "ACTIVE", dueDate: { lt: now } },
        data: { status: "OVERDUE" },
      });
      console.log(`  ✅  Updated ${result.count} loan(s) → OVERDUE`);
      totalFixed += result.count;
    } else {
      overdueLoans.slice(0, 5).forEach((l) =>
        console.log(`       Loan ${l.id.slice(-8)} — due ${l.dueDate.toLocaleDateString()}`)
      );
      if (overdueLoans.length > 5)
        console.log(`       … and ${overdueLoans.length - 5} more`);
    }
  }

  // ── 2. Expire stale reservations ─────────────────────────────────────────
  section("2. Expired Reservations");

  const expiredReservations = await prisma.reservation.findMany({
    where: {
      status: { in: ["PENDING", "APPROVED"] },
      expiresAt: { lt: now },
    },
    select: { id: true, status: true, expiresAt: true },
  });

  if (expiredReservations.length === 0) {
    console.log("  ✅  No reservations to expire.");
  } else {
    console.log(`  Found ${expiredReservations.length} reservation(s) to mark EXPIRED`);
    if (!DRY_RUN) {
      const result = await prisma.reservation.updateMany({
        where: {
          status: { in: ["PENDING", "APPROVED"] },
          expiresAt: { lt: now },
        },
        data: { status: "EXPIRED" },
      });
      console.log(`  ✅  Updated ${result.count} reservation(s) → EXPIRED`);
      totalFixed += result.count;
    } else {
      expiredReservations.slice(0, 5).forEach((r) =>
        console.log(
          `       Reservation ${r.id.slice(-8)} [${r.status}] ` +
          `— expired ${r.expiresAt?.toLocaleDateString()}`
        )
      );
    }
  }

  // ── 3. Deactivate expired memberships ───────────────────────────────────
  section("3. Expired Memberships");

  const expiredMembers = await prisma.member.findMany({
    where: { isActive: true, expireDate: { lt: now } },
    select: { id: true, name: true, expireDate: true },
  });

  if (expiredMembers.length === 0) {
    console.log("  ✅  No expired memberships.");
  } else {
    console.log(`  Found ${expiredMembers.length} membership(s) past expireDate`);
    if (!DRY_RUN) {
      const result = await prisma.member.updateMany({
        where: { isActive: true, expireDate: { lt: now } },
        data: { isActive: false },
      });
      console.log(`  ✅  Deactivated ${result.count} member(s)`);
      totalFixed += result.count;
    } else {
      expiredMembers.slice(0, 5).forEach((m) =>
        console.log(
          `       ${m.name} — expired ${m.expireDate?.toLocaleDateString()}`
        )
      );
    }
  }

  // ── 4. Auto-create fines for overdue loans ────────────────────────────────
  section("4. Fines for Overdue Loans");

  // Fetch library settings for fine rate
  const fineRateSetting = await prisma.settings.findUnique({
    where: { key: "finePerDay" },
  });
  const finePerDay = parseFloat(fineRateSetting?.value ?? "0.25");

  const overdueWithNoFine = await prisma.loan.findMany({
    where: {
      status: "OVERDUE",
      fines: { none: {} },
    },
    select: { id: true, memberId: true, dueDate: true },
  });

  if (overdueWithNoFine.length === 0) {
    console.log("  ✅  All overdue loans already have fines.");
  } else {
    console.log(
      `  Found ${overdueWithNoFine.length} overdue loan(s) missing a fine ` +
      `(rate: $${finePerDay}/day)`
    );
    if (!DRY_RUN) {
      let created = 0;
      for (const loan of overdueWithNoFine) {
        const daysLate = Math.max(
          1,
          Math.ceil((now.getTime() - loan.dueDate.getTime()) / 86_400_000)
        );
        const amount = parseFloat((daysLate * finePerDay).toFixed(2));
        await prisma.fine.create({
          data: {
            loanId:   loan.id,
            memberId: loan.memberId,
            amount,
            daysLate,
            status: "UNPAID",
          },
        });
        created++;
      }
      console.log(`  ✅  Created ${created} fine(s)`);
      totalFixed += created;
    } else {
      overdueWithNoFine.slice(0, 5).forEach((l) => {
        const days = Math.ceil(
          (now.getTime() - l.dueDate.getTime()) / 86_400_000
        );
        console.log(
          `       Loan ${l.id.slice(-8)} — ${days}d overdue → ` +
          `would create $${(days * finePerDay).toFixed(2)} fine`
        );
      });
    }
  }

  // ── 5. Heal READY reservations whose copy isn't actually RESERVED ────────
  section("5. Orphan READY Reservations");

  const orphanReady = await prisma.reservation.findMany({
    where:  { status: "READY", copyId: { not: null } },
    select: { id: true, copyId: true, copy: { select: { status: true } }, book: { select: { title: true } } },
  });
  const reservationsToHeal = orphanReady.filter((r) => r.copy?.status !== "RESERVED");

  if (reservationsToHeal.length === 0) {
    console.log("  ✅  No orphan READY reservations.");
  } else {
    console.log(`  Found ${reservationsToHeal.length} READY reservation(s) whose copy is no longer RESERVED`);
    if (!DRY_RUN) {
      for (const r of reservationsToHeal) {
        await prisma.reservation.update({
          where: { id: r.id },
          data:  { status: "APPROVED", copyId: null, holdShelf: null },
        });
      }
      console.log(`  ✅  Reverted ${reservationsToHeal.length} reservation(s) to APPROVED`);
      totalFixed += reservationsToHeal.length;
    } else {
      reservationsToHeal.slice(0, 5).forEach((r) =>
        console.log(`       Reservation ${r.id.slice(-8)} — '${r.book.title}' copy status=${r.copy?.status ?? "missing"}`)
      );
    }
  }

  // ── 6. Release orphan RESERVED copies (no READY reservation) ─────────────
  section("6. Orphan RESERVED Copies");

  const reservedCopies = await prisma.bookCopy.findMany({
    where:  { status: "RESERVED" },
    select: { id: true, bookId: true, copyNumber: true, reservations: { where: { status: "READY" }, select: { id: true } }, book: { select: { title: true } } },
  });
  const copiesToRelease = reservedCopies.filter((c) => c.reservations.length === 0);

  if (copiesToRelease.length === 0) {
    console.log("  ✅  No orphan RESERVED copies.");
  } else {
    console.log(`  Found ${copiesToRelease.length} RESERVED copy/copies with no holding reservation`);
    if (!DRY_RUN) {
      for (const c of copiesToRelease) {
        await prisma.bookCopy.update({ where: { id: c.id }, data: { status: "AVAILABLE" } });
        await prisma.book.update({
          where: { id: c.bookId },
          data:  { availableCopies: { increment: 1 } },
        });
      }
      console.log(`  ✅  Released ${copiesToRelease.length} copy/copies back to AVAILABLE`);
      totalFixed += copiesToRelease.length;
    } else {
      copiesToRelease.slice(0, 5).forEach((c) =>
        console.log(`       '${c.book.title}' copy #${c.copyNumber}`)
      );
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  section("Summary");
  if (DRY_RUN) {
    console.log("  ℹ️   Dry run — no changes were made.");
    console.log("       Remove --dry-run to apply fixes.\n");
  } else if (totalFixed === 0) {
    console.log("  ✅  Everything is clean — nothing needed fixing.\n");
  } else {
    console.log(`  ✅  Fixed ${totalFixed} item(s) successfully.\n`);
  }
}

main()
  .catch((e) => { console.error("❌  Cleanup error:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
