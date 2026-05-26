import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { calculateFine } from "@/lib/utils";
import { can } from "@/lib/rbac";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !can(session.user?.role, "STAFF"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  if (body.action === "return") {
    const loan = await prisma.loan.findUnique({ where: { id }, include: { book: true } });
    if (!loan) return NextResponse.json({ error: "Loan not found" }, { status: 404 });
    if (loan.status === "RETURNED") return NextResponse.json({ error: "Already returned" }, { status: 400 });

    const returnDate = new Date();
    const fineRow    = await prisma.settings.findUnique({ where: { key: "FINE_PER_DAY" } });
    const finePerDay = parseFloat(fineRow?.value ?? process.env.FINE_PER_DAY ?? "0.25");
    const { daysLate, amount } = calculateFine(loan.dueDate, returnDate, finePerDay);

    const updatedLoan = await prisma.$transaction(async (tx) => {
      const updated = await tx.loan.update({
        where: { id },
        data: { status: "RETURNED", returnDate },
        include: { member: true, book: true, fine: true, copy: true },
      });
      await tx.book.update({ where: { id: loan.bookId }, data: { availableCopies: { increment: 1 } } });
      if (loan.copyId) {
        await tx.bookCopy.update({ where: { id: loan.copyId }, data: { status: "AVAILABLE" } });
      }
      if (daysLate > 0) {
        await tx.fine.upsert({
          where:  { loanId: id },
          create: { loanId: id, memberId: loan.memberId, amount, daysLate },
          update: { amount, daysLate },
        });
      }
      return updated;
    });

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

        await tx.fine.upsert({
          where:  { loanId: id },
          create: {
            loanId:   id,
            memberId: loan.memberId,
            amount:   replacementAmount,
            daysLate: 0,
            type:     "REPLACEMENT",
            status:   "UNPAID",
          },
          update: {
            amount: replacementAmount,
            type:   "REPLACEMENT",
            status: "UNPAID",
          },
        });

        // Re-fetch with fine included after upsert
        return tx.loan.findUnique({
          where: { id },
          include: { member: true, book: true, fine: true },
        });
      });

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
    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
