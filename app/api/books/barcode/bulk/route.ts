import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getBarcodeSettings } from "@/lib/barcode";

/**
 * POST /api/books/barcode/bulk
 * Generate barcodes for ALL books that don't have one, in a single DB round-trip.
 * Returns { generated: number, skipped: number, results: { id, barcode }[] }
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const batchLimit: number | undefined = typeof body.limit === "number" && body.limit > 0 ? body.limit : undefined;

  const { prefix, padding } = await getBarcodeSettings();
  const prefixWithDash = `${prefix}-`;

  // Fetch books without a barcode (optionally limited) + find current highest barcode in one pass
  const [booksWithout, lastBook] = await Promise.all([
    prisma.book.findMany({
      where:  { barcode: null },
      select: { id: true },
      orderBy: { createdAt: "asc" },
      ...(batchLimit ? { take: batchLimit } : {}),
    }),
    prisma.book.findFirst({
      where:   { barcode: { startsWith: prefixWithDash } },
      orderBy: { barcode: "desc" },
      select:  { barcode: true },
    }),
  ]);

  if (booksWithout.length === 0)
    return NextResponse.json({ generated: 0, skipped: 0, results: [] });

  // Compute starting number
  let next = 1;
  if (lastBook?.barcode) {
    const num = parseInt(lastBook.barcode.replace(prefixWithDash, ""), 10);
    if (!isNaN(num)) next = num + 1;
  }

  // Assign sequential barcodes
  const assignments = booksWithout.map((book, i) => ({
    id:      book.id,
    barcode: `${prefixWithDash}${String(next + i).padStart(padding, "0")}`,
  }));

  // Batch update — one updateMany per unique barcode isn't feasible, so use $transaction
  // with individual updates but sent as a single batch (no per-request round-trips)
  await prisma.$transaction(
    assignments.map(({ id, barcode }) =>
      prisma.book.update({ where: { id }, data: { barcode } })
    ),
  );

  return NextResponse.json({
    generated: assignments.length,
    skipped:   0,
    results:   assignments,
  });
}
