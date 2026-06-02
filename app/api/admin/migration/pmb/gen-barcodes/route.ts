import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";

/**
 * POST /api/admin/migration/pmb/gen-barcodes
 *
 * Assigns PVD-format barcodes to BookCopy records that still have
 * PMB-style barcodes (or no barcode at all).
 *
 * Copy barcode format matches the existing system convention:
 *   copyNumber = 1  →  same as book barcode     e.g. PVD-000123
 *   copyNumber = 2  →  bookBarcode + "-C002"    e.g. PVD-000123-C002
 *   copyNumber = 3  →  bookBarcode + "-C003"    e.g. PVD-000123-C003
 *
 * The book must already have a PVD barcode. Books without one are skipped.
 * Safe to run multiple times — copies already in the correct format are skipped.
 */
export async function POST() {
  const session = await auth();
  if (!session || !can(session.user?.role, "ADMIN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Find the configured prefix from settings
  const prefixRow = await prisma.settings.findFirst({ where: { key: "BARCODE_PREFIX" } });
  const prefix = ((prefixRow?.value ?? "PVD").trim().toUpperCase() || "PVD") + "-";

  // Load all copies that need a new barcode (no barcode OR non-PVD barcode)
  // along with their book's barcode and copyNumber
  const copies = await prisma.$queryRawUnsafe<{
    id: string;
    copyNumber: number;
    barcode: string | null;
    bookBarcode: string | null;
  }[]>(`
    SELECT c.id, c."copyNumber", c.barcode, b.barcode AS "bookBarcode"
    FROM "BookCopy" c
    JOIN "Book" b ON b.id = c."bookId"
    WHERE (c.barcode IS NULL OR c.barcode NOT LIKE $1)
      AND b.barcode LIKE $1
    ORDER BY b.barcode, c."copyNumber"
  `, `${prefix}%`);

  if (copies.length === 0)
    return NextResponse.json({ updated: 0, skipped: 0, message: "All copy barcodes already in correct format" });

  let updated = 0;
  let skipped = 0;

  for (const copy of copies) {
    if (!copy.bookBarcode) { skipped++; continue; }

    const pad = String(copy.copyNumber).padStart(3, "0");
    const newBarcode = copy.copyNumber === 1
      ? copy.bookBarcode                        // copy 1 = book barcode
      : `${copy.bookBarcode}-C${pad}`;          // copy 2+ = PVD-000123-C002

    // Check for barcode collision
    const conflict = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM "BookCopy" WHERE barcode = $1 AND id != $2 LIMIT 1`,
      newBarcode, copy.id,
    );
    if (conflict.length > 0) { skipped++; continue; }

    await prisma.$executeRawUnsafe(
      `UPDATE "BookCopy" SET barcode = $1 WHERE id = $2`,
      newBarcode, copy.id,
    );
    updated++;
  }

  return NextResponse.json({ updated, skipped });
}
