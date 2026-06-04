import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { calculateFineWithCalendar } from "@/lib/calendar";
import { logActivity, actorFromSession, Actions } from "@/lib/activity-log";
import { notifyMember, tg } from "@/lib/telegram";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !can(session.user?.role, "STAFF"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  if (body.action === "return") {
    // returnBranchId: the branch receiving this return — copy floats to that branch (Option B).
    const returnBranchId = (body.returnBranchId as string | undefined) || null;

    const loan = await prisma.loan.findUnique({ where: { id }, include: { book: true } });
    if (!loan) return NextResponse.json({ error: "Loan not found" }, { status: 404 });
    if (loan.status === "RETURNED") return NextResponse.json({ error: "Already returned" }, { status: 400 });

    const returnDate = new Date();
    const fineRow    = await prisma.settings.findUnique({ where: { key: "FINE_PER_DAY" } });
    const finePerDay = parseFloat(fineRow?.value ?? process.env.FINE_PER_DAY ?? "0.25");
    const { daysLate, amount } = await calculateFineWithCalendar(loan.dueDate, returnDate, finePerDay);

    const updatedLoan = await prisma.$transaction(async (tx) => {
      const updated = await tx.loan.update({
        where: { id },
        data: { status: "RETURNED", returnDate },
        include: { member: true, book: true, fines: true, copy: true },
      });
      await tx.book.update({ where: { id: loan.bookId }, data: { availableCopies: { increment: 1 } } });
      if (loan.copyId) {
        // Floating collection: move copy to the branch that received the return.
        // If no branch was specified the copy stays at its current branch.
        await tx.bookCopy.update({
          where: { id: loan.copyId },
          data: {
            status: "AVAILABLE",
            ...(returnBranchId ? { branchId: returnBranchId } : {}),
          },
        });
      }
      if (daysLate > 0) {
        // Upsert the LATE_FEE fine — preserve any REPLACEMENT fine that may already exist
        const existingLateFee = await tx.fine.findFirst({ where: { loanId: id, type: "LATE_FEE" } });
        if (existingLateFee) {
          await tx.fine.update({ where: { id: existingLateFee.id }, data: { amount, daysLate } });
        } else {
          await tx.fine.create({ data: { loanId: id, memberId: loan.memberId, amount, daysLate, type: "LATE_FEE" } });
        }
      }
      return updated;
    });

    await logActivity(actorFromSession(session), Actions.LOAN_RETURNED, {
      entityType: "Loan",
      entityId:   id,
      entityName: `${updatedLoan.book.title} ← ${updatedLoan.member.name}`,
      detail: {
        memberName: updatedLoan.member.name,
        bookTitle:  updatedLoan.book.title,
        daysLate,
        fineAmount: daysLate > 0 ? amount : 0,
      },
    });
    notifyMember(
      updatedLoan.memberId,
      tg.returned(updatedLoan.member.name, updatedLoan.book.title, daysLate > 0 ? amount : undefined),
    ).catch(() => {});
    return NextResponse.json(updatedLoan);
  }

  if (body.action === "mark-lost") {
    const loan = await prisma.loan.findUnique({
      where: { id },
      include: { book: true },
    });
    if (!loan) return NextResponse.json({ error: "Loan not found" }, { status: 404 });
    if (loan.status === "RETURNED" || loan.status === "LOST")
      return NextResponse.json({ error: "Loan is already closed" }, { status: 400 });

    // Determine replacement amount: body > book.price > setting > $20 default
    let replacementAmount: number = Number(body.amount);
    if (!replacementAmount || isNaN(replacementAmount)) {
      const bookPrice = loan.book.price;
      if (bookPrice && bookPrice > 0) {
        replacementAmount = bookPrice;
      } else {
        const setting = await prisma.settings.findUnique({ where: { key: "DEFAULT_REPLACEMENT_COST" } });
        replacementAmount = parseFloat(setting?.value ?? "20.00");
      }
    }
    replacementAmount = parseFloat(replacementAmount.toFixed(2));

    try {
      // Run all updates atomically
      // NOTE: availableCopies is NOT decremented here — it was already decremented
      // when the loan was created. We only decrement totalCopies because the physical
      // copy is gone. availableCopies stays as-is (already reflects the missing copy).
      const updatedLoan = await prisma.$transaction(async (tx) => {
        await tx.loan.update({
          where: { id },
          data: { status: "LOST" },
        });

        // ONLY decrement totalCopies — do NOT touch book.condition.
        // The title itself is still valid; only one of its physical copies is gone.
        // Other copies remain borrowable.
        await tx.book.update({
          where: { id: loan.bookId },
          data:  { totalCopies: { decrement: 1 } },
        });

        // Mark the specific copy as LOST (status + per-copy condition)
        if (loan.copyId) {
          await tx.bookCopy.update({
            where: { id: loan.copyId },
            data:  { status: "LOST", condition: "LOST" },
          });
        }

        // Keep any existing LATE_FEE fine — don't overwrite it.
        // Add (or update) a separate REPLACEMENT fine for the lost book.
        const existingReplacement = await tx.fine.findFirst({ where: { loanId: id, type: "REPLACEMENT" } });
        if (existingReplacement) {
          await tx.fine.update({
            where: { id: existingReplacement.id },
            data:  { amount: replacementAmount, status: "UNPAID" },
          });
        } else {
          await tx.fine.create({
            data: {
              loanId:   id,
              memberId: loan.memberId,
              amount:   replacementAmount,
              daysLate: 0,
              type:     "REPLACEMENT",
              status:   "UNPAID",
            },
          });
        }

        // Re-fetch with all fines included
        return tx.loan.findUnique({
          where: { id },
          include: { member: true, book: true, fines: true },
        });
      });

      await logActivity(actorFromSession(session), Actions.LOAN_LOST, {
        entityType: "Loan",
        entityId:   id,
        entityName: loan.book.title,
        detail:     { replacementAmount },
      });
      notifyMember(loan.memberId, tg.lostBook(updatedLoan?.member?.name ?? "", loan.book.title, replacementAmount)).catch(() => {});
      return NextResponse.json(updatedLoan);
    } catch (err) {
      console.error("[mark-lost] transaction failed:", err);
      const msg = err instanceof Error ? err.message : "Transaction failed";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  if (body.action === "renew") {
    const loan = await prisma.loan.findUnique({ where: { id } });
    if (!loan) return NextResponse.json({ error: "Loan not found" }, { status: 404 });
    if (loan.status === "RETURNED") return NextResponse.json({ error: "Cannot renew a returned loan" }, { status: 400 });
    if (loan.loanType === "IN_LIBRARY") return NextResponse.json({ error: "In-library loans cannot be renewed — the book must be returned today" }, { status: 400 });
    if (loan.dueDate < new Date()) return NextResponse.json({ error: "Overdue loans cannot be renewed — please return the book and pay any fines first" }, { status: 400 });

    const maxRenewalRow = await prisma.settings.findUnique({ where: { key: "MAX_RENEWALS" } });
    const maxRenewals = Number(maxRenewalRow?.value ?? 2);
    if (loan.renewalCount >= maxRenewals) {
      return NextResponse.json({ error: `Maximum renewals (${maxRenewals}) reached` }, { status: 400 });
    }

    const loanDaysRow = await prisma.settings.findUnique({ where: { key: "DEFAULT_LOAN_DAYS" } });
    const loanDays = Number(loanDaysRow?.value ?? 14);
    const base = new Date(Math.max(Date.now(), loan.dueDate.getTime()));
    base.setDate(base.getDate() + loanDays);

    const updated = await prisma.loan.update({
      where: { id },
      data: { dueDate: base, renewalCount: { increment: 1 }, status: "ACTIVE" },
      include: { member: true, book: { select: { title: true } } },
    });
    await logActivity(actorFromSession(session), Actions.LOAN_RENEWED, {
      entityType: "Loan",
      entityId:   id,
      entityName: `${updated.book.title} — ${updated.member.name}`,
      detail:     { renewalCount: updated.renewalCount, newDueDate: updated.dueDate },
    });
    notifyMember(
      updated.memberId,
      tg.renewed(updated.member.name, updated.book.title, updated.dueDate, updated.renewalCount),
    ).catch(() => {});
    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
