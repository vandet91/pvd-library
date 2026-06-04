import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: serialId } = await params;
  const { vendorId, startDate, endDate, cost, currency = "USD", autoRenew, notes } = await req.json();

  if (!startDate)
    return NextResponse.json({ error: "startDate is required" }, { status: 400 });

  const sub = await prisma.subscription.create({
    data: {
      serialId,
      vendorId:  vendorId  || null,
      startDate: new Date(startDate),
      endDate:   endDate ? new Date(endDate) : null,
      cost:      cost ? Number(cost) : null,
      currency,
      autoRenew: autoRenew === true,
      notes:     notes?.trim() || null,
    },
    include: { vendor: { select: { id: true, name: true } } },
  });
  return NextResponse.json(sub, { status: 201 });
}
