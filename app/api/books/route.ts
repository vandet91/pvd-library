import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { BookCondition } from "@prisma/client";
import { z } from "zod";
import { generateBarcode } from "@/lib/barcode";
import { can } from "@/lib/rbac";
import { logActivity, actorFromSession, Actions } from "@/lib/activity-log";

const MATERIAL_TYPES = ["BOOK", "MAGAZINE", "JOURNAL", "NEWSPAPER", "DVD", "AUDIO_CD", "THESIS", "MAP", "OTHER"] as const;

const bookSchema = z.object({
  title: z.string().min(1),
  titleKm: z.string().optional(),
  subtitle: z.string().optional(),
  edition: z.string().optional(),
  isbn: z.string().optional(),
  description: z.string().optional(),
  coverImage: z.string().optional(),
  publishYear: z.number().optional(),
  pages: z.number().optional(),
  language: z.string().optional(),
  location: z.string().optional(),
  locationId: z.string().optional().nullable(),
  branchId: z.string().optional().nullable(),
  totalCopies: z.number().min(1).default(1),
  price: z.number().min(0).optional().nullable(),
  referenceOnly: z.boolean().optional(),
  materialType: z.enum(MATERIAL_TYPES).default("BOOK"),
  categoryId: z.string().optional(),
  authorId: z.string().optional(),
  coAuthorIds: z.array(z.string()).optional(),
  publisherId: z.string().optional(),
});

/** Resolve a free-text location to a Location.id (case-insensitive exact match). */
async function resolveLocationId(loc: string | undefined): Promise<string | undefined> {
  if (!loc?.trim()) return undefined;
  const found = await prisma.location.findFirst({
    where:  { name: { equals: loc.trim(), mode: "insensitive" } },
    select: { id: true },
  });
  return found?.id;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  // Trim so barcode scanners' trailing CR/LF/space don't break exact-match lookups
  const query      = (searchParams.get("q") || "").trim();
  const categoryId = searchParams.get("categoryId") || undefined;
  const available     = searchParams.get("available") === "true";
  const condition     = searchParams.get("condition") || undefined;
  const materialType  = searchParams.get("materialType") || undefined;
  const branchIdFilter = searchParams.get("branchId") || undefined;
  const sort          = searchParams.get("sort") || "newest";
  const limit         = parseInt(searchParams.get("limit") || "500", 10);
  const includeCopies = searchParams.get("copies") === "true";

  // For popular sort, fall back to join ordering via sub-query isn't straightforward
  // We return all and let the client sort, or just use createdAt/title
  const orderBy = sort === "title"
    ? { title: "asc" as const }
    : { createdAt: "desc" as const };

  // First, see if the query matches a SPECIFIC copy barcode (or RFID).
  // If so, surface that copy's book first and flag which copy matched.
  let scannedCopy: { id: string; bookId: string; copyNumber: number; barcode: string | null; branchId: string | null } | null = null;
  if (query) {
    scannedCopy = await prisma.bookCopy.findFirst({
      where:  { OR: [{ barcode: query }, { rfid: query }] },
      select: { id: true, bookId: true, copyNumber: true, barcode: true, branchId: true },
    });
  }

  const books = await prisma.book.findMany({
    where: {
      ...(query && {
        OR: [
          { title:   { contains: query, mode: "insensitive" } },
          { isbn:    { contains: query, mode: "insensitive" } },
          { barcode: { contains: query, mode: "insensitive" } },
          { author:  { name: { contains: query, mode: "insensitive" } } },
          // Also match books that have a copy with this exact barcode
          ...(scannedCopy ? [{ id: scannedCopy.bookId }] : []),
        ],
      }),
      ...(categoryId && { categoryId }),
      ...(available     && { availableCopies: { gt: 0 } }),
      ...(condition     && condition in BookCondition && { condition: condition as BookCondition }),
      ...(materialType  && { materialType: materialType as typeof MATERIAL_TYPES[number] }),
      ...(branchIdFilter && { branchId: branchIdFilter }),
    },
    include: {
      category: true, author: true, coAuthors: true, publisher: true, shelfLocation: true,
      _count: { select: { loans: true, ebooks: true } },
      ...(includeCopies && {
        copies: {
          where:   { status: "AVAILABLE", loanable: true },
          select:  { id: true, copyNumber: true, barcode: true },
          orderBy: { copyNumber: "asc" as const },
        },
      }),
    },
    orderBy,
    take: limit,
  });

  // ── Attach avg rating for each book (one groupBy query) ──────────────
  const bookIds = books.map((b) => b.id);
  const ratingAggs = await prisma.rating.groupBy({
    by:    ["bookId"],
    where: { bookId: { in: bookIds } },
    _avg:   { score: true },
    _count: { score: true },
  });
  const ratingMap = new Map(ratingAggs.map((r) => [
    r.bookId,
    { avgRating: r._avg.score ? Math.round(r._avg.score * 10) / 10 : null, ratingCount: r._count.score },
  ]));

  // Stamp `_scannedCopy` on the book that matched the scanned copy barcode (if any).
  // The borrow flow can then pass copyId to /api/loans to grab THIS specific copy.
  let payload: unknown[] = books.map((b) => ({
    ...b,
    ...(ratingMap.get(b.id) ?? { avgRating: null, ratingCount: 0 }),
  }));
  if (scannedCopy) {
    payload = (payload as { id: string; _scannedCopy?: unknown }[]).map((b) =>
      b.id === scannedCopy!.bookId ? { ...b, _scannedCopy: scannedCopy } : b
    );
    // Put the scanned-copy book first
    payload.sort((a, b) =>
      ((a as { _scannedCopy?: unknown })._scannedCopy ? -1 : 0) -
      ((b as { _scannedCopy?: unknown })._scannedCopy ? -1 : 0)
    );
  }

  // If sort=popular, re-sort by loan count client-side (server-side)
  if (sort === "popular") {
    (payload as { _count?: { loans: number } }[]).sort(
      (a, b) => (b._count?.loans ?? 0) - (a._count?.loans ?? 0)
    );
  }

  return NextResponse.json(payload);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = bookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  /* Auto-generate system barcode if not provided */
  const barcode = await generateBarcode();

  // coAuthorIds is a relation, not a column — pull it out and handle via connect
  const { coAuthorIds, locationId: locationIdFromForm, branchId: branchIdFromForm, ...bookData } = parsed.data;

  // Prefer explicit locationId from form; fall back to resolving free-text location string
  const locationId = locationIdFromForm !== undefined
    ? (locationIdFromForm ?? undefined)
    : await resolveLocationId(bookData.location);
  const branchId = branchIdFromForm ?? undefined;

  const book = await prisma.$transaction(async (tx) => {
    const created = await tx.book.create({
      data: {
        ...bookData,
        barcode,
        availableCopies: bookData.totalCopies,
        ...(locationId && { locationId }),
        ...(branchId   && { branchId }),
        ...(coAuthorIds && coAuthorIds.length > 0 && {
          coAuthors: { connect: coAuthorIds.map((id) => ({ id })) },
        }),
      },
      include: { category: true, author: true, coAuthors: true, publisher: true },
    });
    // Auto-generate N physical copies matching totalCopies — first copy keeps the system barcode
    for (let i = 1; i <= bookData.totalCopies; i++) {
      const pad = String(i).padStart(3, "0");
      await tx.bookCopy.create({
        data: {
          bookId:     created.id,
          copyNumber: i,
          barcode:    i === 1 ? barcode : `${barcode}-C${pad}`,
          condition:  "GOOD",
          status:     "AVAILABLE",
          price:      bookData.price ?? null,
          // Copies inherit the book's home branch so the physical location
          // starts in sync. It will float on the first return if needed.
          ...(branchId && { branchId }),
        },
      });
    }
    return created;
  });

  await logActivity(actorFromSession(session), Actions.BOOK_CREATED, {
    entityType: "Book",
    entityId:   book.id,
    entityName: book.title,
    detail:     { isbn: book.isbn, totalCopies: book.totalCopies, materialType: book.materialType },
  });

  return NextResponse.json(book, { status: 201 });
}
