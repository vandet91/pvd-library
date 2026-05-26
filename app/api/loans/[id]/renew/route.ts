import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

const SETTING_DEFAULTS = { MAX_RENEWALS: "2", DEFAULT_LOAN_DAYS: "14" };

async function getSetting(key: keyof typeof SETTING_DEFAULTS): Promise<number> {
  const row = await prisma.settings.findUnique({ where: { key } });
  return Number(row?.value ?? SETTING_DEFAULTS[key]);
}

/* POST /api/loans/[id]/renew  — extend due date by DEFAULT_LOAN_DAYS */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const loan = await prisma.loan.findUnique({
    where: { id },
    include: { member: true, book: { select: { title: true } } },
  });

  if (!loan)
    return NextResponse.json({ error: "Loan not found" }, { status: 404 });

  if (loan.status === "RETURNED")
    return NextResponse.json({ error: "Cannot renew a returned loan" }, { status: 400 });

  if (loan.loanType === "IN_LIBRARY")
    return NextResponse.json({ error: "In-library loans cannot be renewed — the book must be returned today" }, { status: 400 });

  /* Check renewal limit */
  const maxRenewals = await getSetting("MAX_RENEWALS");
  if (loan.renewalCount >= maxRenewals) {
    return NextResponse.json(
      { error: `Maximum renewals (${maxRenewals}) reached` },
      { status: 400 },
    );
  }

  /* Extend due date from today or current due date (whichever is later) */
  const loanDays  = await getSetting("DEFAULT_LOAN_DAYS");
  const base      = new Date(Math.max(Date.now(), loan.dueDate.getTime()));
  const newDueDate = new Date(base);
  newDueDate.setDate(newDueDate.getDate() + loanDays);

  const updated = await prisma.loan.update({
    where: { id },
    data: {
      dueDate:     newDueDate,
      renewalCount: { increment: 1 },
      status:      "ACTIVE",          // un-flag overdue on renewal
    },
    include: { member: true, book: { select: { title: true } } },
  });

  return NextResponse.json(updated);
}
