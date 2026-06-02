import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";

/* ── ISBN validators ────────────────────────────────────────────────────────── */

function cleanIsbn(isbn: string) { return isbn.replace(/[\s\-]/g, ""); }

function isValidIsbn10(s: string): boolean {
  if (!/^\d{9}[\dX]$/.test(s)) return false;
  const digits = s.split("").map((c) => c === "X" ? 10 : parseInt(c, 10));
  return digits.reduce((sum, d, i) => sum + d * (10 - i), 0) % 11 === 0;
}

function isValidIsbn13(s: string): boolean {
  if (!/^(978|979)\d{10}$/.test(s)) return false;
  const digits = s.split("").map(Number);
  const check = digits.slice(0, 12).reduce((sum, d, i) => sum + d * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (check % 10)) % 10 === digits[12];
}

export function isValidIsbn(raw: string): boolean {
  const s = cleanIsbn(raw).toUpperCase();
  return isValidIsbn10(s) || isValidIsbn13(s);
}

/* ── Issue definitions ──────────────────────────────────────────────────────── */

export type IssueKey =
  | "no_isbn" | "invalid_isbn"
  | "no_author" | "no_language" | "no_description"
  | "no_cover" | "no_year" | "no_pages"
  | "no_publisher" | "no_category" | "no_audience";

export interface QualityStats {
  total:          number;
  no_isbn:        number;
  invalid_isbn:   number;
  no_author:      number;
  no_language:    number;
  no_description: number;
  no_cover:       number;
  no_year:        number;
  no_pages:       number;
  no_publisher:   number;
  no_category:    number;
  no_audience:    number;
}

export interface BookQualityRow {
  id:          string;
  title:       string;
  isbn:        string | null;
  author:      string | null;
  language:    string | null;
  publishYear: number | null;
  coverImage:  string | null;
  category:    string | null;
}

/* ── GET /api/books/quality?issue=&page=&limit= ─────────────────────────────── */

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const issue = searchParams.get("issue") as IssueKey | null;
  const page  = Math.max(1, parseInt(searchParams.get("page")  ?? "1",  10) || 1);
  const limit = Math.min(   parseInt(searchParams.get("limit") ?? "50", 10) || 50, 200);

  /* ── Stats mode (no issue param) ── */
  if (!issue) {
    const [
      total,
      no_isbn,
      no_author,
      no_language,
      no_description,
      no_cover,
      no_year,
      no_pages,
      no_publisher,
      no_category,
      // For invalid_isbn we need to load all ISBNs and check in JS
      booksWithIsbn,
      no_audience,
    ] = await Promise.all([
      prisma.book.count(),
      prisma.book.count({ where: { OR: [{ isbn: null }, { isbn: "" }] } }),
      prisma.book.count({ where: { authorId: null } }),
      prisma.book.count({ where: { OR: [{ language: null }, { language: "" }] } }),
      prisma.book.count({ where: { OR: [{ description: null }, { description: "" }] } }),
      prisma.book.count({ where: { coverImage: null } }),
      prisma.book.count({ where: { publishYear: null } }),
      prisma.book.count({ where: { pages: null } }),
      prisma.book.count({ where: { publisherId: null } }),
      prisma.book.count({ where: { categoryId: null } }),
      prisma.book.findMany({ where: { isbn: { not: null } }, select: { isbn: true } }),
      prisma.book.count({ where: { audienceLevel: "UNSPECIFIED" } }),
    ]);

    const invalid_isbn = booksWithIsbn.filter((b) => b.isbn && !isValidIsbn(b.isbn)).length;

    return NextResponse.json({
      total, no_isbn, invalid_isbn,
      no_author, no_language, no_description,
      no_cover, no_year, no_pages,
      no_publisher, no_category, no_audience,
    } satisfies QualityStats);
  }

  /* ── List mode (specific issue) ── */
  const select = {
    id: true, title: true, isbn: true,
    language: true, publishYear: true, coverImage: true,
    author:   { select: { name: true } },
    category: { select: { name: true } },
  };
  const orderBy = { title: "asc" as const };

  if (issue === "invalid_isbn") {
    // Can't do this in Prisma where clause — load all and filter
    const all = await prisma.book.findMany({
      where:   { isbn: { not: null } },
      select,
      orderBy,
    });
    const invalid = all.filter((b) => b.isbn && !isValidIsbn(b.isbn));
    const sliced  = invalid.slice((page - 1) * limit, page * limit);
    return NextResponse.json({
      total: invalid.length,
      pages: Math.ceil(invalid.length / limit) || 1,
      books: sliced.map(toRow),
    });
  }

  const where: Record<string, unknown> = {
    no_isbn:        { OR: [{ isbn: null }, { isbn: "" }] },
    no_author:      { authorId: null },
    no_language:    { OR: [{ language: null }, { language: "" }] },
    no_description: { OR: [{ description: null }, { description: "" }] },
    no_cover:       { coverImage: null },
    no_year:        { publishYear: null },
    no_pages:       { pages: null },
    no_publisher:   { publisherId: null },
    no_category:    { categoryId: null },
    no_audience:    { audienceLevel: "UNSPECIFIED" },
  }[issue] ?? {};

  const [books, total] = await Promise.all([
    prisma.book.findMany({ where, select, orderBy, take: limit, skip: (page - 1) * limit }),
    prisma.book.count({ where }),
  ]);

  return NextResponse.json({
    total,
    pages: Math.ceil(total / limit) || 1,
    books: books.map(toRow),
  });
}

function toRow(b: {
  id: string; title: string; isbn: string | null;
  language: string | null; publishYear: number | null; coverImage: string | null;
  author?: { name: string } | null;
  category?: { name: string } | null;
}): BookQualityRow {
  return {
    id:          b.id,
    title:       b.title,
    isbn:        b.isbn,
    author:      b.author?.name ?? null,
    language:    b.language,
    publishYear: b.publishYear,
    coverImage:  b.coverImage,
    category:    b.category?.name ?? null,
  };
}
