import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { addDays } from "date-fns";
import { can } from "@/lib/rbac";
import { logActivity, actorFromSession, Actions } from "@/lib/activity-log";
import { notifyMember, tg } from "@/lib/telegram";

const loanSchema = z.object({
  memberId: z.string().min(1),
  bookId: z.string().min(1),
  copyId: z.string().optional(),   // explicit copy via scan, else auto-pick
  loanDays: z.number().min(1).max(90).optional(), // falls back to DEFAULT_LOAN_DAYS setting
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status   = searchParams.get("status") as "ACTIVE" | "RETURNED" | "OVERDUE" | "LOST" | null;
  const memberId = searchParams.get("memberId") || undefined;
  const bookId   = searchParams.get("bookId")   || undefined;
  // barcode / ISBN lookup — trim whitespace so barcode scanners with trailing CR/LF work
  const barcode  = searchParams.get("barcode")?.trim() || undefined;

  /* ── Staff path: see all loans ───────────────────────────────── */
  if (can(session.user?.role, "STAFF")) {
    // Resolve barcode/ISBN → either a specific copyId (preferred) or a bookId (fallback)
    let resolvedBookId = bookId;
    let resolvedCopyId: string | undefined;

    if (barcode && !resolvedBookId) {
      // 1) Try copy barcode/RFID first (most precise — gets THIS specific physical copy)
      const copy = await prisma.bookCopy.findFirst({
        where:  { OR: [{ barcode }, { rfid: barcode }] },
        select: { id: true, bookId: true },
      });
      if (copy) {
        resolvedCopyId = copy.id;
        resolvedBookId = copy.bookId;
      } else {
        // 2) Fall back to book barcode / ISBN
        const book = await prisma.book.findFirst({
          where:  { OR: [{ barcode }, { isbn: barcode }] },
          select: { id: true },
        });
        resolvedBookId = book?.id;
        if (!resolvedBookId)
          return NextResponse.json({ error: "Book not found for that barcode/ISBN" }, { status: 404 });
      }
    }

    const loans = await prisma.loan.findMany({
      where: {
        ...(status           && { status }),
        ...(memberId         && { memberId }),
        // If a specific copy was scanned, filter loans to that exact copy — much
        // better than returning every loan that ever existed for the book.
        ...(resolvedCopyId   && { copyId: resolvedCopyId }),
        ...(resolvedBookId && !resolvedCopyId && { bookId: resolvedBookId }),
      },
      include: { member: true, book: { include: { author: true } }, copy: true, fine: true },
      orderBy: { createdAt: "desc" },
    });

    const now = new Date();
    const updated = await Promise.all(
      loans.map(async (loan: (typeof loans)[0]) => {
        if (loan.status === "ACTIVE" && loan.dueDate < now) {
          return prisma.loan.update({
            where: { id: loan.id }, data: { status: "OVERDUE" },
            include: { member: true, book: { include: { author: true } }, fine: true },
          });
        }
        return loan;
      })
    );
    return NextResponse.json(updated);
  }

  /* ── Patron path: own loans only ─────────────────────────────── */
  const userId = session.user?.id;
  if (!userId) return NextResponse.json([], { status: 200 });

  const member = await prisma.member.findUnique({ where: { userId } });
  if (!member) return NextResponse.json({ error: "No member account linked" }, { status: 404 });

  // Auto-mark overdue before returning
  const now = new Date();
  await prisma.loan.updateMany({
    where: { memberId: member.id, status: "ACTIVE", dueDate: { lt: now } },
    data:  { status: "OVERDUE" },
  });

  const loans = await prisma.loan.findMany({
    where: { memberId: member.id, ...(status ? { status } : { status: { in: ["ACTIVE", "OVERDUE", "RETURNED", "LOST"] } }) },
    include: {
      book: {
        select: {
          id: true, title: true, isbn: true, materialType: true,
          author:     { select: { name: true } },
          coverImage: true,
        },
      },
      fine: { select: { amount: true, status: true, type: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(loans);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "STAFF"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = loanSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors.map((e) => e.message).join(", ") }, { status: 400 });

  const { memberId, bookId, copyId } = parsed.data;

  // Resolve loan duration: explicit body value → DB setting → hard fallback
  let loanDays = parsed.data.loanDays;
  if (!loanDays) {
    const setting = await prisma.settings.findUnique({ where: { key: "DEFAULT_LOAN_DAYS" } });
    loanDays = parseInt(setting?.value ?? "14", 10);
  }

  const book = await prisma.book.findUnique({ where: { id: bookId } });
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });
  if (book.referenceOnly) {
    return NextResponse.json({
      error: `"${book.title}" is reference-only — it can be read in the library but not borrowed.`,
      code:  "REFERENCE_ONLY",
    }, { status: 400 });
  }
  if (book.availableCopies < 1) return NextResponse.json({ error: "No available copies" }, { status: 400 });

  // Pick a copy: explicit (scanned) if provided, else first AVAILABLE
  let copy = copyId
    ? await prisma.bookCopy.findUnique({ where: { id: copyId } })
    : await prisma.bookCopy.findFirst({
        where:   { bookId, status: "AVAILABLE" },
        orderBy: { copyNumber: "asc" },
      });
  if (copyId && (!copy || copy.bookId !== bookId)) {
    return NextResponse.json({ error: "Scanned copy does not belong to this book" }, { status: 400 });
  }
  if (copy && copy.status !== "AVAILABLE") {
    return NextResponse.json({ error: `Copy is currently ${copy.status}` }, { status: 400 });
  }
  if (copy && !copy.loanable) {
    return NextResponse.json({
      error: `Copy #${copy.copyNumber} of "${book.title}" is marked for in-library use only and cannot be borrowed.`,
      code:  "REFERENCE_ONLY",
    }, { status: 400 });
  }
  // copy is null only for legacy books pre-migration — allow but don't link a copy

  const member = await prisma.member.findUnique({ where: { id: memberId } });
  if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  // ── Restriction guard ───────────────────────────────────────────────────────
  const blocked = ["BLOCKED", "BLACKLISTED", "SUSPENDED"];
  if (blocked.includes(member.restrictionStatus)) {
    return NextResponse.json({
      error: `Member account is ${member.restrictionStatus.toLowerCase().replace("_", " ")} — borrowing is not permitted. Reason: ${member.restrictionReason ?? "Contact the librarian."}`,
      code:  "ACCOUNT_RESTRICTED",
      restrictionStatus: member.restrictionStatus,
    }, { status: 403 });
  }
  if (member.restrictionStatus === "IN_LIBRARY_ONLY") {
    const loanType          = (body as { loanType?: string }).loanType ?? "HOME";
    const overrideRestriction = (body as { overrideRestriction?: boolean }).overrideRestriction;
    const canOverride       = overrideRestriction === true && can(session.user?.role, "LIBRARIAN");
    if (loanType === "HOME" && !canOverride) {
      return NextResponse.json({
        error: `Member is restricted to in-library borrowing only. Reason: ${member.restrictionReason ?? "Contact the librarian."}`,
        code:  "IN_LIBRARY_ONLY",
        restrictionStatus: member.restrictionStatus,
      }, { status: 403 });
    }
  }

  const existing = await prisma.loan.findFirst({
    where:   { bookId, memberId, status: { in: ["ACTIVE", "OVERDUE"] } },
    include: { book: { select: { title: true } } },
  });
  if (existing) {
    return NextResponse.json({
      error: `This member already has "${existing.book.title}" on loan — please return the current copy first, or place a reservation to be notified when another copy is available.`,
      code:  "ALREADY_ON_LOAN",
      bookId,
    }, { status: 400 });
  }

  // ── Quota check ────────────────────────────────────────────────────
  // Active items = loans (ACTIVE+OVERDUE) + reservations (PENDING+APPROVED+READY)
  // A reservation for the exact book being checked out is excluded because
  // that slot is being consumed by this loan (same net quota usage).
  const quotaSetting = await prisma.settings.findUnique({ where: { key: "MAX_LOANS_PER_MEMBER" } });
  const maxLoans     = parseInt(quotaSetting?.value ?? process.env.MAX_LOANS_PER_MEMBER ?? "3", 10);

  const [activeCount, overdueCount, reservationCount] = await Promise.all([
    prisma.loan.count({ where: { memberId, status: "ACTIVE"  } }),
    prisma.loan.count({ where: { memberId, status: "OVERDUE" } }),
    prisma.reservation.count({
      where: {
        memberId,
        status:  { in: ["PENDING", "APPROVED", "READY"] },
        bookId:  { not: bookId }, // don't double-count a reservation for this exact book
      },
    }),
  ]);
  const totalActive = activeCount + overdueCount + reservationCount;

  if (overdueCount > 0)
    return NextResponse.json({
      error: `Member has ${overdueCount} overdue book${overdueCount > 1 ? "s" : ""} — please return them before borrowing more`,
    }, { status: 409 });

  if (totalActive >= maxLoans)
    return NextResponse.json({
      error: `Borrow limit reached — member has ${activeCount} borrowed, ${reservationCount} reserved (limit: ${maxLoans} total)`,
    }, { status: 409 });

  const loan = await prisma.$transaction(async (tx) => {
    const created = await tx.loan.create({
      data: {
        memberId, bookId,
        copyId:  copy?.id ?? null,
        dueDate: addDays(new Date(), loanDays),
      },
      include: { member: true, book: true, copy: true },
    });
    await tx.book.update({ where: { id: bookId }, data: { availableCopies: { decrement: 1 } } });
    if (copy) {
      await tx.bookCopy.update({ where: { id: copy.id }, data: { status: "BORROWED" } });
    }
    return created;
  });

  await logActivity(actorFromSession(session), Actions.LOAN_CHECKOUT, {
    entityType: "Loan",
    entityId:   loan.id,
    entityName: `${loan.book.title} → ${loan.member.name}`,
    detail: {
      memberId:   loan.memberId,
      memberName: loan.member.name,
      bookId:     loan.bookId,
      bookTitle:  loan.book.title,
      dueDate:    loan.dueDate,
    },
  });

  notifyMember(loan.memberId, tg.checkout(loan.member.name, loan.book.title, loan.dueDate)).catch(() => {});

  return NextResponse.json(loan, { status: 201 });
}
