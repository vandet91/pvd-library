import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { parsePmbDump } from "@/lib/pmb-parser";
import { stripIsbn } from "@/lib/isbn-format";

/**
 * POST /api/admin/migration/pmb/backfill-notice-id
 *
 * Stamps pmbNoticeId on existing Book records that were imported before
 * the field was added. Needed for loan migration to work.
 *
 * Match order per notice:
 *   1. ISBN (stripped digits)
 *   2. Title + Author (case-insensitive)
 *
 * Body: { sql: string }
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "ADMIN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sql } = await req.json() as { sql: string };
  if (!sql || sql.length < 100)
    return NextResponse.json({ error: "Invalid SQL dump" }, { status: 400 });

  const dump = parsePmbDump(sql);

  // Build author name map
  const authorNameMap = new Map<number, string>();
  for (const a of dump.authors) {
    const name = [a.author_firstname, a.author_name].filter(Boolean).join(" ").trim();
    if (name) authorNameMap.set(a.author_id, name);
  }
  const noticeAuthorMap = new Map<number, string>();
  for (const an of dump.authors_notices) {
    if (!noticeAuthorMap.has(an.notice_id)) {
      const name = authorNameMap.get(an.author_id);
      if (name) noticeAuthorMap.set(an.notice_id, name);
    }
  }

  // Load all books
  const allBooks = await prisma.book.findMany({
    select: { id: true, isbn: true, title: true, author: { select: { name: true } } },
  });

  // ISBN index
  const isbnMap = new Map<string, string>();
  for (const b of allBooks) {
    if (b.isbn) {
      const s = stripIsbn(b.isbn);
      if (s) isbnMap.set(s, b.id);
    }
  }

  // Title + author index (also title-only for books without author)
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").replace(/[.,;:!?()\[\]"'«»]/g, "").trim();
  const titleAuthorMap = new Map<string, string>();
  const titleOnlyMap   = new Map<string, string>();
  for (const b of allBooks) {
    const nt = norm(b.title);
    const na = norm(b.author?.name ?? "");
    titleAuthorMap.set(`${nt}|||${na}`, b.id);
    titleOnlyMap.set(nt, b.id);   // fallback for title-only books
  }

  let stamped = 0;
  let notFound = 0;
  let alreadySet = 0;

  for (const n of dump.notices) {
    // Find matching book
    const stripped = stripIsbn(n.isbn ?? "");
    let bookId = stripped.length >= 10 ? isbnMap.get(stripped) : undefined;

    if (!bookId) {
      const authorName = noticeAuthorMap.get(n.notice_id) ?? "";
      const key = `${norm(n.titre)}|||${norm(authorName)}`;
      bookId = titleAuthorMap.get(key);
    }

    // Fallback: title-only match (books with no author)
    if (!bookId) {
      bookId = titleOnlyMap.get(norm(n.titre));
    }

    if (!bookId) { notFound++; continue; }

    // Check if already set
    const existing = await prisma.$queryRawUnsafe<{ pmbNoticeId: number | null }[]>(
      `SELECT "pmbNoticeId" FROM "Book" WHERE id = $1`, bookId,
    );
    if (existing[0]?.pmbNoticeId != null) { alreadySet++; continue; }

    await prisma.$executeRawUnsafe(
      `UPDATE "Book" SET "pmbNoticeId" = $1 WHERE id = $2`,
      n.notice_id, bookId,
    );
    stamped++;
  }

  return NextResponse.json({ stamped, notFound, alreadySet, total: dump.notices.length });
}
