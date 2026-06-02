import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "STAFF"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status   = searchParams.get("status") as "PAID" | "UNPAID" | "WAIVED" | null;
  const memberId = searchParams.get("memberId") || undefined;
  const search   = searchParams.get("search")?.trim() || undefined;
  const page     = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit    = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));

  const where = {
    ...(status   ? { status }   : {}),
    ...(memberId ? { memberId } : {}),
    ...(search   ? {
      OR: [
        { member: { name:     { contains: search, mode: "insensitive" } } },
        { member: { memberId: { contains: search, mode: "insensitive" } } },
      ],
    } : {}),
  };

  const baseWhere = {
    ...(memberId ? { memberId } : {}),
    ...(search   ? {
      OR: [
        { member: { name:     { contains: search, mode: "insensitive" } } },
        { member: { memberId: { contains: search, mode: "insensitive" } } },
      ],
    } : {}),
  };

  const [fines, total, unpaidSum, paidSum, waivedCount] = await Promise.all([
    prisma.fine.findMany({
      where,
      include: { member: true, loan: { include: { book: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.fine.count({ where }),
    prisma.fine.aggregate({ where: { ...baseWhere, status: "UNPAID" }, _sum: { amount: true } }),
    prisma.fine.aggregate({ where: { ...baseWhere, status: "PAID"   }, _sum: { amount: true } }),
    prisma.fine.count({    where: { ...baseWhere, status: "WAIVED"  } }),
  ]);

  return NextResponse.json({
    fines, total, page, limit,
    totalPages:  Math.ceil(total / limit),
    totalUnpaid: unpaidSum._sum.amount ?? 0,
    totalPaid:   paidSum._sum.amount   ?? 0,
    waivedCount,
  });
}
