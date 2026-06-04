import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { name, memberType, materialType, branchId, loanDays, maxLoans, maxRenewals, renewalDays, finePerDay, allowHomeLoan, isActive, notes } = body;

  const rule = await prisma.circulationRule.update({
    where: { id },
    data: {
      ...(name !== undefined         && { name: name.trim() }),
      ...(memberType   !== undefined && { memberType:   memberType   || null }),
      ...(materialType !== undefined && { materialType: materialType || null }),
      ...(branchId     !== undefined && { branchId:     branchId     || null }),
      ...(loanDays     !== undefined && { loanDays:     Number(loanDays) }),
      ...(maxLoans     !== undefined && { maxLoans:     Number(maxLoans) }),
      ...(maxRenewals  !== undefined && { maxRenewals:  Number(maxRenewals) }),
      ...(renewalDays  !== undefined && { renewalDays:  Number(renewalDays) }),
      ...(finePerDay   !== undefined && { finePerDay:   Number(finePerDay) }),
      ...(allowHomeLoan !== undefined && { allowHomeLoan }),
      ...(isActive     !== undefined && { isActive }),
      ...(notes        !== undefined && { notes: notes?.trim() || null }),
    },
    include: { branch: { select: { id: true, name: true } } },
  });

  return NextResponse.json(rule);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session || !can(session.user?.role, "ADMIN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await prisma.circulationRule.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
