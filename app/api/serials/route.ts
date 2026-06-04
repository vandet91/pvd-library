import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";

export async function GET() {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const serials = await prisma.serial.findMany({
    orderBy: { title: "asc" },
    include: {
      _count: { select: { issues: true, subscriptions: true } },
      subscriptions: {
        where: { status: "ACTIVE" },
        select: { id: true, endDate: true, cost: true, currency: true },
        take: 1,
        orderBy: { createdAt: "desc" },
      },
    },
  });
  return NextResponse.json(serials);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { title, titleKm, issn, publisher, frequency, language, description, coverImage, notes } = body;

  if (!title?.trim())
    return NextResponse.json({ error: "Title is required" }, { status: 400 });

  const serial = await prisma.serial.create({
    data: {
      title:       title.trim(),
      titleKm:     titleKm?.trim()     || null,
      issn:        issn?.trim()        || null,
      publisher:   publisher?.trim()   || null,
      frequency:   frequency           || "MONTHLY",
      language:    language            || "en",
      description: description?.trim() || null,
      coverImage:  coverImage?.trim()  || null,
      notes:       notes?.trim()       || null,
    },
  });
  return NextResponse.json(serial, { status: 201 });
}
