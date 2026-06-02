import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/shop/books
 * Public — returns FOR_SALE copies when the sale feature is enabled.
 * Supports ?page=&limit=&q= for server-side pagination and search.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const saleSetting = await prisma.settings.findUnique({ where: { key: "BOOK_SALE_ENABLED" } });
  const saleEnabled = saleSetting?.value === "true";

  const q        = (searchParams.get("q") || "").trim();
  const paginate = searchParams.has("page");
  const pageParam = parseInt(searchParams.get("page") || "1", 10) || 1;
  const limitParam = parseInt(searchParams.get("limit") || "20", 10);
  const limit    = Math.min(limitParam, 100);

  if (!saleEnabled) return NextResponse.json({ saleEnabled: false, forSale: [], total: 0, page: 1, pages: 1 });

  // Paginate at the BOOK level (not copy level) so limit means "N books per page"
  const bookWhere = {
    copies: { some: { status: "FOR_SALE" as const } },
    ...(q && {
      OR: [
        { title:  { contains: q, mode: "insensitive" as const } },
        { isbn:   { contains: q, mode: "insensitive" as const } },
        { author: { name: { contains: q, mode: "insensitive" as const } } },
      ],
    }),
  };

  const [bookPage, total] = await Promise.all([
    prisma.book.findMany({
      where: bookWhere,
      select: {
        id: true, title: true, isbn: true, coverImage: true, price: true,
        author:   { select: { name: true } },
        category: { select: { name: true } },
        copies: {
          where:   { status: "FOR_SALE" },
          select:  { id: true, copyNumber: true, barcode: true, condition: true, price: true },
          orderBy: { copyNumber: "asc" },
        },
      },
      orderBy: { title: "asc" },
      ...(paginate ? { take: limit, skip: (pageParam - 1) * limit } : {}),
    }),
    paginate ? prisma.book.count({ where: bookWhere }) : Promise.resolve(0),
  ]);

  const forSale = bookPage.flatMap((book) =>
    book.copies.map((c) => ({
      copyId:     c.id,
      copyNumber: c.copyNumber,
      barcode:    c.barcode,
      condition:  c.condition,
      price:      c.price ?? book.price,
      id:         book.id,
      title:      book.title,
      isbn:       book.isbn,
      coverImage: book.coverImage,
      author:     book.author,
      category:   book.category,
    }))
  );

  return NextResponse.json({
    saleEnabled,
    forSale,
    total,
    page:  pageParam,
    pages: paginate ? Math.ceil(total / limit) || 1 : 1,
  });
}
