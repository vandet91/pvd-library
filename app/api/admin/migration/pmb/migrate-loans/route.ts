import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { parsePmbDump } from "@/lib/pmb-parser";
import { randomBytes } from "crypto";
function makeId() { return randomBytes(12).toString("hex"); }

/**
 * POST /api/admin/migration/pmb/migrate-loans
 *
 * For each active loan in PMB `pret`:
 *   1. Find the Book via pmbNoticeId on Book
 *   2. Find the Member via studentId = empr_cb → memberId = empr_cb → PMB-{id}
 *   3. Create a NEW BookCopy on that book with:
 *        - High copy number (existing max + 100) to distinguish from physical shelf copies
 *        - Barcode: {bookBarcode}-C{copyNum padded} e.g. PVD-000123-C001
 *        - pmbId = exemplaire_id
 *        - pmbOriginalBarcode = expl_cb (old label barcode for lookup when member returns)
 *        - status = BORROWED
 *   4. Create a Loan record
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

  // pret table only stores active loans — all records are unreturned
  const activeLoans = dump.pret;

  if (activeLoans.length === 0)
    return NextResponse.json({ created: 0, skipped: 0, noMember: 0, noBook: 0, message: "No active loans found in dump" });

  // ── Load books indexed by pmbNoticeId, ISBN, and normalised title ──
  const bookRows = await prisma.$queryRawUnsafe<{
    id: string; barcode: string | null; pmbNoticeId: number | null; isbn: string | null; title: string;
  }[]>(`SELECT id, barcode, "pmbNoticeId", isbn, title FROM "Book"`);

  const bookByNoticeId = new Map<number, typeof bookRows[0]>();
  const bookByIsbn     = new Map<string, typeof bookRows[0]>();
  const bookByTitle    = new Map<string, typeof bookRows[0]>();
  for (const b of bookRows) {
    if (b.pmbNoticeId) bookByNoticeId.set(b.pmbNoticeId, b);
    if (b.isbn) bookByIsbn.set(b.isbn.replace(/[^0-9X]/gi, ""), b);
    bookByTitle.set(b.title.toLowerCase().trim().replace(/\s+/g, " "), b);
  }

  // ── Load members indexed by studentId and memberId ──
  const members = await prisma.member.findMany({
    select: { id: true, memberId: true, studentId: true },
  });
  const memberByStudentId = new Map<string, string>();
  const memberByMemberId  = new Map<string, string>();
  for (const m of members) {
    if (m.studentId) memberByStudentId.set(m.studentId.trim(), m.id);
    memberByMemberId.set(m.memberId, m.id);
  }

  // Build empr_id → member.id from dump
  const emprToMember = new Map<number, string>();
  for (const e of dump.empr) {
    const cb     = e.empr_cb?.trim() || null;
    const pmbKey = `PMB-${e.empr_id}`;
    const mId    = (cb && memberByStudentId.get(cb))
                || (cb && memberByMemberId.get(cb))
                || memberByMemberId.get(pmbKey);
    if (mId) emprToMember.set(e.empr_id, mId);
  }


  const result: {
    created: number; skipped: number; noMember: number; noBook: number; lastError?: string;
    unmatched: {
      noBook:   { pret_id: number; expl_id: number; noticeId: number; noticeTitle: string }[];
      noMember: { pret_id: number; empr_id: number; emprCb: string | null; emprName: string }[];
      errors:   { pret_id: number; error: string }[];
    };
  } = {
    created: 0, skipped: 0, noMember: 0, noBook: 0,
    unmatched: { noBook: [], noMember: [], errors: [] },
  };

  for (const p of activeLoans) {
    // Find book — use notice_id directly from pret_archive, fallback to exemplaires lookup
    const noticeId = p.notice_id > 0
      ? p.notice_id
      : dump.exemplaires.find((e) => e.exemplaire_id === p.expl_id)?.notice_id ?? -1;

    const notice = dump.notices.find((n) => n.notice_id === noticeId);
    const book =
      bookByNoticeId.get(noticeId) ??
      (notice?.isbn ? bookByIsbn.get(notice.isbn.replace(/[^0-9X]/gi, "")) : undefined) ??
      (notice?.titre ? bookByTitle.get(notice.titre.toLowerCase().trim().replace(/\s+/g, " ")) : undefined);

    if (!book) {
      result.noBook++;
      result.unmatched.noBook.push({
        pret_id:     p.pret_id,
        expl_id:     p.expl_id,
        noticeId,
        noticeTitle: notice?.titre ?? "(unknown)",
      });
      continue;
    }

    // Find member
    const memberId = emprToMember.get(p.empr_id);
    if (!memberId) {
      result.noMember++;
      const empr = dump.empr.find((e) => e.empr_id === p.empr_id);
      result.unmatched.noMember.push({
        pret_id:  p.pret_id,
        empr_id:  p.empr_id,
        emprCb:   empr?.empr_cb?.trim() || null,
        emprName: empr ? [empr.empr_nom, empr.empr_prenom].filter(Boolean).join(" ") : "(unknown)",
      });
      continue;
    }

    // Check if a copy with this pmbId already exists (imported before loan filter was fixed)
    const existingCopy = await prisma.$queryRawUnsafe<{ id: string; status: string }[]>(
      `SELECT id, status FROM "BookCopy" WHERE "pmbId" = $1 LIMIT 1`,
      p.expl_id,
    );

    // Copy already exists — reuse it, never create a new one
    if (existingCopy.length > 0) {
      const copyId = existingCopy[0].id;

      // Already BORROWED with an active loan → fully migrated, skip
      if (existingCopy[0].status === "BORROWED") {
        const existingLoan = await prisma.$queryRawUnsafe<{ id: string }[]>(
          `SELECT id FROM "Loan" WHERE "copyId" = $1 AND status IN ('ACTIVE','OVERDUE') LIMIT 1`,
          copyId,
        );
        if (existingLoan.length > 0) { result.skipped++; continue; }
      }

      // Copy exists (AVAILABLE or BORROWED with no loan yet) — mark BORROWED and create loan
      const loanDate  = parseDate(p.pret_date)  ?? new Date();
      const dueDate   = parseDate(p.pret_retour) ?? addDays(loanDate, 14);
      const isOverdue = dueDate < new Date();
      try {
        await prisma.$executeRawUnsafe(
          `UPDATE "BookCopy" SET status = 'BORROWED'::"CopyStatus", "updatedAt" = NOW() WHERE id = $1`, copyId,
        );
        const loanId = makeId();
        await prisma.$executeRawUnsafe(`
          INSERT INTO "Loan" (id,"memberId","bookId","copyId","borrowDate","dueDate",status,"renewalCount","createdAt","updatedAt")
          VALUES ($1,$2,$3,$4,$5,$6,$7::"LoanStatus",0,NOW(),NOW())`,
          loanId, memberId, book.id, copyId, loanDate, dueDate, isOverdue ? "OVERDUE" : "ACTIVE",
        );
        result.created++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.skipped++;
        if (!result.lastError) result.lastError = msg;
        result.unmatched.errors.push({ pret_id: p.pret_id, error: msg });
      }
      continue;
    }

    // No copy found by pmbId — fall back to any AVAILABLE copy of this book
    const fallbackCopy = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM "BookCopy" WHERE "bookId" = $1 AND status = 'AVAILABLE'
       ORDER BY "copyNumber" DESC LIMIT 1`, book.id,
    );

    if (fallbackCopy.length === 0) {
      // No available copy to assign — log and skip
      result.noBook++;
      result.unmatched.noBook.push({
        pret_id: p.pret_id, expl_id: p.expl_id,
        noticeId, noticeTitle: notice?.titre ?? "(unknown)",
      });
      continue;
    }

    const copyId    = fallbackCopy[0].id;
    const origBarcode = dump.exemplaires.find((e) => e.exemplaire_id === p.expl_id)?.cb?.trim() || null;
    const loanDate  = parseDate(p.pret_date)  ?? new Date();
    const dueDate   = parseDate(p.pret_retour) ?? addDays(loanDate, 14);
    const isOverdue = dueDate < new Date();

    try {
      // Stamp pmbId on the copy so future runs recognise it, mark BORROWED
      await prisma.$executeRawUnsafe(
        `UPDATE "BookCopy"
         SET status = 'BORROWED'::"CopyStatus", "pmbId" = $1, "pmbOriginalBarcode" = $2, "updatedAt" = NOW()
         WHERE id = $3`,
        p.expl_id, origBarcode, copyId,
      );
      const loanId = makeId();
      await prisma.$executeRawUnsafe(`
        INSERT INTO "Loan" (id,"memberId","bookId","copyId","borrowDate","dueDate",status,"renewalCount","createdAt","updatedAt")
        VALUES ($1,$2,$3,$4,$5,$6,$7::"LoanStatus",0,NOW(),NOW())`,
        loanId, memberId, book.id, copyId, loanDate, dueDate, isOverdue ? "OVERDUE" : "ACTIVE",
      );
      result.created++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[PMB loans] pret ${p.pret_id} expl=${p.expl_id} empr=${p.empr_id}:`, msg);
      result.skipped++;
      if (!result.lastError) result.lastError = msg;
      result.unmatched.errors.push({ pret_id: p.pret_id, error: msg });
    }
  }

  return NextResponse.json(result);
}

function parseDate(s: string): Date | null {
  if (!s || s.startsWith("0000")) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
