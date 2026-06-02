import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";

/**
 * GET /api/stock
 *   ?page=1&pageSize=30
 *   ?bookId=...         filter movements by book
 *   ?type=RECEIVED      filter by movement type
 *
 * Returns:
 *   { summary, movements: [...], total, page, pageSize }
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const page     = Math.max(1, Number(searchParams.get("page")     ?? 1));
  const pageSize = Math.min(100, Number(searchParams.get("pageSize") ?? 30));
  const bookId   = searchParams.get("bookId")  ?? undefined;
  const type     = searchParams.get("type")    ?? undefined;
  const branchId = searchParams.get("branchId") ?? undefined;

  // Month start for "this month" stats
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  // ── Summary counts + sales stats ────────────────────────────────────────
  const [
    inStock, forSale, available, totalCopies,
    forSaleValueRaw, soldThisMonth, revenueThisMonthRaw,
    lowStockGrouped,
    movements, totalMovements,
  ] = await Promise.all([
    prisma.bookCopy.count({ where: { status: "STOCK"     } }),
    prisma.bookCopy.count({ where: { status: "FOR_SALE"  } }),
    prisma.bookCopy.count({ where: { status: "AVAILABLE" } }),
    prisma.bookCopy.count(),

    // Total monetary value of all FOR_SALE copies
    prisma.bookCopy.aggregate({
      where: { status: "FOR_SALE" },
      _sum:  { price: true },
    }),

    // Copies sold this calendar month (via stock movement)
    prisma.stockMovement.count({
      where: { type: "SOLD", createdAt: { gte: monthStart } },
    }),

    // Revenue from completed orders this month
    prisma.saleOrder.aggregate({
      where: { status: "COMPLETED", createdAt: { gte: monthStart } },
      _sum:  { total: true },
    }),

    // Books with only 1 FOR_SALE copy left (low stock)
    prisma.bookCopy.groupBy({
      by:     ["bookId"],
      where:  { status: "FOR_SALE" },
      _count: { id: true },
      having: { id: { _count: { lte: 1 } } },
    }),

    prisma.stockMovement.findMany({
      where: {
        ...(bookId   && { bookId }),
        ...(type     && { type: type as never }),
        ...(branchId && {
          OR: [{ fromBranchId: branchId }, { toBranchId: branchId }],
        }),
      },
      include: {
        copy: { select: { id: true, copyNumber: true, barcode: true } },
        book: { select: { id: true, title: true, isbn: true,
                          author: { select: { name: true } } } },
        fromBranch: { select: { id: true, name: true } },
        toBranch:   { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip:  (page - 1) * pageSize,
      take:  pageSize,
    }),
    prisma.stockMovement.count({
      where: {
        ...(bookId   && { bookId }),
        ...(type     && { type: type as never }),
        ...(branchId && {
          OR: [{ fromBranchId: branchId }, { toBranchId: branchId }],
        }),
      },
    }),
  ]);

  // Resolve low-stock book details (dependent on groupBy result)
  const lowStockBookIds = lowStockGrouped.map(g => g.bookId);
  const lowStockBooks = lowStockBookIds.length > 0
    ? await prisma.book.findMany({
        where:   { id: { in: lowStockBookIds } },
        select:  { id: true, title: true, author: { select: { name: true } } },
        take:    20,
        orderBy: { title: "asc" },
      })
    : [];

  return NextResponse.json({
    summary: {
      inStock, forSale, available, totalCopies,
      forSaleValue:     forSaleValueRaw._sum.price     ?? 0,
      soldThisMonth,
      revenueThisMonth: revenueThisMonthRaw._sum.total ?? 0,
      lowStockBooks,
    },
    movements,
    total:    totalMovements,
    page,
    pageSize,
  });
}
