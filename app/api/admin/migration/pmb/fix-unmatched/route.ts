import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import {
  parsePmbDump, mapMaterialType, mapLanguage, mapMemberType,
} from "@/lib/pmb-parser";
import { stripIsbn } from "@/lib/isbn-format";
import { getBarcodeSettings } from "@/lib/barcode";
import { randomBytes } from "crypto";

function makeId() { return randomBytes(12).toString("hex"); }

function parseDate(s: string): Date | null {
  if (!s || s.startsWith("0000")) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
function addDays(date: Date, days: number): Date {
  const d = new Date(date); d.setDate(d.getDate() + days); return d;
}
function mapCondition(pmb: string): string {
  const s = (pmb ?? "").toUpperCase();
  if (s === "1" || s.includes("BON") || s.includes("GOOD"))  return "GOOD";
  if (s === "2" || s.includes("CORRECT") || s.includes("FAIR")) return "FAIR";
  if (s === "3" || s.includes("MAUV") || s.includes("POOR"))  return "POOR";
  if (s.includes("DAMAGED") || s.includes("ABIME"))           return "DAMAGED";
  return "GOOD";
}
function mapGender(sexe: number): string {
  if (sexe === 1) return "MALE";
  if (sexe === 2) return "FEMALE";
  return "UNSPECIFIED";
}

/**
 * POST /api/admin/migration/pmb/fix-unmatched
 *
 * Imports only the missing books (by noticeId) and missing members (by emprId)
 * from the PMB dump, then retries their loans.
 *
 * Body: {
 *   sql: string,
 *   missingNoticeIds: number[],
 *   missingEmprIds:   number[],
 * }
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "ADMIN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sql, missingNoticeIds = [], missingEmprIds = [] } =
    await req.json() as { sql: string; missingNoticeIds: number[]; missingEmprIds: number[] };

  if (!sql || sql.length < 100)
    return NextResponse.json({ error: "Invalid SQL dump" }, { status: 400 });

  const dump = parsePmbDump(sql);
  const { prefix, padding } = await getBarcodeSettings();
  const pfx = `${prefix}-`;

  const result = {
    booksImported:   0,
    membersImported: 0,
    loansCreated:    0,
    errors:          [] as string[],
  };

  // ── Build author / publisher / category maps ────────────────────────────
  const authorIdMap    = new Map<number, string>();
  const publisherIdMap = new Map<number, string>();
  const categoryIdMap  = new Map<string, string>();

  for (const a of dump.authors) {
    const name = [a.author_firstname, a.author_name].filter(Boolean).join(" ").trim() || "Unknown";
    const existing = await prisma.author.findFirst({ where: { name } });
    authorIdMap.set(a.author_id, existing?.id ?? (await prisma.author.create({ data: { name } })).id);
  }
  for (const p of dump.publishers) {
    if (!p.publisher_name) continue;
    const existing = await prisma.publisher.findFirst({ where: { name: p.publisher_name } });
    publisherIdMap.set(p.publisher_id, existing?.id ?? (await prisma.publisher.create({ data: { name: p.publisher_name } })).id);
  }
  for (const c of dump.categories) {
    if (!c.libelle_categorie) continue;
    const existing = await prisma.category.findFirst({ where: { name: c.libelle_categorie } });
    categoryIdMap.set(String(c.num_noeud), existing?.id ?? (await prisma.category.create({ data: { name: c.libelle_categorie } })).id);
  }

  const noticePubMap  = new Map<number, number>();
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

  // ── Import missing books ───────────────────────────────────────────────
  const noticeBookMap = new Map<number, string>(); // noticeId → bookId

  for (const noticeId of missingNoticeIds) {
    const n = dump.notices.find((x) => x.notice_id === noticeId);
    if (!n) { result.errors.push(`Notice ${noticeId} not found in dump`); continue; }

    // Check already exists
    const stripped = stripIsbn(n.isbn ?? "");
    const isValidIsbn = stripped.length === 10 || stripped.length === 13;
    const existing = isValidIsbn
      ? await prisma.book.findFirst({ where: { isbn: n.isbn?.trim() || undefined } })
      : await prisma.book.findFirst({ where: { title: n.titre } });

    if (existing) {
      noticeBookMap.set(noticeId, existing.id);
      // Stamp pmbNoticeId if missing
      await prisma.$executeRawUnsafe(
        `UPDATE "Book" SET "pmbNoticeId" = $1 WHERE id = $2 AND "pmbNoticeId" IS NULL`,
        noticeId, existing.id,
      );
      continue;
    }

    try {
      // Generate barcode
      const lastRow = await prisma.$queryRawUnsafe<{ barcode: string }[]>(
        `SELECT barcode FROM "Book" WHERE barcode LIKE $1
         UNION SELECT barcode FROM "BookCopy" WHERE barcode LIKE $1
         ORDER BY barcode DESC LIMIT 1`, `${pfx}%`,
      );
      const lastNum    = lastRow[0]?.barcode ? (parseInt(lastRow[0].barcode.replace(pfx, "").split("-")[0], 10) || 0) : 0;
      const bookBarcode = `${pfx}${String(lastNum + 1).padStart(padding, "0")}`;

      const authList    = (noticeAuthorsMap.get(noticeId) ?? []).sort((a, b) => a.ordre - b.ordre);
      const primaryAuth = authList.find((a) => a.fonction === "AUT" || a.ordre === 0)?.authorId ?? authList[0]?.authorId;
      const coAuthorIds = authList.filter((a) => a.authorId !== primaryAuth).map((a) => authorIdMap.get(a.authorId)).filter((id): id is string => !!id);
      const authorId    = primaryAuth ? (authorIdMap.get(primaryAuth) ?? null) : null;
      const publisherId = noticePubMap.has(noticeId) ? (publisherIdMap.get(noticePubMap.get(noticeId)!) ?? null) : null;
      const categoryId  = noticeCatMap.get(noticeId) ?? null;
      const matType     = mapMaterialType(n.notice_type);

      const book = await prisma.book.create({
        data: {
          title:          n.titre,
          subtitle:       n.soustitre  || null,
          isbn:           isValidIsbn ? (n.isbn?.trim() || null) : null,
          barcode:        bookBarcode,
          publishYear:    parseInt(n.annee, 10)  || null,
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

      noticeBookMap.set(noticeId, book.id);
      result.booksImported++;
    } catch (e) {
      result.errors.push(`Book notice ${noticeId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ── Import missing members ─────────────────────────────────────────────
  const emprMemberMap = new Map<number, string>(); // emprId → memberId

  for (const emprId of missingEmprIds) {
    const e = dump.empr.find((x) => x.empr_id === emprId);
    if (!e) { result.errors.push(`Empr ${emprId} not found in dump`); continue; }

    const fullName = [e.empr_prenom, e.empr_nom].filter(Boolean).join(" ").trim();
    if (!fullName) { result.errors.push(`Empr ${emprId} has no name`); continue; }

    const cb      = e.empr_cb?.trim() || null;
    const pmbKey  = `PMB-${e.empr_id}`;
    const memberId = cb ?? pmbKey;

    // Check already exists
    const existing = await prisma.member.findFirst({
      where: { OR: [{ memberId: cb ?? "" }, { memberId: pmbKey }, { name: fullName }] },
    });
    if (existing) {
      emprMemberMap.set(emprId, existing.id);
      continue;
    }

    try {
      const joinDate   = parseDate(e.empr_date_adhesion) ?? new Date();
      const expireDate = parseDate(e.date_expiration_abonnement) ?? null;
      const member = await prisma.member.create({
        data: {
          memberId,
          name:       fullName,
          phone:      e.empr_tel || null,
          studentId:  cb,
          memberType: mapMemberType(e.empr_categ) as Parameters<typeof prisma.member.create>[0]["data"]["memberType"],
          gender:     mapGender(e.empr_sexe) as Parameters<typeof prisma.member.create>[0]["data"]["gender"],
          school:     e.school    || null,
          className:  e.className || null,
          joinDate,
          expireDate,
          isActive:   expireDate ? expireDate > new Date() : true,
        },
      });
      emprMemberMap.set(emprId, member.id);
      result.membersImported++;
    } catch (e2) {
      result.errors.push(`Member empr ${emprId}: ${e2 instanceof Error ? e2.message : String(e2)}`);
    }
  }

  // ── Retry loans for newly imported books/members ───────────────────────
  // Also reload existing matches for any already-existing book/member
  const memberByStudentId = new Map<string, string>();
  const memberByMemberId  = new Map<string, string>();
  const allMembers = await prisma.member.findMany({ select: { id: true, memberId: true, studentId: true } });
  for (const m of allMembers) {
    if (m.studentId) memberByStudentId.set(m.studentId.trim(), m.id);
    memberByMemberId.set(m.memberId, m.id);
  }

  const bookRows = await prisma.$queryRawUnsafe<{ id: string; barcode: string | null; pmbNoticeId: number }[]>(
    `SELECT id, barcode, "pmbNoticeId" FROM "Book" WHERE "pmbNoticeId" = ANY($1::int[])`,
    missingNoticeIds,
  );
  for (const b of bookRows) noticeBookMap.set(b.pmbNoticeId, b.id);

  const maxCopyRows = await prisma.$queryRawUnsafe<{ bookId: string; maxCopy: number }[]>(
    `SELECT "bookId", MAX("copyNumber") AS "maxCopy" FROM "BookCopy"
     WHERE "bookId" = ANY($1::text[])
     GROUP BY "bookId"`,
    [...noticeBookMap.values()],
  );
  const maxCopyByBook    = new Map(maxCopyRows.map((r) => [r.bookId, Number(r.maxCopy)]));
  const loanCounterByBook = new Map<string, number>();

  const activeLoans = dump.pret;

  for (const p of activeLoans) {
    const noticeId = p.notice_id > 0
      ? p.notice_id
      : dump.exemplaires.find((e) => e.exemplaire_id === p.expl_id)?.notice_id ?? -1;

    const book = noticeBookMap.get(noticeId);
    if (!book) continue; // not one of the ones we just imported

    const empr    = dump.empr.find((e) => e.empr_id === p.empr_id);
    const cb      = empr?.empr_cb?.trim() || null;
    const pmbKey  = `PMB-${p.empr_id}`;
    const memberId =
      (cb && memberByStudentId.get(cb)) ||
      (cb && memberByMemberId.get(cb))  ||
      memberByMemberId.get(pmbKey)      ||
      emprMemberMap.get(p.empr_id);
    if (!memberId) continue;

    // Skip if loan already exists
    const existing = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT l.id FROM "Loan" l
       JOIN "BookCopy" c ON c.id = l."copyId"
       WHERE c."pmbId" = $1 AND l."memberId" = $2 LIMIT 1`,
      p.expl_id, memberId,
    );
    if (existing.length > 0) continue;

    const baseMax    = maxCopyByBook.get(book) ?? 0;
    const loanCount  = (loanCounterByBook.get(book) ?? 0) + 1;
    loanCounterByBook.set(book, loanCount);
    const copyNumber = baseMax + loanCount;

    const bookRow   = await prisma.$queryRawUnsafe<{ barcode: string | null }[]>(`SELECT barcode FROM "Book" WHERE id = $1`, book);
    const lPad      = String(loanCount).padStart(3, "0");
    const copyBarcode = bookRow[0]?.barcode ? `${bookRow[0].barcode}-C${lPad}` : null;
    const origBarcode = dump.exemplaires.find((e) => e.exemplaire_id === p.expl_id)?.cb?.trim() || null;
    const loanDate  = parseDate(p.pret_date)  ?? new Date();
    const dueDate   = parseDate(p.pret_retour) ?? addDays(loanDate, 14);
    const isOverdue = dueDate < new Date();

    try {
      const copyId = makeId();
      await prisma.$executeRawUnsafe(`
        INSERT INTO "BookCopy" (
          id, "bookId", "copyNumber", barcode, status, condition,
          "labelPrinted", "pmbId", "pmbOriginalBarcode",
          "loanable", "acquiredAt", "createdAt", "updatedAt"
        ) VALUES ($1,$2,$3,$4,'BORROWED'::"CopyStatus",'GOOD'::"BookCondition",true,$5,$6,true,NOW(),NOW(),NOW())`,
        copyId, book, copyNumber, copyBarcode, p.expl_id, origBarcode,
      );

      const loanId = makeId();
      await prisma.$executeRawUnsafe(`
        INSERT INTO "Loan" (id,"memberId","bookId","copyId","borrowDate","dueDate",status,"renewalCount","createdAt","updatedAt")
        VALUES ($1,$2,$3,$4,$5,$6,$7::"LoanStatus",0,NOW(),NOW())`,
        loanId, memberId, book, copyId, loanDate, dueDate, isOverdue ? "OVERDUE" : "ACTIVE",
      );

      await prisma.$executeRawUnsafe(
        `UPDATE "Book" SET "totalCopies" = "totalCopies" + 1 WHERE id = $1`, book,
      );

      result.loansCreated++;
    } catch (e2) {
      result.errors.push(`Loan retry pret ${p.pret_id}: ${e2 instanceof Error ? e2.message : String(e2)}`);
    }
  }

  return NextResponse.json(result);
}
