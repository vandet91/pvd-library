import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";

/**
 * GET /api/books/processing
 * Returns three processing queues for admin staff:
 *
 *  1. needsLabel     — BookCopy where labelPrinted=false (primary queue — no basket required)
 *  2. needsLabelTotal — total count (the list is capped at 200)
 *  3. untagged       — BasketItem where tagged=false (basket-based batch workflow)
 *  4. noBarcode      — BookCopy with no barcode AND no RFID
 */
export async function GET() {
  const session = await auth();
  if (!session || !can(session.user?.role, "STAFF"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [needsLabelRaw, needsLabelTotal, untaggedRaw, noBarcodeRaw] = await Promise.all([
    // Primary queue via raw SQL to avoid stale-engine relation issues
    prisma.$queryRawUnsafe<{
      id: string; copyNumber: number; barcode: string | null; condition: string;
      status: string; acquiredAt: string;
      bookId: string; title: string; isbn: string | null; authorName: string | null;
      basketId: string | null; basketName: string | null; tagged: boolean | null;
    }[]>(`
      SELECT
        c.id, c."copyNumber", c.barcode, c.condition, c.status, c."acquiredAt",
        b.id AS "bookId", b.title, b.isbn,
        a.name AS "authorName",
        bi."basketId", bk.name AS "basketName", bi.tagged
      FROM "BookCopy" c
      JOIN "Book"   b  ON b.id  = c."bookId"
      LEFT JOIN "Author" a  ON a.id  = b."authorId"
      LEFT JOIN LATERAL (
        SELECT bi2."basketId", bi2.tagged
        FROM "BasketItem" bi2
        WHERE bi2."copyId" = c.id
        LIMIT 1
      ) bi ON true
      LEFT JOIN "Basket" bk ON bk.id = bi."basketId"
      WHERE c."labelPrinted" = false
      ORDER BY c."acquiredAt" DESC
      LIMIT 200
    `),

    prisma.bookCopy.count({ where: { labelPrinted: false } }),

    // Secondary queue: ITEM basket items only (copyId not null)
    prisma.$queryRawUnsafe<{
      id: string; basketId: string; addedAt: string; tagged: boolean;
      basketName: string;
      bookId: string; title: string; isbn: string | null; location: string | null; authorName: string | null;
      copyId: string; copyNumber: number; barcode: string | null; rfid: string | null;
      condition: string; copyStatus: string; labelPrinted: boolean;
    }[]>(`
      SELECT
        bi.id, bi."basketId", bi."addedAt", bi.tagged,
        bk.name AS "basketName",
        b.id AS "bookId", b.title, b.isbn, b.location,
        a.name AS "authorName",
        c.id AS "copyId", c."copyNumber", c.barcode, c.rfid,
        c.condition, c.status AS "copyStatus", c."labelPrinted"
      FROM "BasketItem" bi
      JOIN "Basket"   bk ON bk.id = bi."basketId"
      JOIN "Book"      b  ON b.id  = bi."bookId"
      JOIN "BookCopy"  c  ON c.id  = bi."copyId"
      LEFT JOIN "Author" a ON a.id = b."authorId"
      WHERE bi.tagged = false AND bi."copyId" IS NOT NULL
      ORDER BY bi."basketId", bi."addedAt"
    `),

    prisma.$queryRawUnsafe<{
      id: string; copyNumber: number; condition: string; status: string; acquiredAt: string;
      bookId: string; title: string; isbn: string | null; authorName: string | null;
    }[]>(`
      SELECT
        c.id, c."copyNumber", c.condition, c.status, c."acquiredAt",
        b.id AS "bookId", b.title, b.isbn,
        a.name AS "authorName"
      FROM "BookCopy" c
      JOIN "Book"    b ON b.id = c."bookId"
      LEFT JOIN "Author" a ON a.id = b."authorId"
      WHERE c.barcode IS NULL AND c.rfid IS NULL
      ORDER BY c."acquiredAt" DESC
      LIMIT 300
    `),
  ]);

  // Reshape raw rows into the shape the frontend expects
  const needsLabel = needsLabelRaw.map((r) => ({
    id: r.id, copyNumber: r.copyNumber, barcode: r.barcode,
    condition: r.condition, status: r.status, acquiredAt: r.acquiredAt,
    book: { id: r.bookId, title: r.title, isbn: r.isbn, author: r.authorName ? { name: r.authorName } : null },
    basketItems: r.basketId ? [{ basketId: r.basketId, tagged: r.tagged ?? false, basket: { id: r.basketId, name: r.basketName ?? "" } }] : [],
  }));

  const untagged = untaggedRaw.map((r) => ({
    id: r.id, basketId: r.basketId, addedAt: r.addedAt, tagged: r.tagged,
    basket: { id: r.basketId, name: r.basketName },
    book: { id: r.bookId, title: r.title, isbn: r.isbn, location: r.location, author: r.authorName ? { name: r.authorName } : null },
    copy: { id: r.copyId, copyNumber: r.copyNumber, barcode: r.barcode, rfid: r.rfid, condition: r.condition, status: r.copyStatus, labelPrinted: r.labelPrinted },
  }));

  const noBarcode = noBarcodeRaw.map((r) => ({
    id: r.id, copyNumber: r.copyNumber, condition: r.condition, status: r.status, acquiredAt: r.acquiredAt,
    book: { id: r.bookId, title: r.title, isbn: r.isbn, author: r.authorName ? { name: r.authorName } : null },
  }));

  return NextResponse.json({ needsLabel, needsLabelTotal, untagged, noBarcode });
}
