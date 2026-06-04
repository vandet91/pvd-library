import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";

export async function GET() {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rules = await prisma.circulationRule.findMany({
    include: { branch: { select: { id: true, name: true } } },
    orderBy: [{ memberType: "asc" }, { materialType: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json(rules);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, memberType, materialType, branchId, loanDays, maxLoans, maxRenewals, renewalDays, finePerDay, allowHomeLoan, notes } = body;

  if (!name?.trim())
    return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const rule = await prisma.circulationRule.create({
    data: {
      name: name.trim(),
      memberType:   memberType   || null,
      materialType: materialType || null,
      branchId:     branchId     || null,
      loanDays:     Number(loanDays)     || 14,
      maxLoans:     Number(maxLoans)     || 3,
      maxRenewals:  Number(maxRenewals)  || 2,
      renewalDays:  Number(renewalDays)  || 14,
      finePerDay:   Number(finePerDay)   || 0.50,
      allowHomeLoan: allowHomeLoan !== false,
      notes:        notes?.trim() || null,
    },
    include: { branch: { select: { id: true, name: true } } },
  });

  return NextResponse.json(rule, { status: 201 });
}
