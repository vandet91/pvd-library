import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { parsePmbDump } from "@/lib/pmb-parser";
import { stripIsbn } from "@/lib/isbn-format";

/** Normalize title for fuzzy matching — collapse whitespace, lowercase, strip punctuation */
function normalizeTitle(t: string): string {
  return t
    .toLowerCase()
    .replace(/\s+/g, " ")          // collapse multiple spaces
    .replace(/[.,;:!?()\[\]"'«»]/g, "") // strip common punctuation
    .trim();
}

/**
 * POST /api/admin/migration/pmb/missing
 *
 * Compares the PMB dump against the database and reports:
 *   - Notices (books) that were not imported
 *   - Exemplaires (copies) that were not imported
 *   - Members (empr) that were not imported
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "ADMIN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sql } = await req.json() as { sql: string };
  if (!sql || sql.length < 100)
    return NextResponse.json({ error: "Invalid SQL dump" }, { status: 400 });

  const dump = parsePmbDump(sql);

  // Build author name map for display
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

  // ── Load DB state ─────────────────────────────────────────────────────
  // Books: index by pmbNoticeId, ISBN, and title
  const dbBooks = await prisma.$queryRawUnsafe<{
    id: string; isbn: string | null; title: string; pmbNoticeId: number | null;
  }[]>(`SELECT id, isbn, title, "pmbNoticeId" FROM "Book"`);

  const dbByNoticeId = new Map<number, string>();
  const dbByIsbn     = new Map<string, string>();
  const dbByTitle    = new Map<string, string>();
  for (const b of dbBooks) {
    if (b.pmbNoticeId) dbByNoticeId.set(b.pmbNoticeId, b.id);
    if (b.isbn) { const s = stripIsbn(b.isbn); if (s) dbByIsbn.set(s, b.id); }
    dbByTitle.set(normalizeTitle(b.title), b.id);
  }


  // Copies: index by pmbId
  const dbCopies = await prisma.$queryRawUnsafe<{ pmbId: number }[]>(
    `SELECT "pmbId" FROM "BookCopy" WHERE "pmbId" IS NOT NULL`
  );
  const dbCopyPmbIds = new Set(dbCopies.map((c) => c.pmbId));

  // Members: index by studentId and memberId
  const dbMembers = await prisma.member.findMany({ select: { memberId: true, studentId: true } });
  const dbMemberIds  = new Set(dbMembers.map((m) => m.memberId));
  const dbStudentIds = new Set(dbMembers.map((m) => m.studentId).filter(Boolean) as string[]);

  // ── Missing notices ────────────────────────────────────────────────────
  const missingNotices: { noticeId: number; title: string; isbn: string; author: string }[] = [];
  for (const n of dump.notices) {
    const stripped = stripIsbn(n.isbn ?? "");
    const isValidIsbn = stripped.length === 10 || stripped.length === 13;
    const found =
      dbByNoticeId.has(n.notice_id) ||
      (isValidIsbn && dbByIsbn.has(stripped)) ||
      dbByTitle.has(normalizeTitle(n.titre));
    if (!found) {
      missingNotices.push({
        noticeId: n.notice_id,
        title:    n.titre,
        isbn:     n.isbn ?? "",
        author:   noticeAuthorMap.get(n.notice_id) ?? "",
      });
    }
  }

  // ── Missing exemplaires ────────────────────────────────────────────────
  // Active loan copies are expected to be missing from available copies
  // but they should exist as BORROWED copies after loan migration
  const activeLoanExplIds = new Set(dump.pret.map((p) => p.expl_id));

  const missingExemplaires: {
    exemplaireId: number; noticeId: number; barcode: string;
    title: string; isOnLoan: boolean;
  }[] = [];

  for (const e of dump.exemplaires) {
    if (dbCopyPmbIds.has(e.exemplaire_id)) continue; // already imported
    const notice  = dump.notices.find((n) => n.notice_id === e.notice_id);
    const isOnLoan = activeLoanExplIds.has(e.exemplaire_id);
    missingExemplaires.push({
      exemplaireId: e.exemplaire_id,
      noticeId:     e.notice_id,
      barcode:      e.cb?.trim() || "",
      title:        notice?.titre ?? "(unknown)",
      isOnLoan,
    });
  }

  // ── Missing members ────────────────────────────────────────────────────
  const missingMembers: { emprId: number; name: string; cb: string }[] = [];
  for (const e of dump.empr) {
    const fullName = [e.empr_prenom, e.empr_nom].filter(Boolean).join(" ").trim();
    if (!fullName) continue;
    const cb     = e.empr_cb?.trim() || null;
    const pmbKey = `PMB-${e.empr_id}`;
    const found  =
      dbMemberIds.has(pmbKey) ||
      (cb && dbMemberIds.has(cb)) ||
      (cb && dbStudentIds.has(cb));
    if (!found) {
      missingMembers.push({ emprId: e.empr_id, name: fullName, cb: cb ?? "" });
    }
  }

  // ── DB breakdown ─────────────────────────────────────────────────────────
  const dbTotalBooks    = dbBooks.length;
  const dbWithPmbId     = dbBooks.filter((b) => b.pmbNoticeId != null).length;
  const dbWithoutPmbId  = dbTotalBooks - dbWithPmbId; // demo / manually added

  // Notices that matched something in DB
  const matchedNoticeIds = new Set<number>();
  for (const n of dump.notices) {
    const stripped    = stripIsbn(n.isbn ?? "");
    const isValidIsbn = stripped.length === 10 || stripped.length === 13;
    if (
      dbByNoticeId.has(n.notice_id) ||
      (isValidIsbn && dbByIsbn.has(stripped)) ||
      dbByTitle.has(normalizeTitle(n.titre))
    ) matchedNoticeIds.add(n.notice_id);
  }

  // Check for notices mapping to the same DB book (potential duplicates)
  const noticeToDbBook = new Map<number, string>();
  for (const n of dump.notices) {
    const stripped    = stripIsbn(n.isbn ?? "");
    const isValidIsbn = stripped.length === 10 || stripped.length === 13;
    const bookId =
      dbByNoticeId.get(n.notice_id) ??
      (isValidIsbn ? dbByIsbn.get(stripped) : undefined) ??
      dbByTitle.get(normalizeTitle(n.titre));
    if (bookId) noticeToDbBook.set(n.notice_id, bookId);
  }
  const dbBookToNotices = new Map<string, number[]>();
  for (const [noticeId, bookId] of noticeToDbBook.entries()) {
    const list = dbBookToNotices.get(bookId) ?? [];
    list.push(noticeId);
    dbBookToNotices.set(bookId, list);
  }
  const duplicateMappings = [...dbBookToNotices.entries()]
    .filter(([, notices]) => notices.length > 1)
    .map(([bookId, notices]) => ({
      bookId,
      title: dbBooks.find((b) => b.id === bookId)?.title ?? "",
      noticeIds: notices,
    }));

  return NextResponse.json({
    summary: {
      notices:      { total: dump.notices.length,     missing: missingNotices.length },
      exemplaires:  { total: dump.exemplaires.length, missing: missingExemplaires.length,
                      missingAvailable: missingExemplaires.filter((e) => !e.isOnLoan).length,
                      missingOnLoan:    missingExemplaires.filter((e) => e.isOnLoan).length },
      members:      { total: dump.empr.length,        missing: missingMembers.length },
    },
    dbBreakdown: {
      totalBooks:         dbTotalBooks,
      importedFromPmb:    dbWithPmbId,
      manualOrDemo:       dbWithoutPmbId,
      pmbNoticesMatched:  matchedNoticeIds.size,
      pmbNoticesMissing:  dump.notices.length - matchedNoticeIds.size,
      duplicateMappings:  duplicateMappings.length,
      duplicateDetails:   duplicateMappings.slice(0, 20),
    },
    missingNotices,
    missingExemplaires,
    missingMembers,
  });
}
