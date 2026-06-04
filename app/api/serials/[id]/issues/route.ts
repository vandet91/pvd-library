import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { addDays, addWeeks, addMonths, addQuarters, addYears } from "date-fns";

/**
 * GET  /api/serials/[id]/issues  — list all issues for a serial
 * POST /api/serials/[id]/issues  — create one issue (or generate a batch)
 *   body: { issueNumber, volume, issueDate, status, notes }
 *   body: { generate: true, from, count } — auto-generate expected issues
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const issues = await prisma.serialIssue.findMany({
    where: { serialId: id },
    orderBy: { issueDate: "desc" },
  });
  return NextResponse.json(issues);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: serialId } = await params;
  const body = await req.json();

  // ── Generate mode: create N expected issues from a start date ──
  if (body.generate) {
    const serial = await prisma.serial.findUnique({ where: { id: serialId }, select: { frequency: true } });
    if (!serial) return NextResponse.json({ error: "Serial not found" }, { status: 404 });

    const from  = new Date(body.from);
    const count = Math.min(Number(body.count) || 12, 60);

    function nextDate(d: Date, freq: string): Date {
      switch (freq) {
        case "DAILY":      return addDays(d, 1);
        case "WEEKLY":     return addWeeks(d, 1);
        case "BIWEEKLY":   return addWeeks(d, 2);
        case "MONTHLY":    return addMonths(d, 1);
        case "BIMONTHLY":  return addMonths(d, 2);
        case "QUARTERLY":  return addQuarters(d, 1);
        case "SEMIANNUAL": return addMonths(d, 6);
        case "ANNUAL":     return addYears(d, 1);
        default:           return addMonths(d, 1);
      }
    }

    const issues = [];
    let current = from;
    for (let i = 0; i < count; i++) {
      issues.push({
        serialId,
        issueNumber: `No. ${i + 1}`,
        issueDate:   new Date(current),
        status:      "EXPECTED" as const,
      });
      current = nextDate(current, serial.frequency);
    }

    await prisma.serialIssue.createMany({ data: issues, skipDuplicates: true });
    return NextResponse.json({ created: issues.length }, { status: 201 });
  }

  // ── Single issue ──
  const { issueNumber, volume, issueDate, receivedDate, status, notes } = body;
  if (!issueNumber?.trim() || !issueDate)
    return NextResponse.json({ error: "issueNumber and issueDate are required" }, { status: 400 });

  const issue = await prisma.serialIssue.create({
    data: {
      serialId,
      issueNumber:  issueNumber.trim(),
      volume:       volume?.trim()       || null,
      issueDate:    new Date(issueDate),
      receivedDate: receivedDate ? new Date(receivedDate) : null,
      status:       status || "EXPECTED",
      notes:        notes?.trim()        || null,
    },
  });
  return NextResponse.json(issue, { status: 201 });
}
