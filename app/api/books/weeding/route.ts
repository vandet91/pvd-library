import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";

/**
 * GET /api/books/weeding
 * Returns weeding (deaccession) candidates.
 *
 * Query params:
 *   tab          — "poor" | "dormant" | "never"  (default: "poor")
 *   dormantDays  — days threshold for "dormant" tab  (default: 730 = 2 years)
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const dormantDays = Math.max(30, parseInt(searchParams.get("dormantDays") ?? "730", 10));
  const tab         = (searchParams.get("tab") ?? "poor") as "poor" | "dormant" | "never";

  const dormantCutoff   = new Date(Date.now() - dormantDays * 24 * 60 * 60 * 1000);
  const oneYearAgo      = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const EXCLUDED_CONDS  = ["WITHDRAWN", "ARCHIVED", "LOST"] as const;

  const baseInclude = {
    author:   { select: { name: true } },
    category: { select: { name: true } },
    _count:   { select: { loans: true } },
  } as const;

  // ── Tab: Poor condition ───────────────────────────────────────────────────
  if (tab === "poor") {
    const books = await prisma.book.findMany({
      where: {
        condition:   { in: ["POOR", "DAMAGED", "FAIR"] as never[] },
        withdrawnAt: null,
      },
      include: {
        ...baseInclude,
        loans: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
      },
      orderBy: [{ condition: "asc" }, { createdAt: "asc" }],
      take: 100,
    });
    return NextResponse.json({ books, tab, dormantDays });
  }

  // ── Tab: Long dormant (has been borrowed before, but not recently) ────────
  if (tab === "dormant") {
    const books = await prisma.book.findMany({
      where: {
        withdrawnAt: null,
        condition:   { notIn: EXCLUDED_CONDS as unknown as never[] },
      },
      include: {
        ...baseInclude,
        loans: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
      },
    });

    const dormant = books
      .filter((b) => b.loans.length > 0 && new Date(b.loans[0].createdAt) < dormantCutoff)
      .sort((a, b) => {
        const aDate = new Date(a.loans[0].createdAt).getTime();
        const bDate = new Date(b.loans[0].createdAt).getTime();
        return aDate - bDate; // oldest first
      })
      .slice(0, 100);

    return NextResponse.json({ books: dormant, tab, dormantDays });
  }

  // ── Tab: Never borrowed (added 1+ year ago, zero loan history) ───────────
  const books = await prisma.book.findMany({
    where: {
      createdAt:   { lt: oneYearAgo },
      withdrawnAt: null,
      condition:   { notIn: ["WITHDRAWN", "ARCHIVED"] as never[] },
    },
    include: {
      ...baseInclude,
      loans: { take: 1, select: { id: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const neverBorrowed = books
    .filter((b) => b.loans.length === 0)
    .slice(0, 100);

  return NextResponse.json({ books: neverBorrowed, tab, dormantDays });
}
