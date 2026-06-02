import { NextRequest, NextResponse } from "next/server";
import { aiClient, AI_MODEL, AI_ENABLED } from "@/lib/ai-client";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

export async function GET(_request: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!AI_ENABLED) {
    return NextResponse.json({ error: "AI not configured" }, { status: 503 });
  }

  // Fetch all active loans with relevant data
  const activeLoans = await prisma.loan.findMany({
    where: { status: { in: ["ACTIVE", "OVERDUE"] } },
    include: {
      member: {
        select: {
          id: true, name: true, memberId: true,
          _count: { select: { loans: true } },
        },
      },
      book: {
        select: {
          id: true, title: true, totalCopies: true,
          category: { select: { name: true } },
        },
      },
    },
  });

  // Count overdues per member (from full history)
  const memberIds = [...new Set(activeLoans.map((l) => l.memberId))];
  const overdueCountMap = new Map<string, number>();
  if (memberIds.length > 0) {
    const overdueCounts = await prisma.loan.groupBy({
      by: ["memberId"],
      where: { memberId: { in: memberIds }, status: "OVERDUE" },
      _count: { id: true },
    });
    for (const row of overdueCounts) {
      overdueCountMap.set(row.memberId, row._count.id);
    }
  }

  // Calculate risk scores
  const scored = activeLoans.map((loan) => {
    const daysUntilDue    = Math.ceil((new Date(loan.dueDate).getTime() - Date.now()) / 86_400_000);
    const totalLoans      = loan.member._count.loans;
    const overdueHistory  = overdueCountMap.get(loan.memberId) ?? 0;
    const overdueRatio    = totalLoans > 0 ? overdueHistory / totalLoans : 0;

    let score = 0;
    if (daysUntilDue < 3)  score += 3;
    if (loan.status === "OVERDUE") score += 5;
    score += overdueRatio * 5;
    score += loan.renewalCount * 1;

    return {
      loan,
      member: loan.member,
      book:   loan.book,
      score:  Math.round(score * 10) / 10,
      daysUntilDue,
      overdueHistory,
      totalLoans,
      aiSummary: null as string | null,
    };
  }).sort((a, b) => b.score - a.score);

  // AI summaries for top 20
  const top20 = scored.slice(0, 20);
  await Promise.all(top20.map(async (item) => {
    try {
      const completion = await aiClient.chat.completions.create({
        model: AI_MODEL,
        max_tokens: 100,
        messages: [
          {
            role: "system",
            content: "Write a brief 1-sentence risk note for a librarian about this loan. Be factual and concise.",
          },
          {
            role: "user",
            content: `Loan: "${item.book.title}" borrowed by ${item.member.name}. Due in ${item.daysUntilDue} days (status: ${item.loan.status}). Member has ${item.overdueHistory} overdue in ${item.totalLoans} total loans. Renewals: ${item.loan.renewalCount}.`,
          },
        ],
      });
      item.aiSummary = completion.choices[0]?.message?.content?.trim() ?? null;
    } catch {
      item.aiSummary = null;
    }
  }));

  const highRisk   = scored.filter((l) => l.score >= 5);
  const mediumRisk = scored.filter((l) => l.score >= 2 && l.score < 5);

  // Strip internal Prisma fields for clean response
  const clean = (items: typeof scored) =>
    items.map(({ loan, member, book, score, daysUntilDue, aiSummary }) => ({
      loan: {
        id: loan.id,
        status: loan.status,
        borrowDate: loan.borrowDate,
        dueDate:    loan.dueDate,
        renewalCount: loan.renewalCount,
      },
      member: { id: member.id, name: member.name, memberId: member.memberId },
      book:   { id: book.id,   title: book.title, category: book.category?.name ?? null },
      score,
      daysUntilDue,
      aiSummary,
    }));

  return NextResponse.json({ highRisk: clean(highRisk), mediumRisk: clean(mediumRisk) });
}
