import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { auth } from "@/lib/auth";
import { randomBytes } from "crypto";
function makeId() { return randomBytes(12).toString("hex"); }
// BasketType enum not imported — use string literals (stale engine workaround)
type BasketType = "ITEM" | "EBOOK" | "AUTHOR" | "MEMBER";

type Ctx = { params: Promise<{ id: string }> };

/* ── POST /api/baskets/[id]/items — add items ──────────────────────────────
   Body variants per basket type:

   ITEM    : { copyId } | { copyIds } | { barcode } | { isbn } | { bookIds, mode:"all-available" }
   EBOOK   : { ebookId } | { ebookIds }
   AUTHOR  : { authorId } | { authorIds }
   MEMBER  : { memberId } | { memberIds }
*/
export async function POST(request: NextRequest, { params }: Ctx) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: basketId } = await params;
  const basket = await prisma.basket.findUnique({ where: { id: basketId }, select: { id: true } });
  if (!basket) return NextResponse.json({ error: "Basket not found" }, { status: 404 });

  // Read basketType via raw SQL — stale engine doesn't know the new column
  const typeRows = await prisma.$queryRawUnsafe<{ basketType: string }[]>(
    `SELECT "basketType" FROM "Basket" WHERE id = $1`, basketId,
  );
  const basketType: BasketType = (typeRows[0]?.basketType as BasketType) ?? "ITEM";

  const body = await request.json() as Record<string, unknown>;
  const tagged = body.tagged === true;

  // ── Non-ITEM baskets — raw SQL bypasses stale engine's required bookId ──────
  if (basketType === "EBOOK" || basketType === "AUTHOR" || basketType === "MEMBER") {
    const colName   = basketType === "EBOOK" ? "ebookId" : basketType === "AUTHOR" ? "authorId" : "memberId";
    const singKey   = colName;                  // e.g. "ebookId"
    const pluralKey = colName + "s";            // e.g. "ebookIds"

    const ids: string[] = body[singKey]
      ? [String(body[singKey])]
      : Array.isArray(body[pluralKey]) ? (body[pluralKey] as unknown[]).map(String) : [];

    if (ids.length === 0)
      return NextResponse.json({ error: `Provide ${singKey} or ${pluralKey}` }, { status: 400 });

    let added = 0;
    for (const entityId of ids) {
      try {
        // gen_random_uuid() requires pgcrypto; use cuid-style via concat if unavailable
        await prisma.$executeRawUnsafe(
          `INSERT INTO "BasketItem" (id, "basketId", "${colName}", tagged, "addedAt")
           VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT ("basketId", "${colName}") DO NOTHING`,
          makeId(), basketId, entityId, tagged,
        );
        added++;
      } catch { /* skip on any constraint violation */ }
    }
    return NextResponse.json({ added }, { status: 201 });
  }

  // ── ITEM basket (physical copies) ─────────────────────────────────────────
  const barcodeInput = typeof body.barcode === "string" ? body.barcode.trim() : undefined;
  const isbnInput    = typeof body.isbn    === "string" ? body.isbn.trim()    : undefined;

  async function addCopy(copyId: string, bookId: string) {
    const existing = await prisma.basketItem.findFirst({ where: { basketId, copyId } });
    if (existing) {
      return prisma.basketItem.update({
        where: { id: existing.id },
        data:  { addedAt: new Date(), tagged },
      });
    }
    return prisma.basketItem.create({ data: { basketId, bookId, copyId, tagged } });
  }

  if (body.copyId && !body.copyIds) {
    const copy = await prisma.bookCopy.findUnique({
      where:  { id: String(body.copyId) },
      select: { id: true, bookId: true },
    });
    if (!copy) return NextResponse.json({ error: "Copy not found" }, { status: 404 });
    await addCopy(copy.id, copy.bookId);
    return NextResponse.json({ added: 1 }, { status: 201 });
  }

  if (Array.isArray(body.copyIds) && body.copyIds.length) {
    const copies = await prisma.bookCopy.findMany({
      where:  { id: { in: body.copyIds.map(String) } },
      select: { id: true, bookId: true },
    });
    await prisma.basketItem.createMany({
      data:           copies.map((c) => ({ basketId, bookId: c.bookId, copyId: c.id, tagged })),
      skipDuplicates: true,
    });
    return NextResponse.json({ added: copies.length }, { status: 201 });
  }

  if (Array.isArray(body.bookIds) && body.mode === "all-available") {
    const copies = await prisma.bookCopy.findMany({
      where:  { bookId: { in: body.bookIds.map(String) }, status: "AVAILABLE" },
      select: { id: true, bookId: true },
    });
    if (copies.length === 0)
      return NextResponse.json({ error: "No available copies" }, { status: 404 });
    await prisma.basketItem.createMany({
      data:           copies.map((c) => ({ basketId, bookId: c.bookId, copyId: c.id, tagged })),
      skipDuplicates: true,
    });
    return NextResponse.json({ added: copies.length }, { status: 201 });
  }

  if (barcodeInput) {
    const copy = await prisma.bookCopy.findFirst({
      where:  { OR: [{ barcode: barcodeInput }, { rfid: barcodeInput }] },
      select: { id: true, bookId: true },
    });
    if (!copy) {
      const book = await prisma.book.findFirst({
        where:  { barcode: barcodeInput },
        select: { id: true, copies: { where: { status: "AVAILABLE" }, select: { id: true, bookId: true }, take: 1 } },
      });
      if (!book?.copies.length)
        return NextResponse.json({ error: "No copy found for that barcode" }, { status: 404 });
      await addCopy(book.copies[0].id, book.id);
    } else {
      await addCopy(copy.id, copy.bookId);
    }
    return NextResponse.json({ added: 1 }, { status: 201 });
  }

  if (isbnInput) {
    const book = await prisma.book.findUnique({
      where:  { isbn: isbnInput },
      select: { id: true, copies: { where: { status: "AVAILABLE" }, select: { id: true, bookId: true } } },
    });
    if (!book) return NextResponse.json({ error: "No book found for that ISBN" }, { status: 404 });
    if (!book.copies.length) return NextResponse.json({ error: "No available copies" }, { status: 404 });
    await prisma.basketItem.createMany({
      data:           book.copies.map((c) => ({ basketId, bookId: c.bookId, copyId: c.id, tagged })),
      skipDuplicates: true,
    });
    return NextResponse.json({ added: book.copies.length }, { status: 201 });
  }

  return NextResponse.json({ error: "Invalid body for this basket type" }, { status: 400 });
}

/* ── PATCH — tag/untag (ITEM baskets only) ───────────────────────────────── */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const session = await auth();
  if (!session || !can(session.user?.role, "STAFF"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: basketId } = await params;
  const body = await request.json() as { copyId?: string; itemId?: string; tagged?: boolean; all?: "tag" | "untag" };

  if (body.all === "tag" || body.all === "untag") {
    const result = await prisma.basketItem.updateMany({
      where: { basketId },
      data:  { tagged: body.all === "tag" },
    });
    return NextResponse.json({ updated: result.count });
  }

  // ITEM baskets: find by copyId
  if (body.copyId !== undefined && body.tagged !== undefined) {
    const item = await prisma.basketItem.findFirst({ where: { basketId, copyId: body.copyId } });
    if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });
    await prisma.basketItem.update({ where: { id: item.id }, data: { tagged: body.tagged } });
    return NextResponse.json({ success: true });
  }

  // Non-ITEM baskets: find by BasketItem.id directly
  if (body.itemId !== undefined && body.tagged !== undefined) {
    const item = await prisma.basketItem.findFirst({ where: { id: body.itemId, basketId } });
    if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });
    await prisma.basketItem.update({ where: { id: item.id }, data: { tagged: body.tagged } });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid body" }, { status: 400 });
}

/* ── DELETE — remove items ───────────────────────────────────────────────── */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: basketId } = await params;
  const body = await request.json() as {
    all?:      boolean;
    copyId?:   string;
    ebookId?:  string;
    authorId?: string;
    memberId?: string;
  };

  if (body.all) {
    const result = await prisma.basketItem.deleteMany({ where: { basketId } });
    return NextResponse.json({ deleted: result.count });
  }
  if (body.copyId)   { await prisma.basketItem.deleteMany({ where: { basketId, copyId:   body.copyId   } }); return NextResponse.json({ success: true }); }
  if (body.ebookId)  { await prisma.basketItem.deleteMany({ where: { basketId, ebookId:  body.ebookId  } }); return NextResponse.json({ success: true }); }
  if (body.authorId) { await prisma.basketItem.deleteMany({ where: { basketId, authorId: body.authorId } }); return NextResponse.json({ success: true }); }
  if (body.memberId) { await prisma.basketItem.deleteMany({ where: { basketId, memberId: body.memberId } }); return NextResponse.json({ success: true }); }

  return NextResponse.json({ error: "Provide an entity ID or all:true" }, { status: 400 });
}
