import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

/**
 * GET /api/copies?ids=copyId1,copyId2,...   → return specific copies
 * GET /api/copies?bookId=...                → return all copies of a book
 * Each row includes the parent book's title, isbn, location, author (for label rendering).
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const idsRaw  = searchParams.get("ids");
  const bookId  = searchParams.get("bookId");

  const where = idsRaw
    ? { id: { in: idsRaw.split(",").filter(Boolean) } }
    : bookId
      ? { bookId }
      : {};

  const copies = await prisma.bookCopy.findMany({
    where,
    include: {
      book: { select: {
        id: true, title: true, isbn: true, location: true,
        shelfLocation: { select: { name: true } },
        author: { select: { name: true } },
      } },
    },
    orderBy: [{ bookId: "asc" }, { copyNumber: "asc" }],
  });

  return NextResponse.json(copies);
}
