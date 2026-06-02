import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { parsePmbDump } from "@/lib/pmb-parser";
import { stripIsbn } from "@/lib/isbn-format";

/**
 * POST /api/admin/migration/pmb/backfill-pmb-id
 *
 * After barcodes have been regenerated, this endpoint re-links existing
 * BookCopy records to their original PMB exemplaire by stamping pmbId.
 *
 * Matching priority per notice:
 *   1. ISBN  (stripped digits, case-insensitive)
 *   2. Title + Author name (case-insensitive)
 *
 * Once the book is found, exemplaires (sorted by exemplaire_id asc) are
 * matched positionally to copies (sorted by copyNumber asc).
 *
 * Body: { sql: string }  — the full PMB SQL dump
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "ADMIN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sql } = await req.json() as { sql: string };
  if (!sql || sql.length < 100)
    return NextResponse.json({ error: "Invalid SQL dump" }, { status: 400 });

  const dump = parsePmbDump(sql);

  // Build author name map: author_id → name
  const authorNameMap = new Map<number, string>();
  for (const a of dump.authors) {
    const name = [a.author_firstname, a.author_name].filter(Boolean).join(" ").trim();
    if (name) authorNameMap.set(a.author_id, name);
  }

  // Build notice → primary author name map
  const noticeAuthorMap = new Map<number, string>();
  for (const an of dump.authors_notices) {
    if (!noticeAuthorMap.has(an.notice_id)) {
      const name = authorNameMap.get(an.author_id);
      if (name) noticeAuthorMap.set(an.notice_id, name);
    }
  }

  // Group exemplaires by notice_id, sorted by exemplaire_id asc
  const exemplairesByNotice = new Map<number, typeof dump.exemplaires>();
  for (const e of dump.exemplaires) {
    const list = exemplairesByNotice.get(e.notice_id) ?? [];
    list.push(e);
    exemplairesByNotice.set(e.notice_id, list);
  }
  for (const list of exemplairesByNotice.values()) {
    list.sort((a, b) => a.exemplaire_id - b.exemplaire_id);
  }

  // Pre-load all books with their author for title+author matching
  const allBooks = await prisma.book.findMany({
    select: {
      id:    true,
      isbn:  true,
      title: true,
      author: { select: { name: true } },
    },
  });

  // Build ISBN lookup: stripped digits → book id
  const isbnMap = new Map<string, string>();
  for (const b of allBooks) {
    if (b.isbn) {
      const stripped = stripIsbn(b.isbn);
      if (stripped) isbnMap.set(stripped, b.id);
    }
  }

  // Build title+author lookup: "title|||author" → book id
  const titleAuthorMap = new Map<string, string>();
  for (const b of allBooks) {
    const key = `${b.title.toLowerCase().trim()}|||${(b.author?.name ?? "").toLowerCase().trim()}`;
    titleAuthorMap.set(key, b.id);
  }

  const result = { matched: 0, stamped: 0, notFound: 0 };

  for (const [noticeId, exmpls] of exemplairesByNotice.entries()) {
    const notice = dump.notices.find((n) => n.notice_id === noticeId);
    if (!notice) { result.notFound += exmpls.length; continue; }

    // ── 1. Try ISBN match ──
    const strippedIsbn = stripIsbn(notice.isbn ?? "");
    let bookId = strippedIsbn.length >= 10 ? isbnMap.get(strippedIsbn) : undefined;

    // ── 2. Fallback: title + author ──
    if (!bookId) {
      const authorName = noticeAuthorMap.get(noticeId) ?? "";
      const key = `${notice.titre.toLowerCase().trim()}|||${authorName.toLowerCase().trim()}`;
      bookId = titleAuthorMap.get(key);
    }

    if (!bookId) { result.notFound += exmpls.length; continue; }
    result.matched++;

    // Get existing copies for this book sorted by copyNumber asc
    const copies = await prisma.$queryRawUnsafe<{ id: string; copyNumber: number }[]>(
      `SELECT id, "copyNumber" FROM "BookCopy" WHERE "bookId" = $1 ORDER BY "copyNumber" ASC`,
      bookId,
    );

    // Match positionally — exemplaire[i] → copy[i]
    for (let i = 0; i < exmpls.length; i++) {
      const copy = copies[i];
      if (!copy) break; // more exemplaires than copies — stop
      await prisma.$executeRawUnsafe(
        `UPDATE "BookCopy" SET "pmbId" = $1 WHERE id = $2`,
        exmpls[i].exemplaire_id, copy.id,
      );
      result.stamped++;
    }
  }

  return NextResponse.json(result);
}
