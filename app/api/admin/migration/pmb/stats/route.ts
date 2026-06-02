import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";

/**
 * GET /api/admin/migration/pmb/stats
 * Quick stats snapshot for the migration dashboard.
 */
export async function GET() {
  const session = await auth();
  if (!session || !can(session.user?.role, "ADMIN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [
    books, booksWithPmbId, booksWithBarcode, booksWithCallNumber,
    copies, copiesAvailable, copiesBorrowed, copiesWithPmbId, copiesWithOrigBarcode,
    members, membersWithStudentId,
    loans, loansActive, loansOverdue,
  ] = await Promise.all([
    prisma.book.count(),
    prisma.$queryRawUnsafe<{c:string}[]>(`SELECT COUNT(*)::text AS c FROM "Book" WHERE "pmbNoticeId" IS NOT NULL`),
    prisma.$queryRawUnsafe<{c:string}[]>(`SELECT COUNT(*)::text AS c FROM "Book" WHERE barcode LIKE 'PVD-%'`),
    prisma.$queryRawUnsafe<{c:string}[]>(`SELECT COUNT(*)::text AS c FROM "Book" WHERE "callNumber" IS NOT NULL AND "callNumber" != ''`),

    prisma.bookCopy.count(),
    prisma.$queryRawUnsafe<{c:string}[]>(`SELECT COUNT(*)::text AS c FROM "BookCopy" WHERE status = 'AVAILABLE'`),
    prisma.$queryRawUnsafe<{c:string}[]>(`SELECT COUNT(*)::text AS c FROM "BookCopy" WHERE status = 'BORROWED'`),
    prisma.$queryRawUnsafe<{c:string}[]>(`SELECT COUNT(*)::text AS c FROM "BookCopy" WHERE "pmbId" IS NOT NULL`),
    prisma.$queryRawUnsafe<{c:string}[]>(`SELECT COUNT(*)::text AS c FROM "BookCopy" WHERE "pmbOriginalBarcode" IS NOT NULL`),

    prisma.member.count(),
    prisma.$queryRawUnsafe<{c:string}[]>(`SELECT COUNT(*)::text AS c FROM "Member" WHERE "studentId" IS NOT NULL AND "studentId" != ''`),

    prisma.loan.count(),
    prisma.$queryRawUnsafe<{c:string}[]>(`SELECT COUNT(*)::text AS c FROM "Loan" WHERE status = 'ACTIVE'`),
    prisma.$queryRawUnsafe<{c:string}[]>(`SELECT COUNT(*)::text AS c FROM "Loan" WHERE status = 'OVERDUE'`),
  ]);

  const n = (r: {c:string}[]) => parseInt(r[0]?.c ?? "0", 10);

  return NextResponse.json({
    books: {
      total:           books,
      withPmbNoticeId: n(booksWithPmbId),
      withPvdBarcode:  n(booksWithBarcode),
      withCallNumber:  n(booksWithCallNumber),
      missingPmbId:    books - n(booksWithPmbId),
    },
    copies: {
      total:            copies,
      available:        n(copiesAvailable),
      borrowed:         n(copiesBorrowed),
      withPmbId:        n(copiesWithPmbId),
      withOrigBarcode:  n(copiesWithOrigBarcode),
      missingPmbId:     copies - n(copiesWithPmbId),
    },
    members: {
      total:           members,
      withStudentId:   n(membersWithStudentId),
      missingStudentId: members - n(membersWithStudentId),
    },
    loans: {
      total:   loans,
      active:  n(loansActive),
      overdue: n(loansOverdue),
    },
  });
}
