import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { auth } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

/* GET /api/baskets/[id] — basket detail with all items */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const basket = await prisma.basket.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          book: {
            select: {
              id: true, title: true, isbn: true, barcode: true, location: true,
              shelfLocation: { select: { name: true } },
              condition: true, materialType: true, availableCopies: true,
              author: { select: { name: true } },
              category: { select: { name: true } },
            },
          },
          copy: { select: { id: true, copyNumber: true, barcode: true, condition: true } },
        },
        orderBy: { addedAt: "desc" },
      },
    },
  });

  if (!basket) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(basket);
}

/* PATCH /api/baskets/[id] — rename / update notes */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { name, notes } = await request.json() as { name?: string; notes?: string };
  if (!name?.trim())
    return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const updated = await prisma.basket.update({
    where: { id },
    data: { name: name.trim(), notes: notes ?? null },
  });
  return NextResponse.json(updated);
}

/* DELETE /api/baskets/[id] — delete basket and all its items */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await prisma.basket.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
