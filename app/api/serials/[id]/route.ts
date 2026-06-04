import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const serial = await prisma.serial.findUnique({
    where: { id },
    include: {
      subscriptions: { include: { vendor: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" } },
      issues: { orderBy: [{ issueDate: "desc" }] },
    },
  });
  if (!serial) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(serial);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { title, titleKm, issn, publisher, frequency, language, description, coverImage, isActive, notes } = body;

  const serial = await prisma.serial.update({
    where: { id },
    data: {
      ...(title       !== undefined && { title:       title.trim() }),
      ...(titleKm     !== undefined && { titleKm:     titleKm?.trim()     || null }),
      ...(issn        !== undefined && { issn:        issn?.trim()        || null }),
      ...(publisher   !== undefined && { publisher:   publisher?.trim()   || null }),
      ...(frequency   !== undefined && { frequency }),
      ...(language    !== undefined && { language }),
      ...(description !== undefined && { description: description?.trim() || null }),
      ...(coverImage  !== undefined && { coverImage:  coverImage?.trim()  || null }),
      ...(isActive    !== undefined && { isActive }),
      ...(notes       !== undefined && { notes:       notes?.trim()       || null }),
    },
  });
  return NextResponse.json(serial);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session || !can(session.user?.role, "ADMIN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await prisma.serial.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
