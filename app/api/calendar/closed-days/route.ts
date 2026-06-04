import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const year = searchParams.get("year");

  const days = await prisma.closedDay.findMany({
    where: year ? {
      OR: [
        { isRecurring: true },
        {
          isRecurring: false,
          date: {
            gte: new Date(`${year}-01-01`),
            lte: new Date(`${year}-12-31`),
          },
        },
      ],
    } : {},
    orderBy: { date: "asc" },
  });
  return NextResponse.json(days);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "ADMIN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { date, reason, isRecurring } = await req.json();
  if (!date)
    return NextResponse.json({ error: "date is required" }, { status: 400 });

  const day = await prisma.closedDay.create({
    data: {
      date:        new Date(date),
      reason:      reason?.trim() || null,
      isRecurring: isRecurring === true,
    },
  });
  return NextResponse.json(day, { status: 201 });
}
