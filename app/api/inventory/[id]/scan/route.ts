import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { auth } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

/* POST /api/inventory/[id]/scan
   Body: { bookId } OR { isbn }
   Marks a book as scanned in the active inventory session (idempotent).
*/
export async function POST(request: NextRequest, { params }: Ctx) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: inventoryId } = await params;

  const inv = await prisma.inventory.findUnique({ where: { id: inventoryId } });
  if (!inv)
    return NextResponse.json({ error: "Inventory session not found" }, { status: 404 });
  if (inv.status !== "ACTIVE")
    return NextResponse.json({ error: "Inventory session is not active" }, { status: 400 });

  const body = await request.json() as { bookId?: string; isbn?: string; barcode?: string };
  const { bookId, isbn } = body;
  // Trim — barcode scanners often append CR/LF/space
  const barcode = body.barcode?.trim();

  const bookSelect = { id: true, title: true, isbn: true, barcode: true, location: true, shelfLocation: { select: { name: true } } } as const;

  let book = bookId
    ? await prisma.book.findUnique({ where: { id: bookId }, select: bookSelect })
    : isbn
    ? await prisma.book.findUnique({ where: { isbn },       select: bookSelect })
    : barcode
    ? await prisma.book.findUnique({ where: { barcode },    select: bookSelect })
    : null;

  // If we tried a barcode but didn't find a book, try a COPY barcode/RFID too —
  // scanning a per-copy label should also mark the parent title as inventoried.
  if (!book && barcode) {
    const copy = await prisma.bookCopy.findFirst({
      where:  { OR: [{ barcode }, { rfid: barcode }] },
      select: { book: { select: bookSelect } },
    });
    if (copy) book = copy.book;
  }

  if (!book)
    return NextResponse.json({ error: "Book not found" }, { status: 404 });

  /* Upsert — scanning the same book twice just refreshes scannedAt */
  const item = await prisma.inventoryItem.upsert({
    where:   { inventoryId_bookId: { inventoryId, bookId: book.id } },
    create:  { inventoryId, bookId: book.id },
    update:  { scannedAt: new Date() },
    include: { book: { select: bookSelect } },
  });

  /* Keep book.lastInventoryAt in sync */
  await prisma.book.update({
    where: { id: book.id },
    data:  { lastInventoryAt: new Date() },
  });

  return NextResponse.json(item, { status: 201 });
}

/* DELETE /api/inventory/[id]/scan
   Body: { bookId }  — undo an accidental scan
*/
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: inventoryId } = await params;
  const { bookId } = await request.json() as { bookId: string };

  await prisma.inventoryItem.deleteMany({ where: { inventoryId, bookId } });
  return NextResponse.json({ success: true });
}
