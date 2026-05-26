import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { auth } from "@/lib/auth";

/* GET /api/baskets — list all baskets with item counts */
export async function GET() {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const baskets = await prisma.basket.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { items: true } },
      items: { select: { tagged: true } },
    },
  });

  /* Compute tagged / untagged counts per basket */
  const result = baskets.map((b) => ({
    id:        b.id,
    name:      b.name,
    notes:     b.notes,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
    total:     b._count.items,
    tagged:    b.items.filter((i) => i.tagged).length,
    untagged:  b.items.filter((i) => !i.tagged).length,
  }));

  return NextResponse.json(result);
}

/* POST /api/baskets — create a basket */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, notes } = await request.json() as { name?: string; notes?: string };
  if (!name?.trim())
    return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const basket = await prisma.basket.create({
    data: { name: name.trim(), notes: notes ?? null },
    include: { _count: { select: { items: true } } },
  });

  return NextResponse.json({ ...basket, total: 0, tagged: 0, untagged: 0 }, { status: 201 });
}
