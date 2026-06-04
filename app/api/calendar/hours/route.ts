import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";

const DEFAULT_HOURS = [0,1,2,3,4,5,6].map((d) => ({
  dayOfWeek: d, isOpen: d !== 0, openTime: "08:00", closeTime: "17:00",
}));

export async function GET() {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await prisma.libraryHours.findMany({ orderBy: { dayOfWeek: "asc" } });
  if (rows.length === 0) return NextResponse.json(DEFAULT_HOURS);
  return NextResponse.json(rows);
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "ADMIN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const hours: { dayOfWeek: number; isOpen: boolean; openTime?: string; closeTime?: string }[] = await req.json();

  await prisma.$transaction(
    hours.map((h) =>
      prisma.libraryHours.upsert({
        where:  { dayOfWeek: h.dayOfWeek },
        create: { dayOfWeek: h.dayOfWeek, isOpen: h.isOpen, openTime: h.openTime ?? null, closeTime: h.closeTime ?? null },
        update: { isOpen: h.isOpen, openTime: h.openTime ?? null, closeTime: h.closeTime ?? null },
      })
    )
  );

  const saved = await prisma.libraryHours.findMany({ orderBy: { dayOfWeek: "asc" } });
  return NextResponse.json(saved);
}
