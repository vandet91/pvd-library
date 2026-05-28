import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { auth } from "@/lib/auth";
import { subMonths, format } from "date-fns";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session || !can(session.user?.role, "LIBRARIAN"))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const from     = searchParams.get("from") ? new Date(searchParams.get("from")!) : undefined;
    const to       = searchParams.get("to")   ? new Date(searchParams.get("to")!)   : undefined;
    const branchId = searchParams.get("branchId") || undefined;

    const dateFilter  = from && to ? { gte: from, lte: to } : undefined;
    // Shorthand for branch filter on models that have branchId directly
    const branchWhere = branchId ? { branchId } : {};

    // ── Core queries ───────────────────────────────────────────────
    const [
      totalBorrowed,
      totalReturned,
      totalOverdue,
      popularBooks,
      fineStats,
      allLoans,
      topMemberLoans,
      paidFines,
    ] = await Promise.all([
      // Circulation stats — filter on Loan.branchId
      prisma.loan.count({
        where: {
          ...(dateFilter && { createdAt: dateFilter }),
          ...branchWhere,
        },
      }),
      prisma.loan.count({
        where: {
          status: "RETURNED",
          ...(dateFilter && { updatedAt: dateFilter }),
          ...branchWhere,
        },
      }),
      prisma.loan.count({
        where: {
          status: { in: ["ACTIVE", "OVERDUE"] },
          dueDate: { lt: new Date() },
          ...branchWhere,
        },
      }),
      // Popular books — loans for this branch only
      prisma.loan.groupBy({
        by:      ["bookId"],
        where:   { ...branchWhere },
        _count:  { bookId: true },
        orderBy: { _count: { bookId: "desc" } },
        take:    10,
      }),
      // Fine totals — through loan.branchId
      prisma.fine.aggregate({
        _sum:  { amount: true },
        where: {
          status: "PAID",
          ...(branchId && { loan: { branchId } }),
        },
      }),
      // All loans for monthly chart (last 12 months)
      prisma.loan.findMany({
        where:  {
          createdAt: { gte: subMonths(new Date(), 11) },
          ...branchWhere,
        },
        select: { createdAt: true },
      }),
      // Top members by loans
      prisma.loan.groupBy({
        by:      ["memberId"],
        where:   { ...branchWhere },
        _count:  { memberId: true },
        orderBy: { _count: { memberId: "desc" } },
        take:    10,
      }),
      // Paid fines by month (last 12 months)
      prisma.fine.findMany({
        where: {
          status:  "PAID",
          paidAt:  { gte: subMonths(new Date(), 11) },
          ...(branchId && { loan: { branchId } }),
        },
        select: { amount: true, paidAt: true },
      }),
    ]);

    // ── Category distribution — books in this branch ───────────────
    // Use book.groupBy + categoryId so we can apply the branch filter,
    // then join with category names in a second query.
    let categoryDistribution: { name: string; count: number }[] = [];
    try {
      const catGroups = await prisma.book.groupBy({
        by:      ["categoryId"],
        where:   {
          categoryId: { not: null },
          ...branchWhere,
        },
        _count:  { id: true },
        orderBy: { _count: { id: "desc" } },
        take:    10,
      });
      if (catGroups.length > 0) {
        const catIds = catGroups
          .map((g: { categoryId: string | null }) => g.categoryId)
          .filter((id): id is string => id !== null);
        const cats = await prisma.category.findMany({
          where:  { id: { in: catIds } },
          select: { id: true, name: true },
        });
        const nameMap = new Map(cats.map((c: { id: string; name: string }) => [c.id, c.name]));
        categoryDistribution = catGroups
          .map((g: { categoryId: string | null; _count: { id: number } }) => ({
            name:  nameMap.get(g.categoryId ?? "") ?? "Unknown",
            count: g._count.id,
          }))
          .filter((c) => c.count > 0);
      }
    } catch {
      // fallback: unfiltered category list
      const fallback = await prisma.category.findMany({
        include: { _count: { select: { books: true } } },
        orderBy: { books: { _count: "desc" } },
        take:    10,
      });
      categoryDistribution = fallback
        .map((c: { name: string; _count: { books: number } }) => ({ name: c.name, count: c._count.books }))
        .filter((c: { count: number }) => c.count > 0);
    }

    // ── Material type distribution ─────────────────────────────────
    let materialTypeDistribution: { name: string; count: number }[] = [];
    try {
      const groups = await prisma.book.groupBy({
        by:      ["materialType"],
        where:   { ...branchWhere },
        _count:  { id: true },
        orderBy: { _count: { id: "desc" } },
      });
      materialTypeDistribution = groups
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((g: any) => ({ name: String(g.materialType), count: Number(g._count.id) }))
        .filter((g: { count: number }) => g.count > 0);
    } catch {
      // silently omit
    }

    // ── Collection inventory ───────────────────────────────────────
    let totalBooks      = 0;
    let totalCopies     = 0;
    let activeMembers   = 0;
    let copyStatusDistribution: { name: string; count: number }[] = [];
    let copyConditionDistribution: { name: string; count: number }[] = [];
    try {
      const [booksCount, copyStatusGroups, copyConditionGroups, activeMembersCount] = await Promise.all([
        // Books in this branch
        prisma.book.count({ where: { ...branchWhere } }),
        // Copies in this branch
        prisma.bookCopy.groupBy({ by: ["status"],    where: { ...branchWhere }, _count: { id: true } }),
        prisma.bookCopy.groupBy({ by: ["condition"], where: { ...branchWhere }, _count: { id: true } }),
        // Members have no branchId — always show the global count
        prisma.member.count({ where: { isActive: true } }),
      ]);
      totalBooks    = booksCount;
      activeMembers = activeMembersCount;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      copyStatusDistribution    = copyStatusGroups.map((g: any) => ({ name: String(g.status),    count: Number(g._count.id) }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      copyConditionDistribution = copyConditionGroups.map((g: any) => ({ name: String(g.condition), count: Number(g._count.id) }));
      totalCopies = copyStatusDistribution.reduce((s, x) => s + x.count, 0);
    } catch {
      // Pre-Phase-3 install — silently omit copy stats
    }

    // ── Resolve popular book details ───────────────────────────────
    const bookIds = popularBooks.map((p: { bookId: string }) => p.bookId);
    const books   = await prisma.book.findMany({ where: { id: { in: bookIds } }, include: { author: true } });
    const popularBooksData = popularBooks.map((p: { bookId: string; _count: { bookId: number } }) => ({
      ...books.find((b: { id: string }) => b.id === p.bookId),
      borrowCount: p._count.bookId,
    }));

    // ── Resolve top member details ─────────────────────────────────
    const memberIds  = topMemberLoans.map((m: { memberId: string }) => m.memberId);
    const members    = await prisma.member.findMany({ where: { id: { in: memberIds } }, select: { id: true, name: true } });
    const topMembers = topMemberLoans.map((m: { memberId: string; _count: { memberId: number } }) => ({
      name:  members.find((mem: { id: string }) => mem.id === m.memberId)?.name ?? "Unknown",
      loans: m._count.memberId,
    }));

    // ── Monthly loans chart (last 12 months) ──────────────────────
    const monthlyMap: Record<string, number> = {};
    for (let i = 11; i >= 0; i--) {
      monthlyMap[format(subMonths(new Date(), i), "yyyy-MM")] = 0;
    }
    for (const loan of allLoans) {
      const key = format(loan.createdAt, "yyyy-MM");
      if (key in monthlyMap) monthlyMap[key] = (monthlyMap[key] ?? 0) + 1;
    }
    const monthlyLoans = Object.entries(monthlyMap).map(([month, loans]) => ({
      month: format(new Date(month + "-01"), "MMM yy"),
      loans,
    }));

    // ── Fines by month (last 12 months) ───────────────────────────
    const finesMap: Record<string, number> = {};
    for (let i = 11; i >= 0; i--) {
      finesMap[format(subMonths(new Date(), i), "yyyy-MM")] = 0;
    }
    for (const fine of paidFines) {
      if (fine.paidAt) {
        const key = format(fine.paidAt, "yyyy-MM");
        if (key in finesMap) finesMap[key] = parseFloat(((finesMap[key] ?? 0) + fine.amount).toFixed(2));
      }
    }
    const finesByMonth = Object.entries(finesMap).map(([month, amount]) => ({
      month: format(new Date(month + "-01"), "MMM yy"),
      amount,
    }));

    return NextResponse.json({
      totalBorrowed,
      totalReturned,
      totalOverdue,
      totalFinesCollected: fineStats._sum.amount ?? 0,
      // Phase-3 additions:
      totalBooks,
      totalCopies,
      activeMembers,
      copyStatusDistribution,
      copyConditionDistribution,
      // Existing:
      popularBooks:           popularBooksData,
      monthlyLoans,
      categoryDistribution,
      materialTypeDistribution,
      topMembers,
      finesByMonth,
    });
  } catch (err) {
    console.error("[ReportsAPI]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
