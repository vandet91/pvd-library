import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { stripIsbn } from "@/lib/isbn-format";

export interface DupBook {
  id:          string;
  title:       string;
  isbn:        string | null;
  authorName:  string | null;
  publishYear: number | null;
  totalCopies: number;
  loanCount:   number;
  createdAt:   string;
}

export interface DupGroup {
  key:        string;           // "isbn:<stripped>" or "title:<normalised>"
  groupType:  "isbn" | "title";
  books:      DupBook[];
}

// ── GET — find duplicate groups ───────────────────────────────────────────
export async function GET() {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const books = await prisma.book.findMany({
    where: { withdrawnAt: null },   // skip already-withdrawn books
    select: {
      id: true, title: true, isbn: true, publishYear: true, totalCopies: true, createdAt: true,
      author:  { select: { name: true } },
      _count:  { select: { loans: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const byIsbn  = new Map<string, typeof books>();
  const byTitle = new Map<string, typeof books>();

  for (const b of books) {
    // Group 1: same stripped ISBN (most reliable)
    const stripped = b.isbn ? stripIsbn(b.isbn) : "";
    if (stripped.length === 10 || stripped.length === 13) {
      const key = `isbn:${stripped}`;
      const list = byIsbn.get(key) ?? [];
      list.push(b);
      byIsbn.set(key, list);
      continue;   // ISBN match takes priority — don't also check title
    }

    // Group 2: same normalised title (for books with no valid ISBN)
    const normTitle = b.title.toLowerCase().trim().replace(/\s+/g, " ");
    if (normTitle) {
      const key = `title:${normTitle}`;
      const list = byTitle.get(key) ?? [];
      list.push(b);
      byTitle.set(key, list);
    }
  }

  const groups: DupGroup[] = [];

  for (const [key, list] of [...byIsbn, ...byTitle]) {
    if (list.length < 2) continue;
    const groupType = key.startsWith("isbn:") ? "isbn" : "title";
    groups.push({
      key,
      groupType,
      books: list.map((b) => ({
        id:          b.id,
        title:       b.title,
        isbn:        b.isbn,
        authorName:  b.author?.name ?? null,
        publishYear: b.publishYear,
        totalCopies: b.totalCopies,
        loanCount:   b._count.loans,
        createdAt:   b.createdAt.toISOString(),
      })),
    });
  }

  // Sort: ISBN duplicates first, then by group size descending
  groups.sort((a, b) => {
    if (a.groupType !== b.groupType) return a.groupType === "isbn" ? -1 : 1;
    return b.books.length - a.books.length;
  });

  const totalDuplicates = groups.reduce((sum, g) => sum + g.books.length - 1, 0);
  return NextResponse.json({ groups, totalDuplicates, totalGroups: groups.length });
}

// ── POST — delete selected duplicate books ────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { action, deleteIds } = await req.json() as {
    action:    "delete" | "delete-all-empty";
    deleteIds?: string[];
  };

  // ── delete-all-empty: auto-delete any book with 0 loans and 0 copies in a dup group
  if (action === "delete-all-empty") {
    const res = await GET();
    const { groups } = await res.json() as { groups: DupGroup[] };

    let deleted = 0; let skipped = 0;
    for (const group of groups) {
      const keepId = pickKeep(group.books);
      for (const b of group.books) {
        if (b.id === keepId) continue;
        if (b.loanCount > 0 || b.totalCopies > 0) { skipped++; continue; }
        try {
          await prisma.book.delete({ where: { id: b.id } });
          deleted++;
        } catch { skipped++; }
      }
    }
    return NextResponse.json({ deleted, skipped });
  }

  // ── merge: move all copies + relations from duplicates into the kept book ──
  if (action === "merge-all") {
    // Calibrate counters from actual BookCopy rows before merging,
    // so the total is accurate both before and after.
    await prisma.$executeRawUnsafe(`
      UPDATE "Book" b
      SET "totalCopies"     = sub.total,
          "availableCopies" = sub.avail
      FROM (
        SELECT "bookId",
               COUNT(*)                                      AS total,
               COUNT(*) FILTER (WHERE status = 'AVAILABLE') AS avail
        FROM "BookCopy" GROUP BY "bookId"
      ) sub WHERE b.id = sub."bookId"
    `);
    await prisma.$executeRawUnsafe(`
      UPDATE "Book" SET "totalCopies" = 0, "availableCopies" = 0
      WHERE id NOT IN (SELECT DISTINCT "bookId" FROM "BookCopy")
    `);

    const res    = await GET();
    const { groups } = await res.json() as { groups: DupGroup[] };
    let merged = 0; let skipped = 0;

    for (const group of groups) {
      const keepId = pickKeep(group.books);
      const keepBook = await prisma.book.findUnique({
        where: { id: keepId },
        select: { id: true, barcode: true, totalCopies: true, availableCopies: true },
      });
      if (!keepBook) continue;

      for (const b of group.books) {
        if (b.id === keepId) continue;
        try {
          const copies = await prisma.$queryRawUnsafe<{ id: string; copyNumber: number; barcode: string | null; status: string }[]>(
            `SELECT id, "copyNumber", barcode, status FROM "BookCopy" WHERE "bookId" = $1 ORDER BY "copyNumber"`, b.id,
          );

          if (copies.length === 0) {
            // No copies — just delete the empty duplicate
            await prisma.$executeRawUnsafe(`DELETE FROM "Book" WHERE id = $1`, b.id);
          } else {
            // Has copies — move them into the kept book
            const maxRow = await prisma.$queryRawUnsafe<{ max: number }[]>(
              `SELECT COALESCE(MAX("copyNumber"), 0) AS max FROM "BookCopy" WHERE "bookId" = $1`, keepId,
            );
            let nextCopyNum = (maxRow[0]?.max ?? 0) + 1;

            for (const copy of copies) {
              const pad        = String(nextCopyNum).padStart(3, "0");
              const newBarcode = keepBook.barcode
                ? (nextCopyNum === 1 ? keepBook.barcode : `${keepBook.barcode}-C${pad}`)
                : copy.barcode;
              await prisma.$executeRawUnsafe(
                `UPDATE "BookCopy" SET "bookId" = $1, "copyNumber" = $2, barcode = $3 WHERE id = $4`,
                keepId, nextCopyNum, newBarcode, copy.id,
              );
              nextCopyNum++;
            }

            await prisma.$executeRawUnsafe(`UPDATE "Loan"          SET "bookId" = $1 WHERE "bookId" = $2`, keepId, b.id);
            await prisma.$executeRawUnsafe(`UPDATE "Reservation"   SET "bookId" = $1 WHERE "bookId" = $2`, keepId, b.id);
            await prisma.$executeRawUnsafe(`UPDATE "BasketItem"    SET "bookId" = $1 WHERE "bookId" = $2`, keepId, b.id);
            await prisma.$executeRawUnsafe(`UPDATE "Rating"        SET "bookId" = $1 WHERE "bookId" = $2`, keepId, b.id);
            await prisma.$executeRawUnsafe(`UPDATE "InventoryItem" SET "bookId" = $1 WHERE "bookId" = $2`, keepId, b.id);
            await prisma.$executeRawUnsafe(`UPDATE "StockMovement" SET "bookId" = $1 WHERE "bookId" = $2`, keepId, b.id);

            await prisma.$executeRawUnsafe(`DELETE FROM "Book" WHERE id = $1`, b.id);

            // Recount from actual BookCopy rows — exclude BORROWED (on active loan) from totalCopies
            await prisma.$executeRawUnsafe(`
              UPDATE "Book"
              SET "totalCopies"     = (SELECT COUNT(*) FROM "BookCopy" WHERE "bookId" = $1 AND status != 'BORROWED'),
                  "availableCopies" = (SELECT COUNT(*) FROM "BookCopy" WHERE "bookId" = $1 AND status = 'AVAILABLE')
              WHERE id = $1`, keepId,
            );
          }

          merged++;
        } catch (e) {
          console.error(`[dedup merge] ${b.id}:`, e);
          skipped++;
        }
      }
    }
    // Recalibrate ALL books so counters match actual BookCopy rows
    await prisma.$executeRawUnsafe(`
      UPDATE "Book" b
      SET "totalCopies"     = sub.total,
          "availableCopies" = sub.avail
      FROM (
        SELECT "bookId",
               COUNT(*)                                      AS total,
               COUNT(*) FILTER (WHERE status = 'AVAILABLE') AS avail
        FROM "BookCopy"
        GROUP BY "bookId"
      ) sub
      WHERE b.id = sub."bookId"
    `);
    await prisma.$executeRawUnsafe(`
      UPDATE "Book"
      SET "totalCopies" = 0, "availableCopies" = 0
      WHERE id NOT IN (SELECT DISTINCT "bookId" FROM "BookCopy")
    `);

    return NextResponse.json({ merged, skipped });
  }

  // ── merge: merge a specific pair (keepId + deleteId) ─────────────────────
  if (action === "merge" && deleteIds && deleteIds.length > 0) {
    const { keepId } = await req.clone().json() as { keepId?: string };
    if (!keepId) return NextResponse.json({ error: "keepId required for merge" }, { status: 400 });

    let merged = 0;
    for (const deleteId of deleteIds) {
      try {
        const keepBook = await prisma.book.findUnique({
          where: { id: keepId }, select: { id: true, barcode: true },
        });
        if (!keepBook) continue;

        const copies = await prisma.$queryRawUnsafe<{ id: string; barcode: string | null; status: string }[]>(
          `SELECT id, barcode, status FROM "BookCopy" WHERE "bookId" = $1 ORDER BY "copyNumber"`, deleteId,
        );

        if (copies.length === 0) {
          // No copies — just delete the empty duplicate
          await prisma.$executeRawUnsafe(`DELETE FROM "Book" WHERE id = $1`, deleteId);
        } else {
          // Has copies — move them into the kept book
          const maxRow = await prisma.$queryRawUnsafe<{ max: number }[]>(
            `SELECT COALESCE(MAX("copyNumber"), 0) AS max FROM "BookCopy" WHERE "bookId" = $1`, keepId,
          );
          let nextCopyNum = (maxRow[0]?.max ?? 0) + 1;

          for (const copy of copies) {
            const pad        = String(nextCopyNum).padStart(3, "0");
            const newBarcode = keepBook.barcode ? `${keepBook.barcode}-C${pad}` : copy.barcode;
            await prisma.$executeRawUnsafe(
              `UPDATE "BookCopy" SET "bookId" = $1, "copyNumber" = $2, barcode = $3 WHERE id = $4`,
              keepId, nextCopyNum, newBarcode, copy.id,
            );
            nextCopyNum++;
          }

          await prisma.$executeRawUnsafe(`UPDATE "Loan"          SET "bookId" = $1 WHERE "bookId" = $2`, keepId, deleteId);
          await prisma.$executeRawUnsafe(`UPDATE "Reservation"   SET "bookId" = $1 WHERE "bookId" = $2`, keepId, deleteId);
          await prisma.$executeRawUnsafe(`UPDATE "BasketItem"    SET "bookId" = $1 WHERE "bookId" = $2`, keepId, deleteId);
          await prisma.$executeRawUnsafe(`UPDATE "Rating"        SET "bookId" = $1 WHERE "bookId" = $2`, keepId, deleteId);
          await prisma.$executeRawUnsafe(`UPDATE "InventoryItem" SET "bookId" = $1 WHERE "bookId" = $2`, keepId, deleteId);
          await prisma.$executeRawUnsafe(`UPDATE "StockMovement" SET "bookId" = $1 WHERE "bookId" = $2`, keepId, deleteId);

          await prisma.$executeRawUnsafe(`DELETE FROM "Book" WHERE id = $1`, deleteId);

          await prisma.$executeRawUnsafe(`
            UPDATE "Book"
            SET "totalCopies"     = (SELECT COUNT(*)        FROM "BookCopy" WHERE "bookId" = $1),
                "availableCopies" = (SELECT COUNT(*) FROM "BookCopy" WHERE "bookId" = $1 AND status = 'AVAILABLE')
            WHERE id = $1`, keepId,
          );
        }
        merged++;
      } catch (e) {
        console.error(`[dedup merge single] ${deleteId}:`, e);
      }
    }
    return NextResponse.json({ merged });
  }

  // ── delete: remove specific book IDs chosen by the user
  if (action === "delete" && Array.isArray(deleteIds) && deleteIds.length > 0) {
    let deleted = 0; const errors: string[] = [];
    for (const id of deleteIds) {
      try {
        // Refuse to delete books that still have active loans or physical copies
        const book = await prisma.book.findUnique({
          where: { id },
          select: { id: true, title: true, totalCopies: true, _count: { select: { loans: true } } },
        });
        if (!book) { errors.push(`${id}: not found`); continue; }
        if (book._count.loans > 0) { errors.push(`${book.title}: has loan history`); continue; }
        if (book.totalCopies > 0)  { errors.push(`${book.title}: has physical copies`); continue; }
        await prisma.book.delete({ where: { id } });
        deleted++;
      } catch (e) {
        errors.push(`${id}: ${e instanceof Error ? e.message : "error"}`);
      }
    }
    return NextResponse.json({ deleted, skipped: deleteIds.length - deleted, errors });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

// ── Helpers ───────────────────────────────────────────────────────────────

/** Pick the book to keep: most loans → most copies → oldest created */
function pickKeep(books: DupBook[]): string {
  return [...books].sort((a, b) => {
    if (b.loanCount   !== a.loanCount)   return b.loanCount   - a.loanCount;
    if (b.totalCopies !== a.totalCopies) return b.totalCopies - a.totalCopies;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  })[0].id;
}
