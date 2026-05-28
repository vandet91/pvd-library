import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { logActivity, actorFromSession, Actions } from "@/lib/activity-log";

/** GET /api/books/[id]/copies — copies with current borrower + basket membership */
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const copies = await prisma.bookCopy.findMany({
    where:   { bookId: id },
    orderBy: { copyNumber: "asc" },
    include: {
      branch: { select: { id: true, name: true } },
      // Only ACTIVE/OVERDUE loans (one per copy at most) — gives us the current borrower
      loans: {
        where:   { status: { in: ["ACTIVE", "OVERDUE"] } },
        select: {
          id: true,
          dueDate: true,
          status: true,
          member: { select: { id: true, memberId: true, name: true } },
        },
        orderBy: { borrowDate: "desc" },
        take: 1,
      },
      // Basket items that point directly at THIS copy (precise — copy-level link)
      basketItems: {
        select: {
          tagged: true,
          basket: { select: { id: true, name: true } },
        },
      },
    },
  });

  // All basket items are now copy-specific. Show the baskets each copy belongs to directly,
  // plus sibling-copy baskets (same book, different copy) so staff see the full title picture.
  const siblingBasketItems = await prisma.basketItem.findMany({
    where:  { bookId: id },
    select: { tagged: true, copyId: true, basket: { select: { id: true, name: true } } },
  });

  const result = copies.map((c) => {
    const directById = new Map(
      c.basketItems.map((bi) => [bi.basket.id, { id: bi.basket.id, name: bi.basket.name, tagged: bi.tagged, direct: true }])
    );
    const siblingBaskets = [
      ...new Map(
        siblingBasketItems
          .filter((bi) => !directById.has(bi.basket.id))
          .map((bi) => [bi.basket.id, { id: bi.basket.id, name: bi.basket.name, tagged: bi.tagged, direct: false }] as const)
      ).values(),
    ];

    return {
      ...c,
      currentLoan: c.loans[0] ?? null,
      baskets: [...directById.values(), ...siblingBaskets],
      loans:        undefined,
      basketItems:  undefined,
    };
  });

  return NextResponse.json(result);
}

/** POST /api/books/[id]/copies — add one or more copies (pass quantity for bulk).
 *  Auto-assigns sequential copyNumbers and barcodes.
 *  All copies land in STOCK. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: bookId } = await params;
  const body = await request.json().catch(() => ({}));

  // quantity: 1–50, default 1
  const quantity = Math.min(50, Math.max(1, Math.round(Number(body.quantity ?? 1))));

  const book = await prisma.book.findUnique({
    where:  { id: bookId },
    select: { id: true, title: true, barcode: true, isbn: true, referenceOnly: true, branchId: true },
  });
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  const copies = await prisma.$transaction(async (tx) => {
    const results = [];

    for (let i = 0; i < quantity; i++) {
      // Re-query inside the loop so each iteration sees the previous insert
      const last = await tx.bookCopy.findFirst({
        where:   { bookId },
        orderBy: { copyNumber: "desc" },
        select:  { copyNumber: true },
      });
      const nextNumber = (last?.copyNumber ?? 0) + 1;
      const pad         = String(nextNumber).padStart(3, "0");
      const autoBarcode = `${book.barcode ?? book.isbn ?? bookId.slice(-8)}-C${pad}`;

      const created = await tx.bookCopy.create({
        data: {
          bookId,
          copyNumber: nextNumber,
          // Custom barcode only honoured when adding a single copy
          barcode:   quantity === 1 ? (body.barcode || autoBarcode) : autoBarcode,
          rfid:      quantity === 1 ? (body.rfid    || null)        : null,
          condition: body.condition || "GOOD",
          status:    "STOCK",
          loanable:  body.loanable !== undefined ? !!body.loanable : !book.referenceOnly,
          price:     body.price  ? Number(body.price) : null,
          notes:     body.notes  || null,
          branchId:  null,
        },
      });

      // totalCopies +1 per copy; availableCopies NOT touched (copy is in stock, not on shelf)
      await tx.book.update({
        where: { id: bookId },
        data:  { totalCopies: { increment: 1 } },
      });

      await tx.stockMovement.create({
        data: {
          copyId:    created.id,
          bookId,
          type:      "RECEIVED",
          toStatus:  "STOCK",
          source:    body.source    || "PURCHASE",
          reference: body.reference || null,
          unitCost:  body.price     ? Number(body.price) : null,
          currency:  body.currency  || "USD",
          notes:     body.notes     || null,
          actorId:   session.user?.id   ?? null,
          actorName: session.user?.name ?? null,
        },
      });

      results.push(created);
    }

    return results;
  });

  await logActivity(actorFromSession(session), Actions.BOOK_COPY_ADDED, {
    entityType: "Book",
    entityId:   bookId,
    entityName: book.title,
    detail:     {
      quantity,
      firstCopyNumber: copies[0].copyNumber,
      lastCopyNumber:  copies[copies.length - 1].copyNumber,
      condition:       copies[0].condition,
    },
  });

  // Return array when bulk; single object when quantity=1 (backwards-compatible)
  return NextResponse.json(quantity === 1 ? copies[0] : copies, { status: 201 });
}
