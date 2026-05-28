import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { auth } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

const copySelect = {
  id: true, copyNumber: true, barcode: true,
  book: { select: { id: true, title: true, isbn: true, location: true, shelfLocation: { select: { name: true } }, condition: true } },
} as const;

const itemInclude = {
  book: { select: { id: true, title: true, isbn: true, location: true, shelfLocation: { select: { name: true } }, condition: true } },
  copy: { select: { id: true, copyNumber: true, barcode: true } },
} as const;

/* ── helper: add one copy (idempotent) ─────────────────────────── */
async function addCopyToBasket(basketId: string, copyId: string, bookId: string, tagged = false) {
  const existing = await prisma.basketItem.findFirst({ where: { basketId, copyId } });
  if (existing) {
    return prisma.basketItem.update({
      where:   { id: existing.id },
      data:    { addedAt: new Date(), tagged },
      include: itemInclude,
    });
  }
  return prisma.basketItem.create({
    data:    { basketId, bookId, copyId, tagged },
    include: itemInclude,
  });
}

/* POST /api/baskets/[id]/items
   Body variants:
     { copyId }               — add one specific copy
     { copyIds: string[] }    — add multiple copies
     { bookIds, mode:"all-available" } — add all available copies for these titles
     { barcode }              — scan a copy barcode / RFID
     { isbn }                 — scan by ISBN (adds all available copies of that title)
*/
export async function POST(request: NextRequest, { params }: Ctx) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: basketId } = await params;
  const basket = await prisma.basket.findUnique({ where: { id: basketId } });
  if (!basket) return NextResponse.json({ error: "Basket not found" }, { status: 404 });

  const body = await request.json() as {
    copyId?:  string;
    copyIds?: string[];
    bookIds?: string[];
    mode?:    string;
    barcode?: string;
    isbn?:    string;
    tagged?:  boolean;
  };

  const taggedVal = body.tagged === true;

  const barcodeInput = body.barcode?.trim();
  const isbnInput    = body.isbn?.trim();

  /* ── Single copy by ID ─────────────────────────────────────── */
  if (body.copyId && !body.copyIds) {
    const copy = await prisma.bookCopy.findUnique({ where: { id: body.copyId }, select: copySelect });
    if (!copy) return NextResponse.json({ error: "Copy not found" }, { status: 404 });
    const item = await addCopyToBasket(basketId, copy.id, copy.book.id, taggedVal);
    return NextResponse.json(item, { status: 201 });
  }

  /* ── Multiple copy IDs ─────────────────────────────────────── */
  if (body.copyIds?.length) {
    const copies = await prisma.bookCopy.findMany({
      where:  { id: { in: body.copyIds } },
      select: { id: true, bookId: true },
    });
    if (copies.length === 0)
      return NextResponse.json({ error: "None of those copy IDs were found" }, { status: 404 });
    await prisma.basketItem.createMany({
      data:           copies.map((c) => ({ basketId, bookId: c.bookId, copyId: c.id, tagged: taggedVal })),
      skipDuplicates: true,
    });
    return NextResponse.json({ added: copies.length }, { status: 201 });
  }

  /* ── All available copies for a list of book titles ─────────── */
  if (body.bookIds?.length && body.mode === "all-available") {
    const copies = await prisma.bookCopy.findMany({
      where:  { bookId: { in: body.bookIds }, status: "AVAILABLE" },
      select: { id: true, bookId: true },
    });
    if (copies.length === 0)
      return NextResponse.json({ error: "No available copies found for those titles" }, { status: 404 });
    await prisma.basketItem.createMany({
      data:            copies.map((c) => ({ basketId, bookId: c.bookId, copyId: c.id, tagged: taggedVal })),
      skipDuplicates:  true,
    });
    return NextResponse.json({ added: copies.length }, { status: 201 });
  }

  /* ── Scan by copy barcode / RFID ──────────────────────────── */
  if (barcodeInput) {
    const copy = await prisma.bookCopy.findFirst({
      where:  { OR: [{ barcode: barcodeInput }, { rfid: barcodeInput }] },
      select: copySelect,
    });
    if (!copy) {
      // Try as book-level barcode (copy #1 inherits the book barcode)
      const book = await prisma.book.findFirst({
        where:  { barcode: barcodeInput },
        select: { id: true, copies: { where: { status: "AVAILABLE" }, select: { id: true, bookId: true }, take: 1 } },
      });
      if (!book || book.copies.length === 0)
        return NextResponse.json({ error: "No copy found for that barcode" }, { status: 404 });
      const item = await addCopyToBasket(basketId, book.copies[0].id, book.id, taggedVal);
      return NextResponse.json(item, { status: 201 });
    }
    const item = await addCopyToBasket(basketId, copy.id, copy.book.id, taggedVal);
    return NextResponse.json(item, { status: 201 });
  }

  /* ── Scan by ISBN — adds all available copies ─────────────── */
  if (isbnInput) {
    const book = await prisma.book.findUnique({
      where:  { isbn: isbnInput },
      select: { id: true, copies: { where: { status: "AVAILABLE" }, select: { id: true, bookId: true } } },
    });
    if (!book) return NextResponse.json({ error: "No book found for that ISBN" }, { status: 404 });
    if (book.copies.length === 0)
      return NextResponse.json({ error: "No available copies for that ISBN" }, { status: 404 });
    await prisma.basketItem.createMany({
      data:           book.copies.map((c) => ({ basketId, bookId: c.bookId, copyId: c.id, tagged: taggedVal })),
      skipDuplicates: true,
    });
    return NextResponse.json({ added: book.copies.length }, { status: 201 });
  }

  return NextResponse.json({ error: "Provide copyId, copyIds, barcode, isbn, or bookIds+mode" }, { status: 400 });
}

/* PATCH /api/baskets/[id]/items
   { copyId, tagged }       — toggle single copy
   { all: "tag"|"untag" }   — bulk tag/untag all
   Tagging = physical label-application step → STAFF can do it.
   Adding / removing copies from baskets (POST/DELETE) still requires LIBRARIAN.
*/
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const session = await auth();
  if (!session || !can(session.user?.role, "STAFF"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: basketId } = await params;
  const body = await request.json() as { copyId?: string; tagged?: boolean; all?: "tag" | "untag" };

  if (body.all === "tag" || body.all === "untag") {
    const result = await prisma.basketItem.updateMany({
      where: { basketId },
      data:  { tagged: body.all === "tag" },
    });
    return NextResponse.json({ updated: result.count });
  }

  if (body.copyId !== undefined && body.tagged !== undefined) {
    const item = await prisma.basketItem.findFirst({ where: { basketId, copyId: body.copyId } });
    if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });
    const updated = await prisma.basketItem.update({ where: { id: item.id }, data: { tagged: body.tagged } });
    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: "Invalid body" }, { status: 400 });
}

/* DELETE /api/baskets/[id]/items
   { copyId }     — remove single copy
   { all: true }  — empty basket
*/
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: basketId } = await params;
  const body = await request.json() as { copyId?: string; all?: boolean };

  if (body.all) {
    const result = await prisma.basketItem.deleteMany({ where: { basketId } });
    return NextResponse.json({ deleted: result.count });
  }

  if (body.copyId) {
    await prisma.basketItem.deleteMany({ where: { basketId, copyId: body.copyId } });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Provide copyId or all:true" }, { status: 400 });
}
