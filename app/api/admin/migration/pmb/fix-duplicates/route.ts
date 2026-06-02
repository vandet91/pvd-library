import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import {
  parsePmbDump, mapMaterialType, mapLanguage, mapMemberType,
} from "@/lib/pmb-parser";
import { stripIsbn } from "@/lib/isbn-format";
import { getBarcodeSettings } from "@/lib/barcode";

function normalizeTitle(t: string): string {
  return t.toLowerCase().replace(/\s+/g, " ").replace(/[.,;:!?()\[\]"'«»]/g, "").trim();
}

/**
 * GET  /api/admin/migration/pmb/fix-duplicates
 * Preview which notices are collapsed into the same DB book.
 *
 * POST /api/admin/migration/pmb/fix-duplicates
 * For each duplicate group: keep the notice with the best match (pmbNoticeId > ISBN > title),
 * import the rest as new books, reassign pmbNoticeId.
 */

async function buildMaps(sql: string) {
  const dump = parsePmbDump(sql);

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

  // Map each notice to a DB book
  const noticeToBook = new Map<number, string>();
  for (const n of dump.notices) {
    const stripped    = stripIsbn(n.isbn ?? "");
    const isValidIsbn = stripped.length === 10 || stripped.length === 13;
    const bookId =
      dbByNoticeId.get(n.notice_id) ??
      (isValidIsbn ? dbByIsbn.get(stripped) : undefined) ??
      dbByTitle.get(normalizeTitle(n.titre));
    if (bookId) noticeToBook.set(n.notice_id, bookId);
  }

  // Group by DB book → find books with multiple notices
  const bookToNotices = new Map<string, number[]>();
  for (const [noticeId, bookId] of noticeToBook.entries()) {
    const list = bookToNotices.get(bookId) ?? [];
    list.push(noticeId);
    bookToNotices.set(bookId, list);
  }

  const duplicateGroups = [...bookToNotices.entries()]
    .filter(([, notices]) => notices.length > 1)
    .map(([bookId, noticeIds]) => {
      const dbBook = dbBooks.find((b) => b.id === bookId)!;
      // Best match = notice whose id matches pmbNoticeId, else notice with ISBN, else first
      const best = noticeIds.find((id) => dbBook.pmbNoticeId === id)
        ?? noticeIds.find((id) => {
          const n = dump.notices.find((x) => x.notice_id === id);
          const s = stripIsbn(n?.isbn ?? "");
          return s.length >= 10 && dbByIsbn.get(s) === bookId;
        })
        ?? noticeIds[0];
      const rest = noticeIds.filter((id) => id !== best);
      return {
        bookId,
        dbTitle: dbBook.title,
        bestNoticeId: best,
        collapsedNoticeIds: rest,
        notices: noticeIds.map((id) => {
          const n = dump.notices.find((x) => x.notice_id === id);
          return { noticeId: id, title: n?.titre ?? "", isbn: n?.isbn ?? "", isBest: id === best };
        }),
      };
    });

  return { dump, duplicateGroups, dbBooks };
}

export async function GET(req: NextRequest) {
  const session = await req.headers.get("cookie") ? await import("@/lib/auth").then(m => m.auth()) : null;
  if (!session || !(await import("@/lib/rbac").then(m => m.can(session.user?.role, "ADMIN"))))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sql = req.nextUrl.searchParams.get("sql");
  if (!sql) return NextResponse.json({ error: "sql param required" }, { status: 400 });

  const { duplicateGroups } = await buildMaps(sql);
  return NextResponse.json({
    totalGroups:   duplicateGroups.length,
    totalCollapsed: duplicateGroups.reduce((s, g) => s + g.collapsedNoticeIds.length, 0),
    groups: duplicateGroups.slice(0, 50),
  });
}

export async function POST(req: NextRequest) {
  const { auth }    = await import("@/lib/auth");
  const { can }     = await import("@/lib/rbac");
  const session     = await auth();
  if (!session || !can(session.user?.role, "ADMIN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sql } = await req.json() as { sql: string };
  if (!sql || sql.length < 100)
    return NextResponse.json({ error: "Invalid SQL dump" }, { status: 400 });

  const { dump, duplicateGroups } = await buildMaps(sql);
  const { prefix, padding }       = await getBarcodeSettings();
  const pfx = `${prefix}-`;

  // Build author/publisher/category maps
  const authorIdMap = new Map<number, string>();
  for (const a of dump.authors) {
    const name = [a.author_firstname, a.author_name].filter(Boolean).join(" ").trim() || "Unknown";
    const ex   = await prisma.author.findFirst({ where: { name } });
    authorIdMap.set(a.author_id, ex?.id ?? (await prisma.author.create({ data: { name } })).id);
  }
  const publisherIdMap = new Map<number, string>();
  for (const p of dump.publishers) {
    if (!p.publisher_name) continue;
    const ex = await prisma.publisher.findFirst({ where: { name: p.publisher_name } });
    publisherIdMap.set(p.publisher_id, ex?.id ?? (await prisma.publisher.create({ data: { name: p.publisher_name } })).id);
  }
  const categoryIdMap = new Map<string, string>();
  for (const c of dump.categories) {
    if (!c.libelle_categorie) continue;
    const ex = await prisma.category.findFirst({ where: { name: c.libelle_categorie } });
    categoryIdMap.set(String(c.num_noeud), ex?.id ?? (await prisma.category.create({ data: { name: c.libelle_categorie } })).id);
  }
  const noticePubMap = new Map<number, number>();
  for (const pn of dump.publishers_notices) noticePubMap.set(pn.notice_id, pn.publisher_id);
  for (const n of dump.notices) { if (n.ed_editeur > 0) noticePubMap.set(n.notice_id, n.ed_editeur); }
  const noticeCatMap = new Map<number, string>();
  for (const nc of dump.notices_categories) {
    if (!noticeCatMap.has(nc.notice_id)) {
      const id = categoryIdMap.get(String(nc.num_noeud));
      if (id) noticeCatMap.set(nc.notice_id, id);
    }
  }
  const noticeAuthorsMap = new Map<number, { authorId: number; ordre: number; fonction: string }[]>();
  for (const an of dump.authors_notices) {
    const list = noticeAuthorsMap.get(an.notice_id) ?? [];
    list.push({ authorId: an.author_id, ordre: an.author_display_order, fonction: an.fonction });
    noticeAuthorsMap.set(an.notice_id, list);
  }

  let imported = 0;
  let errors   = 0;

  for (const group of duplicateGroups) {
    // Fix pmbNoticeId on the kept book to the best notice
    await prisma.$executeRawUnsafe(
      `UPDATE "Book" SET "pmbNoticeId" = $1 WHERE id = $2`,
      group.bestNoticeId, group.bookId,
    );

    // Import each collapsed notice as a new book
    for (const noticeId of group.collapsedNoticeIds) {
      const n = dump.notices.find((x) => x.notice_id === noticeId);
      if (!n) continue;

      try {
        const stripped    = stripIsbn(n.isbn ?? "");
        const isValidIsbn = stripped.length === 10 || stripped.length === 13;
        const isbn        = isValidIsbn ? (n.isbn?.trim() || null) : null;

        // Generate next barcode
        const lastRow = await prisma.$queryRawUnsafe<{ barcode: string }[]>(
          `SELECT barcode FROM "Book" WHERE barcode LIKE $1
           UNION SELECT barcode FROM "BookCopy" WHERE barcode LIKE $1
           ORDER BY barcode DESC LIMIT 1`, `${pfx}%`,
        );
        const lastNum    = lastRow[0]?.barcode ? (parseInt(lastRow[0].barcode.replace(pfx, "").split("-")[0], 10) || 0) : 0;
        const bookBarcode = `${pfx}${String(lastNum + 1).padStart(padding, "0")}`;

        const authList    = (noticeAuthorsMap.get(noticeId) ?? []).sort((a, b) => a.ordre - b.ordre);
        const primaryAuth = authList.find((a) => a.fonction === "AUT" || a.ordre === 0)?.authorId ?? authList[0]?.authorId;
        const authorId    = primaryAuth ? (authorIdMap.get(primaryAuth) ?? null) : null;
        const coAuthorIds = authList.filter((a) => a.authorId !== primaryAuth).map((a) => authorIdMap.get(a.authorId)).filter((id): id is string => !!id);
        const publisherId = noticePubMap.has(noticeId) ? (publisherIdMap.get(noticePubMap.get(noticeId)!) ?? null) : null;
        const categoryId  = noticeCatMap.get(noticeId) ?? null;
        const matType     = mapMaterialType(n.notice_type);

        const book = await prisma.book.create({
          data: {
            title:          n.titre,
            subtitle:       n.soustitre  || null,
            isbn,
            barcode:        bookBarcode,
            publishYear:    parseInt(n.annee, 10) || null,
            pages:          parseInt(n.npages, 10) || null,
            language:       mapLanguage(n.langue),
            materialType:   matType as Parameters<typeof prisma.book.create>[0]["data"]["materialType"],
            totalCopies:    0,
            availableCopies: 0,
            authorId,
            publisherId,
            categoryId,
            ...(coAuthorIds.length > 0 ? { coAuthors: { connect: coAuthorIds.map((id) => ({ id })) } } : {}),
          },
        });

        await prisma.$executeRawUnsafe(
          `UPDATE "Book" SET "callNumber" = $1, "pmbNoticeId" = $2 WHERE id = $3`,
          n.index_l || null, noticeId, book.id,
        );

        imported++;
      } catch (e) {
        console.error(`[fix-duplicates] notice ${noticeId}:`, e);
        errors++;
      }
    }
  }

  return NextResponse.json({
    groupsFixed: duplicateGroups.length,
    booksImported: imported,
    errors,
  });
}
