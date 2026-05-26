import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { generateBarcode } from "@/lib/barcode";
import { can } from "@/lib/rbac";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/books/[id]/barcode
 * Generate and assign a PVD barcode to a book that doesn't have one.
 * Idempotent — returns the existing barcode if already assigned.
 */
export async function POST(_req: NextRequest, { params }: Ctx) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const book = await prisma.book.findUnique({
    where:  { id },
    select: { id: true, barcode: true },
  });
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  /* Already has a barcode — return it */
  if (book.barcode) return NextResponse.json({ barcode: book.barcode });

  /* Generate and save — retry once on unique collision */
  let barcode: string;
  try {
    barcode = await generateBarcode();
  } catch (err) {
    console.error("[barcode] generateBarcode error:", err);
    return NextResponse.json({ error: "Failed to compute next barcode" }, { status: 500 });
  }

  try {
    const updated = await prisma.book.update({
      where: { id },
      data:  { barcode },
      select: { id: true, barcode: true },
    });
    return NextResponse.json({ barcode: updated.barcode }, { status: 201 });
  } catch (err: unknown) {
    // Unique constraint violation (P2002) — another barcode with same value already exists
    const code = (err as { code?: string })?.code;
    if (code === "P2002") {
      // Re-generate to skip the collision
      try {
        barcode = await generateBarcode();
        const updated = await prisma.book.update({
          where: { id },
          data:  { barcode },
          select: { id: true, barcode: true },
        });
        return NextResponse.json({ barcode: updated.barcode }, { status: 201 });
      } catch (err2) {
        console.error("[barcode] retry failed:", err2);
        return NextResponse.json({ error: "Barcode collision — please try again" }, { status: 409 });
      }
    }
    console.error("[barcode] update error:", err);
    return NextResponse.json({ error: "Failed to save barcode" }, { status: 500 });
  }
}

/**
 * GET /api/books/[id]/barcode
 * Return the current barcode value for a book.
 */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const book = await prisma.book.findUnique({
    where:  { id },
    select: { barcode: true },
  });
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ barcode: book.barcode });
}
