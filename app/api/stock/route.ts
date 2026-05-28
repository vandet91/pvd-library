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

  // ── Summary counts ──────────────────────────────────────────────────────
  const [inStock, forSale, available, totalCopies, movements, totalMovements] =
    await Promise.all([
      prisma.bookCopy.count({ where: { status: "STOCK"    } }),
      prisma.bookCopy.count({ where: { status: "FOR_SALE" } }),
      prisma.bookCopy.count({ where: { status: "AVAILABLE" } }),
      prisma.bookCopy.count(),
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

  return NextResponse.json({
    summary: { inStock, forSale, available, totalCopies },
    movements,
    total:    totalMovements,
    page,
    pageSize,
  });
}
