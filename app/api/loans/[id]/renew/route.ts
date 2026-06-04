import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { resolveCirculationRule } from "@/lib/circulation-rules";

/* POST /api/loans/[id]/renew  — extend due date using circulation rule */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const loan = await prisma.loan.findUnique({
    where: { id },
    include: {
      member: { select: { memberType: true } },
      book:   { select: { title: true, materialType: true } },
    },
  });

  if (!loan)
    return NextResponse.json({ error: "Loan not found" }, { status: 404 });

  if (loan.status === "RETURNED")
    return NextResponse.json({ error: "Cannot renew a returned loan" }, { status: 400 });

  if (loan.loanType === "IN_LIBRARY")
    return NextResponse.json({ error: "In-library loans cannot be renewed — the book must be returned today" }, { status: 400 });

  if (loan.dueDate < new Date())
    return NextResponse.json({ error: "Overdue loans cannot be renewed — please return the book and pay any fines first" }, { status: 400 });

  const rule = await resolveCirculationRule({
    memberType:   loan.member.memberType,
    materialType: loan.book.materialType,
    branchId:     loan.branchId,
  });

  if (loan.renewalCount >= rule.maxRenewals) {
    return NextResponse.json(
      { error: `Maximum renewals (${rule.maxRenewals}) reached` },
      { status: 400 },
    );
  }

  /* Extend due date from today or current due date (whichever is later) */
  const base       = new Date(Math.max(Date.now(), loan.dueDate.getTime()));
  const newDueDate = new Date(base);
  newDueDate.setDate(newDueDate.getDate() + rule.renewalDays);

  const updated = await prisma.loan.update({
    where: { id },
    data: {
      dueDate:      newDueDate,
      renewalCount: { increment: 1 },
      status:       "ACTIVE",
    },
    include: { member: true, book: { select: { title: true } } },
  });

  return NextResponse.json(updated);
}
