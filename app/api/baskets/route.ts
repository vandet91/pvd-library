import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { auth } from "@/lib/auth";

const VALID_TYPES = ["ITEM", "EBOOK", "AUTHOR", "MEMBER"] as const;
type BasketType = typeof VALID_TYPES[number];

/* GET /api/baskets — list all baskets with item counts */
export async function GET() {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [baskets, typeRows] = await Promise.all([
      prisma.basket.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          _count: { select: { items: true } },
          items:  { select: { tagged: true } },
        },
      }),
      // Read basketType via raw SQL — stale engine doesn't know the new column
      prisma.$queryRawUnsafe<{ id: string; basketType: string }[]>(
        `SELECT id, "basketType" FROM "Basket"`,
      ),
    ]);

    const typeMap = new Map(typeRows.map((r) => [r.id, r.basketType]));

    const result = baskets.map((b) => ({
      id:         b.id,
      name:       b.name,
      basketType: typeMap.get(b.id) ?? "ITEM",
      notes:      b.notes,
      createdAt:  b.createdAt,
      updatedAt:  b.updatedAt,
      total:      b._count.items,
      tagged:     b.items.filter((i) => i.tagged).length,
      untagged:   b.items.filter((i) => !i.tagged).length,
    }));

    return NextResponse.json(result);
  } catch (e) {
    console.error("[GET /api/baskets]", e);
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 500 });
  }
}

/* POST /api/baskets — create a basket */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { name, notes, basketType } = await request.json() as {
      name?:       string;
      notes?:      string;
      basketType?: string;
    };

    if (!name?.trim())
      return NextResponse.json({ error: "Name is required" }, { status: 400 });

    const validType: BasketType = VALID_TYPES.includes(basketType as BasketType)
      ? (basketType as BasketType)
      : "ITEM";

    // Create without basketType so the stale engine binary doesn't reject it,
    // then patch the column with raw SQL if a non-default type was requested.
    const basket = await prisma.basket.create({
      data:    { name: name.trim(), notes: notes ?? null },
      include: { _count: { select: { items: true } } },
    });

    if (validType !== "ITEM") {
      // validType is safe to interpolate — it's already validated against VALID_TYPES
      await prisma.$executeRawUnsafe(
        `UPDATE "Basket" SET "basketType" = '${validType}'::"BasketType" WHERE id = $1`,
        basket.id,
      );
    }

    return NextResponse.json(
      { ...(basket as object), basketType: validType, total: 0, tagged: 0, untagged: 0 },
      { status: 201 },
    );
  } catch (e) {
    console.error("[POST /api/baskets]", e);
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 500 });
  }
}
