import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { logActivity, actorFromSession, Actions } from "@/lib/activity-log";

/**
 * POST /api/fines/batch
 * Pay or waive all UNPAID fines for a member in one request.
 *
 * Body: { memberId, action: "pay"|"waive", paymentMethod?, notes? }
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "STAFF"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { memberId, action, paymentMethod, notes } = body as {
    memberId:      string;
    action:        "pay" | "waive";
    paymentMethod?: string;
    notes?:        string;
  };

  if (!memberId) return NextResponse.json({ error: "memberId required" }, { status: 400 });
  if (action !== "pay" && action !== "waive")
    return NextResponse.json({ error: "action must be pay or waive" }, { status: 400 });

  const unpaid = await prisma.fine.findMany({
    where:   { memberId, status: "UNPAID" },
    include: { member: { select: { name: true } }, loan: { include: { book: { select: { title: true } } } } },
  });

  if (unpaid.length === 0)
    return NextResponse.json({ updated: 0, totalAmount: 0 });

  const now    = new Date();
  const data   = action === "pay"
    ? { status: "PAID" as const,   paidAt: now, paymentMethod: paymentMethod ?? "cash", notes: notes ?? null }
    : { status: "WAIVED" as const, paidAt: now, paymentMethod: "waived",                notes: notes ?? null };

  await prisma.fine.updateMany({
    where: { memberId, status: "UNPAID" },
    data,
  });

  const totalAmount = unpaid.reduce((s, f) => s + f.amount, 0);
  const memberName  = unpaid[0].member.name;

  await logActivity(actorFromSession(session), action === "pay" ? Actions.FINE_PAID : Actions.FINE_WAIVED, {
    entityType: "Fine",
    entityId:   memberId,
    entityName: memberName,
    detail:     {
      action,
      count:         unpaid.length,
      totalAmount,
      paymentMethod: data.paymentMethod,
      notes,
    },
  });

  return NextResponse.json({ updated: unpaid.length, totalAmount });
}
