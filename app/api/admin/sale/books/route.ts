import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";

/**
 * GET /api/admin/sale/books?q=...
 * Returns books that have at least one FOR_SALE copy.
 * Used by the counter-sale modal for staff to search and add items.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "STAFF"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();

  // Find FOR_SALE copies, optionally filtered by a search term on their book
  const copies = await prisma.bookCopy.findMany({
    where: {
      status: "FOR_SALE",
      // Exclude copies already in a cart (saleCartItem exists)
      saleCartItem: null,
      ...(q && {
        book: {
          OR: [
            { title:  { contains: q, mode: "insensitive" } },
            { isbn:   { contains: q, mode: "insensitive" } },
            { barcode:{ contains: q, mode: "insensitive" } },
            { author: { name: { contains: q, mode: "insensitive" } } },
          ],
        },
      }),
    },
    select: {
      id:         true,
      copyNumber: true,
      barcode:    true,
      condition:  true,
      price:      true,   // copy-level sale price (overrides book.price)
      book: {
        select: {
          id:         true,
          title:      true,
          isbn:       true,
          coverImage: true,
          price:      true,   // book-level fallback price
          author:     { select: { name: true } },
        },
      },
    },
    orderBy: [{ book: { title: "asc" } }, { copyNumber: "asc" }],
    take: 50,
  });

  // Group copies by book
  const bookMap = new Map<string, {
    id: string; title: string; isbn: string | null; coverImage: string | null;
    price: number | null; author: { name: string } | null;
    copies: { id: string; copyNumber: number; barcode: string | null; condition: string; price: number | null }[];
  }>();

  for (const copy of copies) {
    const b = copy.book;
    if (!bookMap.has(b.id)) {
      bookMap.set(b.id, { ...b, copies: [] });
    }
    bookMap.get(b.id)!.copies.push({
      id:         copy.id,
      copyNumber: copy.copyNumber,
      barcode:    copy.barcode,
      condition:  copy.condition,
      price:      copy.price,    // null → caller falls back to book.price
    });
  }

  return NextResponse.json(Array.from(bookMap.values()));
}
