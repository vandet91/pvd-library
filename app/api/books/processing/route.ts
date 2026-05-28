import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";

/**
 * GET /api/books/processing
 * Returns three processing queues for admin staff:
 *
 *  1. needsLabel     — BookCopy where labelPrinted=false (primary queue — no basket required)
 *  2. needsLabelTotal — total count (the list is capped at 200)
 *  3. untagged       — BasketItem where tagged=false (basket-based batch workflow)
 *  4. noBarcode      — BookCopy with no barcode AND no RFID
 */
export async function GET() {
  const session = await auth();
  if (!session || !can(session.user?.role, "STAFF"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [needsLabel, needsLabelTotal, untagged, noBarcode] = await Promise.all([
    // Primary queue: every copy that hasn't had its spine label physically applied yet.
    // Newest acquisitions first. basketItems tells us if it's already in a processing basket.
    prisma.bookCopy.findMany({
      where:   { labelPrinted: false },
      include: {
        book: {
          select: {
            id: true, title: true, isbn: true,
            author: { select: { name: true } },
          },
        },
        basketItems: {
          select: {
            basketId: true,
            tagged:   true,
            basket:   { select: { id: true, name: true } },
          },
          take: 1, // show first basket if the copy belongs to multiple
        },
      },
      orderBy: { acquiredAt: "desc" },
      take:    200,
    }),

    prisma.bookCopy.count({ where: { labelPrinted: false } }),

    // Secondary queue: basket-based batch workflow.
    prisma.basketItem.findMany({
      where: { tagged: false },
      include: {
        basket: { select: { id: true, name: true } },
        book: {
          select: {
            id: true, title: true, isbn: true, location: true,
            author: { select: { name: true } },
          },
        },
        copy: {
          select: {
            id: true, copyNumber: true, barcode: true,
            rfid: true, condition: true, status: true,
            labelPrinted: true,
          },
        },
      },
      orderBy: [{ basketId: "asc" }, { addedAt: "asc" }],
    }),

    prisma.bookCopy.findMany({
      where:   { barcode: null, rfid: null },
      include: {
        book: {
          select: {
            id: true, title: true, isbn: true,
            author: { select: { name: true } },
          },
        },
      },
      orderBy: { acquiredAt: "desc" },
      take:    300,
    }),
  ]);

  return NextResponse.json({ needsLabel, needsLabelTotal, untagged, noBarcode });
}
