import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/shop/books
 * Public — returns all copies with status = FOR_SALE with book info.
 */
export async function GET() {
  const saleSetting = await prisma.settings.findUnique({ where: { key: "BOOK_SALE_ENABLED" } });
  if (saleSetting?.value !== "true") return NextResponse.json([]);

  const copies = await prisma.bookCopy.findMany({
    where: { status: "FOR_SALE" },
    include: {
      book: {
        select: {
          id: true, title: true, isbn: true, coverImage: true,
          author:   { select: { name: true } },
          category: { select: { name: true } },
        },
      },
    },
    orderBy: [{ book: { title: "asc" } }, { copyNumber: "asc" }],
  });

  return NextResponse.json(
    copies.map((c) => ({
      copyId:      c.id,
      copyNumber:  c.copyNumber,
      barcode:     c.barcode,
      condition:   c.condition,
      price:       c.price,
      id:          c.book.id,
      title:       c.book.title,
      isbn:        c.book.isbn,
      coverImage:  c.book.coverImage,
      author:      c.book.author,
      category:    c.book.category,
    })),
  );
}
