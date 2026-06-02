import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";

/**
 * GET /api/admin/migration/pmb/lookup?barcode=R20140516165623
 *
 * Looks up a copy by its original PMB barcode (pmbOriginalBarcode).
 * Used when a member returns a book that still has the old PMB label.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "STAFF"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const barcode = req.nextUrl.searchParams.get("barcode")?.trim();
  if (!barcode) return NextResponse.json({ error: "barcode is required" }, { status: 400 });

  const baseSelect = `
    SELECT
      c.id            AS "copyId",
      c.barcode       AS "newBarcode",
      c."copyNumber",
      c.status,
      b.id            AS "bookId",
      b.title,
      b.barcode       AS "bookBarcode",
      b."pmbNoticeId",
      c."pmbId",
      c."pmbOriginalBarcode",
      m.name          AS "memberName",
      m."memberId",
      l."dueDate"::text
    FROM "BookCopy" c
    JOIN "Book" b ON b.id = c."bookId"
    LEFT JOIN "Loan" l ON l."copyId" = c.id AND l.status IN ('ACTIVE','OVERDUE')
    LEFT JOIN "Member" m ON m.id = l."memberId"
  `;

  type Row = {
    copyId: string; newBarcode: string | null; copyNumber: number; status: string;
    bookId: string; title: string; bookBarcode: string | null;
    pmbNoticeId: number | null; pmbId: number | null; pmbOriginalBarcode: string | null;
    memberName: string | null; memberId: string | null; dueDate: string | null;
  };

  // Try multiple search strategies in order
  let rows: Row[] = [];
  const numericId = /^\d+$/.test(barcode) ? parseInt(barcode, 10) : null;

  // 1. Original PMB barcode (expl_cb stored during migration)
  rows = await prisma.$queryRawUnsafe<Row[]>(`${baseSelect} WHERE c."pmbOriginalBarcode" = $1 LIMIT 1`, barcode);

  // 2. New PVD copy barcode
  if (!rows.length)
    rows = await prisma.$queryRawUnsafe<Row[]>(`${baseSelect} WHERE c.barcode = $1 LIMIT 1`, barcode);

  // 3. PMB exemplaire_id (numeric — the number printed/stamped on old copies)
  if (!rows.length && numericId)
    rows = await prisma.$queryRawUnsafe<Row[]>(`${baseSelect} WHERE c."pmbId" = $1 LIMIT 1`, numericId);

  // 4. PMB notice_id → return first copy of that book
  if (!rows.length && numericId)
    rows = await prisma.$queryRawUnsafe<Row[]>(`${baseSelect} WHERE b."pmbNoticeId" = $1 LIMIT 1`, numericId);

  // 5. Book barcode
  if (!rows.length)
    rows = await prisma.$queryRawUnsafe<Row[]>(`${baseSelect} WHERE b.barcode = $1 LIMIT 1`, barcode);

  if (!rows.length)
    return NextResponse.json({ found: false, barcode });

  const r = rows[0];
  return NextResponse.json({
    found:        true,
    oldBarcode:   barcode,
    newBarcode:   r.newBarcode,
    copyNumber:   Number(r.copyNumber),
    status:       r.status,
    pmbId:        r.pmbId ? Number(r.pmbId) : null,
    pmbNoticeId:  r.pmbNoticeId ? Number(r.pmbNoticeId) : null,
    book: {
      id:      r.bookId,
      title:   r.title,
      barcode: r.bookBarcode,
    },
    loan: r.memberName ? {
      memberName: r.memberName,
      memberId:   r.memberId,
      dueDate:    r.dueDate,
    } : null,
  });
}
