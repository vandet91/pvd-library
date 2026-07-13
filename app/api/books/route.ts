import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { BookCondition } from "@prisma/client";
import { z } from "zod";
import { generateBarcode } from "@/lib/barcode";
import { can } from "@/lib/rbac";
import { logActivity, actorFromSession, Actions } from "@/lib/activity-log";

const MATERIAL_TYPES  = ["BOOK", "MAGAZINE", "JOURNAL", "NEWSPAPER", "DVD", "AUDIO_CD", "THESIS", "MAP", "OTHER"] as const;
const AUDIENCE_LEVELS = ["CHILDREN", "YOUTH", "ADULTS", "UNSPECIFIED"] as const;

const bookSchema = z.object({
  title: z.string().min(1),
  titleKm: z.string().optional(),
  subtitle: z.string().optional(),
  edition: z.string().optional(),
  isbn: z.string().transform((v) => v.trim() || null).optional().nullable(),
  description: z.string().optional(),
  coverImage: z.string().optional(),
  publishYear: z.number().optional(),
  pages: z.number().optional(),
  language: z.string().optional(),
  callNumber: z.string().optional(),
  location: z.string().optional(),
  locationId: z.string().optional().nullable(),
  branchId: z.string().optional().nullable(),
  totalCopies: z.number().min(1).default(1),
  price: z.number().min(0).optional().nullable(),
  referenceOnly: z.boolean().optional(),
  materialType:  z.enum(MATERIAL_TYPES).default("BOOK"),
  audienceLevel: z.enum(AUDIENCE_LEVELS).default("UNSPECIFIED"),
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
  const audienceLevel = searchParams.get("audienceLevel") || undefined;
  const branchIdFilter = searchParams.get("branchId") || undefined;
  const sort          = searchParams.get("sort") || "newest";
  const language      = searchParams.get("language") || undefined;
  const availableOnly = searchParams.get("available") === "true";
  // Pagination — admin page sends page= explicitly; other callers (Discover etc.) do not.
  const paginate   = searchParams.has("page");
  const pageParam  = parseInt(searchParams.get("page") || "1", 10) || 1;
  // When paginating: default 50/page, max 100.
  // When NOT paginating (e.g. Discover): honour explicit limit= or fall back to 2000.
  const limitParam = parseInt(searchParams.get("limit") || (paginate ? "50" : "2000"), 10);
  const limit      = paginate ? Math.min(limitParam, 100) : limitParam;
  const skip       = paginate ? (pageParam - 1) * limit : 0;
  const includeCopies = searchParams.get("copies") === "true";

  const orderBy: Record<string, unknown> =
    sort === "title"    ? { title:           "asc"  } :
    sort === "title_z"  ? { title:           "desc" } :
    sort === "oldest"   ? { createdAt:       "asc"  } :
    sort === "year"     ? { publishYear:     "desc" } :
    sort === "year_asc" ? { publishYear:     "asc"  } :
    sort === "avail"    ? { availableCopies: "desc" } :
    sort === "barcode"  ? { barcode:         "asc"  } :
    sort === "isbn"     ? { isbn:            "asc"  } :
                          { createdAt:       "desc" }; // default: newest

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
      ...(categoryId    && { categoryId }),
      ...(availableOnly && { availableCopies: { gt: 0 } }),
      ...(condition     && condition in BookCondition && { condition: condition as BookCondition }),
      ...(materialType  && { materialType:  materialType  as typeof MATERIAL_TYPES[number]  }),
      ...(audienceLevel && { audienceLevel: audienceLevel as typeof AUDIENCE_LEVELS[number] }),
      ...(branchIdFilter && { branchId: branchIdFilter }),
      ...(language      && { language }),
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
    take:  limit,
    skip,
  });

  // Total count for pagination (only when paginating)
  const total = paginate ? await prisma.book.count({
    where: {
      ...(query && {
        OR: [
          { title:   { contains: query, mode: "insensitive" } },
          { isbn:    { contains: query, mode: "insensitive" } },
          { barcode: { contains: query, mode: "insensitive" } },
          { author:  { name: { contains: query, mode: "insensitive" } } },
          ...(scannedCopy ? [{ id: scannedCopy.bookId }] : []),
        ],
      }),
      ...(categoryId    && { categoryId }),
      ...(availableOnly && { availableCopies: { gt: 0 } }),
      ...(condition     && condition in BookCondition && { condition: condition as BookCondition }),
      ...(materialType  && { materialType:  materialType  as typeof MATERIAL_TYPES[number]  }),
      ...(audienceLevel && { audienceLevel: audienceLevel as typeof AUDIENCE_LEVELS[number] }),
      ...(branchIdFilter && { branchId: branchIdFilter }),
      ...(language      && { language }),
    },
  }) : null;

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

  // Return paginated envelope when page= was in the request, plain array otherwise
  if (paginate && total !== null) {
    return NextResponse.json({
      books: payload,
      total,
      page:  pageParam,
      pages: Math.max(1, Math.ceil(total / limit)),
      limit,
    });
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
    return NextResponse.json({ error: parsed.error.issues.map((e) => e.message).join(", ") }, { status: 400 });
  }

  /* Auto-generate system barcode if not provided */
  const barcode = await generateBarcode();

  // coAuthorIds is a relation, not a column — pull it out and handle via connect
  const { coAuthorIds, locationId: locationIdFromForm, branchId: branchIdFromForm, callNumber, ...bookData } = parsed.data;

  // Prefer explicit locationId from form; fall back to resolving free-text location string
  const locationId = locationIdFromForm !== undefined
    ? (locationIdFromForm ?? undefined)
    : await resolveLocationId(bookData.location);
  const branchId = branchIdFromForm ?? undefined;

  let book;
  try {
    book = await prisma.$transaction(async (tx) => {
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
  } catch (err: unknown) {
    if (
      typeof err === "object" && err !== null &&
      "code" in err && (err as { code: string }).code === "P2002"
    ) {
      const target = ((err as { meta?: { target?: string[] } }).meta?.target ?? []).join(", ");
      const field  = target.includes("isbn") ? "ISBN" : target || "a field";
      return NextResponse.json(
        { error: `Another book already uses this ${field}. Please use a unique value.` },
        { status: 409 }
      );
    }
    throw err;
  }

  if (callNumber) {
    await prisma.$executeRawUnsafe(`UPDATE "Book" SET "callNumber" = $1 WHERE id = $2`, callNumber, book.id);
  }

  await logActivity(actorFromSession(session), Actions.BOOK_CREATED, {
    entityType: "Book",
    entityId:   book.id,
    entityName: book.title,
    detail:     { isbn: book.isbn, totalCopies: book.totalCopies, materialType: book.materialType },
  });

  return NextResponse.json(book, { status: 201 });
}
