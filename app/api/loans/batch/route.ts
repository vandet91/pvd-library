import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { logActivity, actorFromSession, Actions } from "@/lib/activity-log";
import { notifyMember, tg } from "@/lib/telegram";
import { resolveCirculationRule } from "@/lib/circulation-rules";
import { addOpenDays } from "@/lib/calendar";

/**
 * POST /api/loans/batch
 * Borrow multiple books for one member in a single atomic transaction.
 *
 * Body (new): { memberId, items: { bookId, copyId? }[], loanDays }
 * Body (legacy): { memberId, bookIds: string[], loanDays }
 *
 * If copyId is omitted for an item, the first AVAILABLE copy is auto-picked.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "STAFF"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as {
    memberId: string;
    bookIds?: string[];                        // legacy
    items?:   { bookId: string; copyId?: string }[];
    loanDays?: number;
    overrideLoanDays?: number;                 // explicit staff override — bypasses rule loanDays
    loanType?: "HOME" | "IN_LIBRARY";
    branchId?: string;                         // branch processing the checkout
    overrideRestriction?: boolean;             // LIBRARIAN+ can override IN_LIBRARY_ONLY
  };
  const { memberId } = body;
  const checkoutBranchId = body.branchId || null;
  const loanType = body.loanType === "IN_LIBRARY" ? "IN_LIBRARY" : "HOME";
  // loanDays resolved from circulation rule after member+book are known below.
  // body.loanDays is only used as an explicit staff override (sent separately from the rule value).
  let loanDays = 0;

  // Normalize both payload shapes into one `items` array
  const items = body.items
    ?? (body.bookIds ?? []).map((bookId) => ({ bookId } as { bookId: string; copyId?: string }));

  if (!memberId || items.length === 0)
    return NextResponse.json({ error: "memberId and items[] are required" }, { status: 400 });

  const member = await prisma.member.findUnique({ where: { id: memberId } });
  if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  // ── Restriction guard ────────────────────────────────────────────
  const blockedStatuses = ["BLOCKED", "BLACKLISTED", "SUSPENDED"];
  if (blockedStatuses.includes(member.restrictionStatus)) {
    return NextResponse.json({
      error: `Member account is ${member.restrictionStatus.toLowerCase().replace(/_/g, " ")} — borrowing is not permitted. Reason: ${member.restrictionReason ?? "Contact the librarian."}`,
      code:  "ACCOUNT_RESTRICTED",
      restrictionStatus: member.restrictionStatus,
    }, { status: 403 });
  }
  if (member.restrictionStatus === "IN_LIBRARY_ONLY" && loanType === "HOME") {
    const canOverride = body.overrideRestriction === true && can(session.user?.role, "LIBRARIAN");
    if (!canOverride) {
      return NextResponse.json({
        error: `Member is restricted to in-library borrowing only. Use "In-Library" loan type, or ask a librarian to override.`,
        code:  "IN_LIBRARY_ONLY",
        restrictionStatus: member.restrictionStatus,
      }, { status: 403 });
    }
  }

  // ── Resolve circulation rule for this member type ─────────────────
  // We use the first book's material type as a heuristic for the rule lookup.
  // Per-book rules are enforced later in the item loop.
  const bookIds = items.map((i) => i.bookId);
  const firstBook = await prisma.book.findUnique({ where: { id: bookIds[0] }, select: { materialType: true } });
  const circRule = await resolveCirculationRule({
    memberType:   member.memberType,
    materialType: firstBook?.materialType ?? null,
    branchId:     checkoutBranchId,
  });

  // allowHomeLoan rule enforcement (e.g. reference-only material types)
  if (loanType === "HOME" && !circRule.allowHomeLoan) {
    const canOverride = body.overrideRestriction === true && can(session.user?.role, "LIBRARIAN");
    if (!canOverride) {
      return NextResponse.json({
        error: circRule.ruleName
          ? `Rule "${circRule.ruleName}" does not allow home loans for this combination.`
          : "Home loans are not allowed for this material type or patron type.",
        code: "RULE_NO_HOME_LOAN",
      }, { status: 403 });
    }
  }

  // ── Quota + overdue check ─────────────────────────────────────────
  const maxLoans = circRule.maxLoans;

  const [activeCount, overdueCount, reservationCount] = await Promise.all([
    prisma.loan.count({ where: { memberId, status: "ACTIVE"  } }),
    prisma.loan.count({ where: { memberId, status: "OVERDUE" } }),
    prisma.reservation.count({
      where: {
        memberId,
        status:  { in: ["PENDING", "APPROVED", "READY"] },
        bookId:  { notIn: bookIds },
      },
    }),
  ]);

  // In-library loans don't count against the quota and don't require overdue clearance
  if (loanType === "HOME") {
    if (overdueCount > 0)
      return NextResponse.json({
        error: `Member has ${overdueCount} overdue book${overdueCount > 1 ? "s" : ""} — return them first`,
      }, { status: 409 });

    const slotsLeft = maxLoans - (activeCount + overdueCount + reservationCount);
    if (slotsLeft < 1)
      return NextResponse.json({
        error: `Borrow limit reached — member has ${activeCount} borrowed, ${reservationCount} reserved (limit: ${maxLoans} total)`,
      }, { status: 409 });

    if (items.length > slotsLeft)
      return NextResponse.json({
        error: `Only ${slotsLeft} slot${slotsLeft !== 1 ? "s" : ""} left — cannot borrow ${items.length} books`,
      }, { status: 409 });
  }

  // ── Validate books + pick copies ──────────────────────────────────
  const books   = await prisma.book.findMany({ where: { id: { in: bookIds } } });
  const bookMap = new Map(books.map((b) => [b.id, b]));

  const errors: string[] = [];
  const resolved: { bookId: string; copyId: string | null; title: string }[] = [];

  for (const item of items) {
    const book = bookMap.get(item.bookId);
    if (!book) { errors.push(`Book ${item.bookId} not found`); continue; }
    if (book.referenceOnly && loanType === "HOME") {
      errors.push(`"${book.title}" is reference-only — use "Read in Library" loan type`);
      continue;
    }
    if (book.availableCopies < 1) { errors.push(`"${book.title}" has no available copies`); continue; }

    // For in-library loans, any AVAILABLE copy is fine (even non-loanable / reference copies)
    const copyWhere = loanType === "IN_LIBRARY"
      ? { bookId: item.bookId, status: "AVAILABLE" as const }
      : { bookId: item.bookId, status: "AVAILABLE" as const, loanable: true };

    let copy = item.copyId
      ? await prisma.bookCopy.findUnique({ where: { id: item.copyId } })
      : await prisma.bookCopy.findFirst({ where: copyWhere, orderBy: { copyNumber: "asc" } });

    if (item.copyId && (!copy || copy.bookId !== item.bookId)) {
      errors.push(`"${book.title}" — scanned copy does not match this book`);
      continue;
    }
    if (copy && copy.status !== "AVAILABLE") {
      errors.push(`"${book.title}" — copy #${copy.copyNumber} is currently ${copy.status}`);
      continue;
    }
    if (copy && !copy.loanable && loanType === "HOME") {
      errors.push(`"${book.title}" — copy #${copy.copyNumber} is for in-library use only`);
      continue;
    }
    // copy === null is OK for legacy books with no copies generated yet
    resolved.push({ bookId: item.bookId, copyId: copy?.id ?? null, title: book.title });
  }

  // Duplicate-borrow check — one active loan per book per member
  const existing = await prisma.loan.findMany({
    where: { memberId, bookId: { in: bookIds }, status: { in: ["ACTIVE", "OVERDUE"] } },
    select: { bookId: true },
  });
  if (existing.length > 0) {
    const titles = existing
      .map((e) => `"${bookMap.get(e.bookId)?.title ?? e.bookId}"`)
      .join(", ");
    errors.push(
      `Member already has ${titles} on loan — return current ${existing.length > 1 ? "copies" : "copy"} first, or place a reservation`
    );
  }

  if (errors.length > 0)
    return NextResponse.json({ error: errors.join("; ") }, { status: 409 });

  // ── Atomic transaction ────────────────────────────────────────────
  const now = new Date();
  // Use rule loanDays as base; body.overrideLoanDays is an explicit staff override
  if (loanType === "HOME") {
    loanDays = (body.overrideLoanDays && Number(body.overrideLoanDays) > 0)
      ? Number(body.overrideLoanDays)
      : circRule.loanDays;
  }
  // In-library: due at 23:59 today; home: due in loanDays OPEN days (skips closed days)
  const dueDate = loanType === "IN_LIBRARY"
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
    : await addOpenDays(now, loanDays);

  const createdLoans = await prisma.$transaction(async (tx) => {
    const loans: { id: string; bookId: string; title: string }[] = [];
    for (const r of resolved) {
      const loan = await tx.loan.create({
        data: {
          memberId,
          bookId:   r.bookId,
          copyId:   r.copyId,
          dueDate,
          status:   "ACTIVE",
          loanType,
          ...(checkoutBranchId ? { branchId: checkoutBranchId } : {}),
        },
        select: { id: true, bookId: true },
      });
      await tx.book.update({
        where: { id: r.bookId },
        data:  { availableCopies: { decrement: 1 } },
      });
      if (r.copyId) {
        await tx.bookCopy.update({
          where: { id: r.copyId },
          data:  { status: "BORROWED" },
        });
      }
      loans.push({ id: loan.id, bookId: r.bookId, title: r.title });
    }
    return loans;
  });

  // Log one activity entry per book checked out
  const actor = actorFromSession(session);
  await Promise.all(
    createdLoans.map((loan) =>
      logActivity(actor, Actions.LOAN_CHECKOUT, {
        entityType: "Loan",
        entityId:   loan.id,
        entityName: `${loan.title} → ${member.name}`,
        detail: {
          memberId,
          memberName: member.name,
          bookId:     loan.bookId,
          bookTitle:  loan.title,
          dueDate,
          loanType,
        },
      })
    )
  );

  // Send one Telegram notification covering all books in this checkout
  if (loanType === "HOME") {
    const message = createdLoans.length === 1
      ? tg.checkout(member.name, createdLoans[0].title, dueDate)
      : `📖 <b>Books Checked Out</b>\n\nHi ${member.name}! You have borrowed ${createdLoans.length} books:\n${createdLoans.map((l, i) => `${i + 1}. <i>${l.title}</i>`).join("\n")}\n\nDue date: <b>${dueDate.toLocaleDateString()}</b>`;
    notifyMember(memberId, message).catch(() => {});
  }

  return NextResponse.json({ success: true, count: resolved.length }, { status: 201 });
}
