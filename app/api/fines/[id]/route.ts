import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { logActivity, actorFromSession, Actions } from "@/lib/activity-log";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !can(session.user?.role, "STAFF"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  if (body.action === "pay") {
    const fine = await prisma.fine.update({
      where: { id },
      data: {
        status:        "PAID",
        paidAt:        new Date(),
        paymentMethod: body.paymentMethod ?? null,
        notes:         body.notes ?? null,
      },
      include: { member: true, loan: { include: { book: true } } },
    });
    await logActivity(actorFromSession(session), Actions.FINE_PAID, {
      entityType: "Fine",
      entityId:   id,
      entityName: fine.member.name,
      detail:     {
        amount:        fine.amount,
        bookTitle:     fine.loan.book.title,
        memberId:      fine.memberId,
        paymentMethod: fine.paymentMethod,
        notes:         fine.notes,
      },
    });
    return NextResponse.json(fine);
  }

  if (body.action === "waive") {
    const fine = await prisma.fine.update({
      where: { id },
      data: {
        status: "WAIVED",
        paidAt: new Date(),
        notes:  body.notes ?? null,
        paymentMethod: "waived",
      },
      include: { member: true, loan: { include: { book: true } } },
    });
    await logActivity(actorFromSession(session), Actions.FINE_WAIVED, {
      entityType: "Fine",
      entityId:   id,
      entityName: fine.member.name,
      detail:     { amount: fine.amount, bookTitle: fine.loan.book.title, notes: fine.notes },
    });
    return NextResponse.json(fine);
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
