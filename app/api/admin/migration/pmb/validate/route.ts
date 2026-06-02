import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";

/**
 * GET /api/admin/migration/pmb/validate
 *
 * Runs a full integrity check on all migrated data.
 * Returns a report with counts and lists of broken records per check.
 */
export async function GET() {
  const session = await auth();
  if (!session || !can(session.user?.role, "ADMIN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [
    // ── Books ─────────────────────────────────────────────────────────────
    totalBooks,
    booksNoAuthor,
    booksNoCategory,
    booksNoBarcode,
    booksNoPvdBarcode,
    booksNoCallNumber,
    booksNoLanguage,
    booksBadLanguage,

    // ── Copies ────────────────────────────────────────────────────────────
    totalCopies,
    copiesNoBarcode,
    copiesNoPvdBarcode,
    copiesNoPmbId,
    copiesOrphan,           // copyId with no matching book
    copiesDupBarcode,       // duplicate barcodes

    // ── Members ───────────────────────────────────────────────────────────
    totalMembers,
    membersNoStudentId,

    // ── Loans ─────────────────────────────────────────────────────────────
    totalLoans,
    loansNoCopy,
    loansNoMember,
    loansNoBook,
    activeLoans,
    overdueLoans,

    // ── Cross-checks ──────────────────────────────────────────────────────
    copiesLoanedButNoLoan,  // status=BORROWED but no active loan record
    copiesAvailableButLoaned, // has active loan but status=AVAILABLE

  ] = await Promise.all([

    // ── Books ─────────────────────────────────────────────────────────────
    prisma.book.count(),

    prisma.$queryRawUnsafe<{ count: string; ids: string[] }[]>(`
      SELECT COUNT(*)::text AS count, ARRAY_AGG(id) AS ids
      FROM "Book" WHERE "authorId" IS NULL
    `),

    prisma.$queryRawUnsafe<{ count: string }[]>(`
      SELECT COUNT(*)::text AS count FROM "Book" WHERE "categoryId" IS NULL
    `),

    prisma.$queryRawUnsafe<{ count: string }[]>(`
      SELECT COUNT(*)::text AS count FROM "Book" WHERE barcode IS NULL
    `),

    prisma.$queryRawUnsafe<{ count: string }[]>(`
      SELECT COUNT(*)::text AS count FROM "Book"
      WHERE barcode IS NOT NULL AND barcode NOT LIKE 'PVD-%'
    `),

    prisma.$queryRawUnsafe<{ count: string }[]>(`
      SELECT COUNT(*)::text AS count FROM "Book"
      WHERE "callNumber" IS NULL OR "callNumber" = ''
    `),

    prisma.$queryRawUnsafe<{ count: string }[]>(`
      SELECT COUNT(*)::text AS count FROM "Book"
      WHERE language IS NULL OR language = ''
    `),

    prisma.$queryRawUnsafe<{ count: string; sample: string[] }[]>(`
      SELECT COUNT(*)::text AS count,
             ARRAY_AGG(DISTINCT language) FILTER (WHERE LENGTH(language) > 5) AS sample
      FROM "Book"
      WHERE language IS NOT NULL AND LENGTH(language) > 5
    `),

    // ── Copies ────────────────────────────────────────────────────────────
    prisma.bookCopy.count(),

    prisma.$queryRawUnsafe<{ count: string }[]>(`
      SELECT COUNT(*)::text AS count FROM "BookCopy" WHERE barcode IS NULL
    `),

    prisma.$queryRawUnsafe<{ count: string }[]>(`
      SELECT COUNT(*)::text AS count FROM "BookCopy"
      WHERE barcode IS NOT NULL AND barcode NOT LIKE 'PVD-%'
    `),

    prisma.$queryRawUnsafe<{ count: string }[]>(`
      SELECT COUNT(*)::text AS count FROM "BookCopy" WHERE "pmbId" IS NULL
    `),

    prisma.$queryRawUnsafe<{ count: string }[]>(`
      SELECT COUNT(*)::text AS count FROM "BookCopy" c
      WHERE NOT EXISTS (SELECT 1 FROM "Book" b WHERE b.id = c."bookId")
    `),

    prisma.$queryRawUnsafe<{ count: string; barcodes: string[] }[]>(`
      SELECT COUNT(*)::text AS count, ARRAY_AGG(barcode) AS barcodes
      FROM (
        SELECT barcode FROM "BookCopy"
        WHERE barcode IS NOT NULL
        GROUP BY barcode HAVING COUNT(*) > 1
      ) dups
    `),

    // ── Members ───────────────────────────────────────────────────────────
    prisma.member.count(),

    prisma.$queryRawUnsafe<{ count: string }[]>(`
      SELECT COUNT(*)::text AS count FROM "Member"
      WHERE "studentId" IS NULL OR "studentId" = ''
    `),

    // ── Loans ─────────────────────────────────────────────────────────────
    prisma.loan.count(),

    prisma.$queryRawUnsafe<{ count: string }[]>(`
      SELECT COUNT(*)::text AS count FROM "Loan" l
      WHERE NOT EXISTS (SELECT 1 FROM "BookCopy" c WHERE c.id = l."copyId")
    `),

    prisma.$queryRawUnsafe<{ count: string }[]>(`
      SELECT COUNT(*)::text AS count FROM "Loan" l
      WHERE NOT EXISTS (SELECT 1 FROM "Member" m WHERE m.id = l."memberId")
    `),

    prisma.$queryRawUnsafe<{ count: string }[]>(`
      SELECT COUNT(*)::text AS count FROM "Loan" l
      WHERE NOT EXISTS (SELECT 1 FROM "Book" b WHERE b.id = l."bookId")
    `),

    prisma.$queryRawUnsafe<{ count: string }[]>(`
      SELECT COUNT(*)::text AS count FROM "Loan" WHERE status = 'ACTIVE'
    `),

    prisma.$queryRawUnsafe<{ count: string }[]>(`
      SELECT COUNT(*)::text AS count FROM "Loan" WHERE status = 'OVERDUE'
    `),

    // ── Cross-checks ──────────────────────────────────────────────────────
    prisma.$queryRawUnsafe<{ count: string; barcodes: string[] }[]>(`
      SELECT COUNT(*)::text AS count, ARRAY_AGG(c.barcode) AS barcodes
      FROM "BookCopy" c
      WHERE c.status = 'BORROWED'
        AND NOT EXISTS (
          SELECT 1 FROM "Loan" l
          WHERE l."copyId" = c.id AND l.status IN ('ACTIVE','OVERDUE')
        )
    `),

    prisma.$queryRawUnsafe<{ count: string; barcodes: string[] }[]>(`
      SELECT COUNT(*)::text AS count, ARRAY_AGG(c.barcode) AS barcodes
      FROM "BookCopy" c
      WHERE c.status = 'AVAILABLE'
        AND EXISTS (
          SELECT 1 FROM "Loan" l
          WHERE l."copyId" = c.id AND l.status IN ('ACTIVE','OVERDUE')
        )
    `),
  ]);

  const num = (r: { count: string }[]) => parseInt(r[0]?.count ?? "0", 10);

  const checks = [
    // ── Books ──────────────────────────────────────────────────────────
    {
      group:   "Books",
      label:   "Total books",
      count:   totalBooks,
      status:  "info",
    },
    {
      group:   "Books",
      label:   "Books without an author",
      count:   num(booksNoAuthor),
      status:  num(booksNoAuthor) === 0 ? "ok" : "warn",
      detail:  booksNoAuthor[0]?.ids?.slice(0, 10),
    },
    {
      group:   "Books",
      label:   "Books without a category",
      count:   num(booksNoCategory),
      status:  num(booksNoCategory) === 0 ? "ok" : "warn",
    },
    {
      group:   "Books",
      label:   "Books without a barcode",
      count:   num(booksNoBarcode),
      status:  num(booksNoBarcode) === 0 ? "ok" : "error",
    },
    {
      group:   "Books",
      label:   "Books with non-PVD barcode",
      count:   num(booksNoPvdBarcode),
      status:  num(booksNoPvdBarcode) === 0 ? "ok" : "error",
    },
    {
      group:   "Books",
      label:   "Books without a call number",
      count:   num(booksNoCallNumber),
      status:  num(booksNoCallNumber) === 0 ? "ok" : "warn",
    },
    {
      group:   "Books",
      label:   "Books without a language",
      count:   num(booksNoLanguage),
      status:  num(booksNoLanguage) === 0 ? "ok" : "warn",
    },
    {
      group:   "Books",
      label:   "Books with corrupt language value (call number in language field)",
      count:   num(booksBadLanguage),
      status:  num(booksBadLanguage) === 0 ? "ok" : "error",
      detail:  booksBadLanguage[0]?.sample?.slice(0, 5),
    },

    // ── Copies ─────────────────────────────────────────────────────────
    {
      group:   "Copies",
      label:   "Total copies",
      count:   totalCopies,
      status:  "info",
    },
    {
      group:   "Copies",
      label:   "Copies without a barcode",
      count:   num(copiesNoBarcode),
      status:  num(copiesNoBarcode) === 0 ? "ok" : "error",
    },
    {
      group:   "Copies",
      label:   "Copies with non-PVD barcode (PMB barcodes not yet regenerated)",
      count:   num(copiesNoPvdBarcode),
      status:  num(copiesNoPvdBarcode) === 0 ? "ok" : "error",
    },
    {
      group:   "Copies",
      label:   "Copies without pmbId (backfill not run yet)",
      count:   num(copiesNoPmbId),
      status:  num(copiesNoPmbId) === 0 ? "ok" : "warn",
    },
    {
      group:   "Copies",
      label:   "Orphan copies (bookId points to missing book)",
      count:   num(copiesOrphan),
      status:  num(copiesOrphan) === 0 ? "ok" : "error",
    },
    {
      group:   "Copies",
      label:   "Duplicate barcodes across copies",
      count:   num(copiesDupBarcode),
      status:  num(copiesDupBarcode) === 0 ? "ok" : "error",
      detail:  copiesDupBarcode[0]?.barcodes?.slice(0, 10),
    },

    // ── Members ────────────────────────────────────────────────────────
    {
      group:   "Members",
      label:   "Total members",
      count:   totalMembers,
      status:  "info",
    },
    {
      group:   "Members",
      label:   "Members without studentId (loan matching may fail)",
      count:   num(membersNoStudentId),
      status:  num(membersNoStudentId) === 0 ? "ok" : "warn",
    },

    // ── Loans ──────────────────────────────────────────────────────────
    {
      group:   "Loans",
      label:   "Total loans",
      count:   totalLoans,
      status:  "info",
    },
    {
      group:   "Loans",
      label:   "Active loans",
      count:   num(activeLoans),
      status:  "info",
    },
    {
      group:   "Loans",
      label:   "Overdue loans",
      count:   num(overdueLoans),
      status:  num(overdueLoans) === 0 ? "ok" : "warn",
    },
    {
      group:   "Loans",
      label:   "Loans with missing copy",
      count:   num(loansNoCopy),
      status:  num(loansNoCopy) === 0 ? "ok" : "error",
    },
    {
      group:   "Loans",
      label:   "Loans with missing member",
      count:   num(loansNoMember),
      status:  num(loansNoMember) === 0 ? "ok" : "error",
    },
    {
      group:   "Loans",
      label:   "Loans with missing book",
      count:   num(loansNoBook),
      status:  num(loansNoBook) === 0 ? "ok" : "error",
    },

    // ── Cross-checks ───────────────────────────────────────────────────
    {
      group:   "Cross-checks",
      label:   "Copies marked BORROWED but no active loan record",
      count:   num(copiesLoanedButNoLoan),
      status:  num(copiesLoanedButNoLoan) === 0 ? "ok" : "error",
      detail:  copiesLoanedButNoLoan[0]?.barcodes?.slice(0, 10),
    },
    {
      group:   "Cross-checks",
      label:   "Copies marked AVAILABLE but have an active loan",
      count:   num(copiesAvailableButLoaned),
      status:  num(copiesAvailableButLoaned) === 0 ? "ok" : "error",
      detail:  copiesAvailableButLoaned[0]?.barcodes?.slice(0, 10),
    },
  ];

  const errors   = checks.filter((c) => c.status === "error").length;
  const warnings = checks.filter((c) => c.status === "warn").length;
  const passed   = checks.filter((c) => c.status === "ok").length;

  return NextResponse.json({
    summary: { errors, warnings, passed, total: checks.length },
    checks,
  });
}
