import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { auth } from "@/lib/auth";
import { BookCondition, InventoryStatus } from "@prisma/client";

type Ctx = { params: Promise<{ id: string }> };

/* GET /api/inventory/[id] — full session with scanned items + total book count */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const inv = await prisma.inventory.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          book: { select: { id: true, title: true, isbn: true, location: true, shelfLocation: { select: { name: true } } } },
        },
        orderBy: { scannedAt: "desc" },
      },
    },
  });

  if (!inv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const totalBooks = await prisma.book.count({
    where: {
      condition: { notIn: [BookCondition.WITHDRAWN, BookCondition.ARCHIVED] },
    },
  });

  return NextResponse.json({ ...inv, totalBooks });
}

/* PATCH /api/inventory/[id] — mark COMPLETED or CANCELLED */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id }     = await params;
  const { status } = await request.json() as { status: InventoryStatus };

  if (!["COMPLETED", "CANCELLED"].includes(status))
    return NextResponse.json(
      { error: "status must be COMPLETED or CANCELLED" },
      { status: 400 },
    );

  const updated = await prisma.inventory.update({
    where: { id },
    data:  { status, completedAt: new Date() },
  });

  return NextResponse.json(updated);
}

/* DELETE /api/inventory/[id] — remove session and all its scanned items */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await prisma.inventory.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
