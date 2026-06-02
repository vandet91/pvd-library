import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { parsePmbDump } from "@/lib/pmb-parser";
import { stripIsbn } from "@/lib/isbn-format";

function normalizeTitle(t: string): string {
  return t.toLowerCase().replace(/\s+/g, " ").replace(/[.,;:!?()\[\]"'«»]/g, "").trim();
}

function mapCondition(pmb: string): string {
  const s = (pmb ?? "").toUpperCase();
  if (s === "1" || s.includes("BON")  || s.includes("GOOD"))  return "GOOD";
  if (s === "2" || s.includes("CORRECT") || s.includes("FAIR")) return "FAIR";
  if (s === "3" || s.includes("MAUV") || s.includes("POOR"))  return "POOR";
  if (s.includes("DAMAGED") || s.includes("ABIME"))           return "DAMAGED";
  return "GOOD";
}

/**
 * POST /api/admin/migration/pmb/import-missing-copies
 *
 * Imports exemplaires that have no matching BookCopy (pmbId not found in DB).
 * Skips exemplaires on active loan (those are handled by migrate-loans).
 * Adds copies to existing books using MAX(copyNumber)+1 per book.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "ADMIN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sql } = await req.json() as { sql: string };
  if (!sql || sql.length < 100)
    return NextResponse.json({ error: "Invalid SQL dump" }, { status: 400 });

  const dump = parsePmbDump(sql);

  // Active loan exemplaire IDs — skip these (handled by migrate-loans)
  const activeLoanIds = new Set(dump.pret.map((p) => p.expl_id));

  // Exemplaires already in DB
  const existingPmbIds = await prisma.$queryRawUnsafe<{ pmbId: number }[]>(
    `SELECT "pmbId" FROM "BookCopy" WHERE "pmbId" IS NOT NULL`
  );
  const importedIds = new Set(existingPmbIds.map((r) => r.pmbId));

  // Books indexed by pmbNoticeId, ISBN, and normalized title
  const bookRows = await prisma.$queryRawUnsafe<{ id: string; barcode: string | null; pmbNoticeId: number | null; isbn: string | null; title: string }[]>(
    `SELECT id, barcode, "pmbNoticeId", isbn, title FROM "Book"`
  );
  const bookByNoticeId = new Map<number, typeof bookRows[0]>();
  const bookByIsbn     = new Map<string, typeof bookRows[0]>();
  const bookByTitle    = new Map<string, typeof bookRows[0]>();
  for (const b of bookRows) {
    if (b.pmbNoticeId) bookByNoticeId.set(b.pmbNoticeId, b);
    if (b.isbn) { const s = stripIsbn(b.isbn); if (s) bookByIsbn.set(s, b); }
    bookByTitle.set(normalizeTitle(b.title), b);
  }

  // Find missing exemplaires (not in DB, not on active loan)
  const missing = dump.exemplaires.filter(
    (e) => !importedIds.has(e.exemplaire_id) && !activeLoanIds.has(e.exemplaire_id)
  );

  if (missing.length === 0)
    return NextResponse.json({ imported: 0, skipped: 0, message: "No missing copies found" });

  const result = { imported: 0, skipped: 0, noBook: 0, errors: [] as string[] };

  // Track max copy number per book within this run
  const copyCounterByBook = new Map<string, number>();

  for (const e of missing) {
    // 1. Try by pmbNoticeId (primary)
    let book = bookByNoticeId.get(e.notice_id);

    // 2. Fallback: find notice in dump, match by ISBN
    if (!book) {
      const notice  = dump.notices.find((n) => n.notice_id === e.notice_id);
      if (notice) {
        const stripped = stripIsbn(notice.isbn ?? "");
        if (stripped.length >= 10) book = bookByIsbn.get(stripped);
        // 3. Fallback: match by normalized title (catches "ទុំទាវ" multi-edition)
        if (!book) book = bookByTitle.get(normalizeTitle(notice.titre));
      }
    }

    if (!book) { result.noBook++; continue; }

    // Get current max copyNumber for this book
    if (!copyCounterByBook.has(book.id)) {
      const maxRow = await prisma.$queryRawUnsafe<{ max: number }[]>(
        `SELECT COALESCE(MAX("copyNumber"), 0) AS max FROM "BookCopy" WHERE "bookId" = $1`, book.id,
      );
      copyCounterByBook.set(book.id, maxRow[0]?.max ?? 0);
    }

    const copyNum    = (copyCounterByBook.get(book.id) ?? 0) + 1;
    copyCounterByBook.set(book.id, copyNum);

    const pad        = String(copyNum).padStart(3, "0");
    const copyBarcode = book.barcode
      ? (copyNum === 1 ? book.barcode : `${book.barcode}-C${pad}`)
      : null;

    const condition = mapCondition(e.expl_condition);

    try {
      const copy = await prisma.bookCopy.create({
        data: {
          bookId:      book.id,
          copyNumber:  copyNum,
          barcode:     copyBarcode,
          condition:   condition as Parameters<typeof prisma.bookCopy.create>[0]["data"]["condition"],
          status:      "AVAILABLE",
          labelPrinted: true,
          price:       e.expl_prix || null,
        },
      });

      await prisma.$executeRawUnsafe(
        `UPDATE "BookCopy" SET "pmbId" = $1, "pmbOriginalBarcode" = $2 WHERE id = $3`,
        e.exemplaire_id, e.cb?.trim() || null, copy.id,
      );

      // Update book counts
      await prisma.$executeRawUnsafe(
        `UPDATE "Book"
         SET "totalCopies" = "totalCopies" + 1,
             "availableCopies" = "availableCopies" + 1
         WHERE id = $1`, book.id,
      );

      result.imported++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`expl ${e.exemplaire_id}: ${msg}`);
      result.skipped++;
    }
  }

  return NextResponse.json({
    found:    missing.length,
    imported: result.imported,
    skipped:  result.skipped,
    noBook:   result.noBook,
    errors:   result.errors.slice(0, 20),
  });
}
