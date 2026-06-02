import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";

/**
 * POST /api/admin/migration/pmb/rollback-loans
 * Removes all loan-migrated copies (have pmbId set) and their loans.
 */
export async function POST() {
  const session = await auth();
  if (!session || !can(session.user?.role, "ADMIN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // First check what we'll be deleting
  const loanCopies = await prisma.$queryRawUnsafe<{ id: string; bookId: string; barcode: string | null; copyNumber: number; status: string }[]>(`
    SELECT id, "bookId", barcode, "copyNumber", status::text
    FROM "BookCopy"
    WHERE "pmbId" IS NOT NULL
  `);

  if (loanCopies.length === 0)
    return NextResponse.json({ message: "No loan-migrated copies found", loansDeleted: 0, copiesDeleted: 0, booksUpdated: 0 });

  // Count per book for totalCopies adjustment
  const bookCopyCount = new Map<string, number>();
  for (const c of loanCopies) {
    bookCopyCount.set(c.bookId, (bookCopyCount.get(c.bookId) ?? 0) + 1);
  }

  // Delete fines first (FK: Fine → Loan → BookCopy)
  await prisma.$executeRawUnsafe(`
    DELETE FROM "Fine"
    WHERE "loanId" IN (
      SELECT l.id FROM "Loan" l
      JOIN "BookCopy" c ON c.id = l."copyId"
      WHERE c."pmbId" IS NOT NULL
    )
  `);

  // Delete loans next
  const loansDeleted = await prisma.$executeRawUnsafe(`
    DELETE FROM "Loan"
    WHERE "copyId" IN (
      SELECT id FROM "BookCopy" WHERE "pmbId" IS NOT NULL
    )
  `);

  // Delete the copies
  const copiesDeleted = await prisma.$executeRawUnsafe(`
    DELETE FROM "BookCopy" WHERE "pmbId" IS NOT NULL
  `);

  // Fix totalCopies on each affected book
  for (const [bookId, count] of bookCopyCount.entries()) {
    await prisma.$executeRawUnsafe(`
      UPDATE "Book"
      SET "totalCopies" = GREATEST(0, "totalCopies" - $1)
      WHERE id = $2
    `, count, bookId);
  }

  return NextResponse.json({
    loansDeleted,
    copiesDeleted,
    booksUpdated: bookCopyCount.size,
  });
}

/**
 * GET /api/admin/migration/pmb/rollback-loans
 * Preview what will be deleted without actually deleting.
 */
export async function GET() {
  const session = await auth();
  if (!session || !can(session.user?.role, "ADMIN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const copies = await prisma.$queryRawUnsafe<{ id: string; barcode: string | null; copyNumber: number; status: string; pmbId: number }[]>(`
    SELECT id, barcode, "copyNumber", status::text, "pmbId"
    FROM "BookCopy"
    WHERE "pmbId" IS NOT NULL
    ORDER BY "copyNumber" DESC
    LIMIT 20
  `);

  const total = await prisma.$queryRawUnsafe<{ count: string }[]>(`
    SELECT COUNT(*)::text AS count FROM "BookCopy" WHERE "pmbId" IS NOT NULL
  `);

  const loans = await prisma.$queryRawUnsafe<{ count: string }[]>(`
    SELECT COUNT(*)::text AS count FROM "Loan"
    WHERE "copyId" IN (SELECT id FROM "BookCopy" WHERE "pmbId" IS NOT NULL)
  `);

  const fines = await prisma.$queryRawUnsafe<{ count: string }[]>(`
    SELECT COUNT(*)::text AS count FROM "Fine"
    WHERE "loanId" IN (
      SELECT l.id FROM "Loan" l
      JOIN "BookCopy" c ON c.id = l."copyId"
      WHERE c."pmbId" IS NOT NULL
    )
  `);

  return NextResponse.json({
    totalCopies: parseInt(total[0]?.count ?? "0", 10),
    totalLoans:  parseInt(loans[0]?.count ?? "0", 10),
    totalFines:  parseInt(fines[0]?.count ?? "0", 10),
    sample: copies,
  });
}
