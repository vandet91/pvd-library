import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";

/**
 * GET /api/admin/sale/orders
 *   ?status=PAYMENT_SUBMITTED
 *   ?page=1&pageSize=30
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "STAFF"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status   = searchParams.get("status")   ?? undefined;
  const page     = Math.max(1, Number(searchParams.get("page")     ?? 1));
  const pageSize = Math.min(50, Number(searchParams.get("pageSize") ?? 20));

  const where = status ? { status: status as never } : {};

  const [orders, total] = await Promise.all([
    prisma.saleOrder.findMany({
      where,
      include: {
        memberRel: { select: { id: true, memberId: true, name: true, email: true, phone: true } },
        branch:    { select: { id: true, name: true } },
        items: {
          include: {
            book: { select: { id: true, title: true, coverImage: true, author: { select: { name: true } } } },
            copy: { select: { id: true, copyNumber: true, barcode: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip:    (page - 1) * pageSize,
      take:    pageSize,
    }),
    prisma.saleOrder.count({ where }),
  ]);

  // Also return quick counts per status for the tab badges
  const statusCounts = await prisma.saleOrder.groupBy({
    by:     ["status"],
    _count: { _all: true },
  });

  return NextResponse.json({
    orders,
    total,
    page,
    pageSize,
    statusCounts: Object.fromEntries(statusCounts.map((r) => [r.status, r._count._all])),
  });
}
