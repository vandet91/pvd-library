import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";

/**
 * GET /api/members/risk
 * Returns active members that have at least one risk indicator:
 *   - Overdue loans
 *   - Unpaid fines
 *   - Unresolved incidents
 *   - Non-NONE restriction status
 *
 * Scores each member and assigns risk level: LOW / MEDIUM / HIGH
 *
 * Query params:
 *   limit — max results (default 50)
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "STAFF"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "50", 10));

  const members = await prisma.member.findMany({
    where: {
      isActive: true,
      OR: [
        { loans:    { some: { status: "OVERDUE"  } } },
        { fines:    { some: { status: "UNPAID"   } } },
        { incidents:{ some: { resolvedAt: null   } } },
        { restrictionStatus: { not: "NONE" } },
      ],
    },
    include: {
      loans: {
        where: { status: { in: ["ACTIVE", "OVERDUE"] } },
        select: {
          status: true,
          dueDate: true,
          book: { select: { title: true } },
        },
      },
      fines: {
        where: { status: "UNPAID" },
        select: { amount: true, type: true },
      },
      incidents: {
        where: { resolvedAt: null },
        select: { type: true, severity: true, createdAt: true },
      },
    },
  });

  const scored = members
    .map((m) => {
      const overdueLoans   = m.loans.filter((l) => l.status === "OVERDUE");
      const fineTotal      = m.fines.reduce((s, f) => s + f.amount, 0);
      const incidentCount  = m.incidents.length;
      const hasRestriction = m.restrictionStatus !== "NONE";

      // Score formula: overdue × 3  +  fine tier (max 5)  +  incidents × 3  +  restriction × 4
      let score = 0;
      score += overdueLoans.length * 3;
      score += Math.min(Math.floor(fineTotal / 2), 5);
      score += incidentCount * 3;
      if (hasRestriction) score += 4;

      const riskLevel: "HIGH" | "MEDIUM" | "LOW" =
        score >= 8 ? "HIGH" : score >= 3 ? "MEDIUM" : "LOW";

      return {
        id:                m.id,
        name:              m.name,
        memberId:          m.memberId,
        memberType:        m.memberType,
        restrictionStatus: m.restrictionStatus,
        restrictionReason: m.restrictionReason,
        overdueCount:      overdueLoans.length,
        fineTotal,
        incidentCount,
        hasRestriction,
        score,
        riskLevel,
        overdueBooks: overdueLoans.map((l) => ({
          title:   l.book.title,
          dueDate: l.dueDate,
        })),
        maxSeverityIncident: m.incidents.length > 0
          ? Math.max(...m.incidents.map((i) => i.severity))
          : 0,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const summary = {
    total:  scored.length,
    high:   scored.filter((m) => m.riskLevel === "HIGH").length,
    medium: scored.filter((m) => m.riskLevel === "MEDIUM").length,
    low:    scored.filter((m) => m.riskLevel === "LOW").length,
  };

  return NextResponse.json({ members: scored, summary });
}
