// v2 — multi-type basket support
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

  // Fetch basket metadata (no items include — stale engine rejects null bookId rows)
  let basket;
  try {
    basket = await prisma.basket.findUnique({
      where:  { id },
      select: { id: true, name: true, notes: true, createdAt: true, updatedAt: true },
    });
  } catch (e) {
    console.error("[basket GET]", e);
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 500 });
  }
  if (!basket) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Read basketType and items via raw SQL — stale engine can't handle nullable bookId
  const typeRows = await prisma.$queryRawUnsafe<{ basketType: string }[]>(
    `SELECT "basketType" FROM "Basket" WHERE id = $1`, id,
  );
  const basketType = typeRows[0]?.basketType ?? "ITEM";

  const rawItems = await prisma.$queryRawUnsafe<{
    id: string; tagged: boolean; addedAt: Date;
    bookId: string | null; copyId: string | null;
    ebookId: string | null; authorId: string | null; memberId: string | null;
  }[]>(
    `SELECT id, tagged, "addedAt", "bookId", "copyId", "ebookId", "authorId", "memberId"
     FROM "BasketItem" WHERE "basketId" = $1 ORDER BY "addedAt" DESC`, id,
  );

  // Enrich items based on basket type
  let items: unknown[] = rawItems;

  if (basketType === "ITEM" && rawItems.length > 0) {
    const copyIds = rawItems.map(r => r.copyId).filter(Boolean) as string[];
    const copies = copyIds.length ? await prisma.bookCopy.findMany({
      where:  { id: { in: copyIds } },
      select: { id: true, copyNumber: true, barcode: true, condition: true,
                book: { select: { id: true, title: true, isbn: true, barcode: true, location: true,
                  shelfLocation: { select: { name: true } }, condition: true,
                  materialType: true, availableCopies: true,
                  author: { select: { name: true } }, category: { select: { name: true } } } } },
    }) : [];
    const copyMap = new Map(copies.map(c => [c.id, c]));
    items = rawItems.map(r => ({
      ...r,
      copy: r.copyId ? (copyMap.get(r.copyId) ?? null) : null,
      book: r.copyId ? (copyMap.get(r.copyId)?.book ?? null) : null,
    }));
  } else if (basketType === "EBOOK" && rawItems.length > 0) {
    const ids = rawItems.map(r => r.ebookId).filter(Boolean) as string[];
    const ebooks = ids.length ? await prisma.ebook.findMany({
      where:  { id: { in: ids } },
      select: { id: true, title: true, ebookType: true, language: true, coverImage: true, author: { select: { name: true } } },
    }) : [];
    const map = new Map(ebooks.map(e => [e.id, e]));
    items = rawItems.map(r => ({ ...r, ebook: r.ebookId ? map.get(r.ebookId) ?? null : null }));
  } else if (basketType === "AUTHOR" && rawItems.length > 0) {
    const ids = rawItems.map(r => r.authorId).filter(Boolean) as string[];
    const authors = ids.length ? await prisma.author.findMany({
      where:  { id: { in: ids } },
      select: { id: true, name: true, _count: { select: { books: true } } },
    }) : [];
    const map = new Map(authors.map(a => [a.id, a]));
    items = rawItems.map(r => ({ ...r, author: r.authorId ? map.get(r.authorId) ?? null : null }));
  } else if (basketType === "MEMBER" && rawItems.length > 0) {
    const ids = rawItems.map(r => r.memberId).filter(Boolean) as string[];
    const members = ids.length ? await prisma.member.findMany({
      where:  { id: { in: ids } },
      select: { id: true, memberId: true, name: true, memberType: true, isActive: true, gender: true, school: true, className: true },
    }) : [];
    const map = new Map(members.map(m => [m.id, m]));
    items = rawItems.map(r => ({ ...r, member: r.memberId ? map.get(r.memberId) ?? null : null }));
  }

  return NextResponse.json({ ...basket, basketType, items });
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
    data:  { name: name.trim(), notes: notes ?? null },
  });
  return NextResponse.json(updated);
}

/* DELETE /api/baskets/[id] */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await prisma.basket.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
