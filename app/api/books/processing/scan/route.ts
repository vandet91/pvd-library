import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";

/**
 * POST /api/books/processing/scan
 *
 * Called when a staff member scans a barcode after applying the physical spine label.
 * Looks up the copy by barcode (or RFID), marks it as labelPrinted=true, and syncs
 * any related basket items (tagged=true).
 *
 * Body:  { barcode: string }
 * Returns:
 *   {
 *     copyId:         string
 *     copyNumber:     number
 *     barcode:        string | null
 *     alreadyLabeled: boolean      // true if it was already marked — still a success
 *     book: { id, title, author }
 *   }
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "STAFF"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({})) as { barcode?: string };
  const barcode = body.barcode?.trim();
  if (!barcode)
    return NextResponse.json({ error: "Barcode is required" }, { status: 400 });

  // Match by copy barcode or RFID tag
  const copy = await prisma.bookCopy.findFirst({
    where: { OR: [{ barcode }, { rfid: barcode }] },
    include: {
      book: {
        select: {
          id: true, title: true,
          author: { select: { name: true } },
        },
      },
      // Basket items that are still untagged — we'll sync them
      basketItems: {
        where:  { tagged: false },
        select: { id: true },
      },
    },
  });

  if (!copy) {
    return NextResponse.json({ error: `No copy found for barcode "${barcode}"` }, { status: 404 });
  }

  const alreadyLabeled = copy.labelPrinted;

  if (!alreadyLabeled) {
    // Atomically mark the copy and any basket items as done
    await prisma.$transaction([
      prisma.bookCopy.update({
        where: { id: copy.id },
        data:  { labelPrinted: true },
      }),
      ...(copy.basketItems.length > 0
        ? [prisma.basketItem.updateMany({
            where: { id: { in: copy.basketItems.map((bi) => bi.id) } },
            data:  { tagged: true },
          })]
        : []),
    ]);
  }

  return NextResponse.json({
    copyId:         copy.id,
    copyNumber:     copy.copyNumber,
    barcode:        copy.barcode,
    alreadyLabeled,
    book: {
      id:     copy.book.id,
      title:  copy.book.title,
      author: copy.book.author?.name ?? null,
    },
  });
}
