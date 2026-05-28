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

/** POST /api/books/[id]/copies — add a new copy. Auto-assigns next copyNumber + barcode */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: bookId } = await params;
  const body = await request.json().catch(() => ({}));

  const book = await prisma.book.findUnique({
    where:  { id: bookId },
    select: { id: true, title: true, barcode: true, referenceOnly: true, branchId: true },
  });
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  // Find next copy number
  const last = await prisma.bookCopy.findFirst({
    where:   { bookId },
    orderBy: { copyNumber: "desc" },
    select:  { copyNumber: true },
  });
  const nextNumber = (last?.copyNumber ?? 0) + 1;
  const pad = String(nextNumber).padStart(3, "0");
  const autoBarcode = `${book.barcode ?? bookId.slice(-8)}-C${pad}`;

  const copy = await prisma.$transaction(async (tx) => {
    const created = await tx.bookCopy.create({
      data: {
        bookId,
        copyNumber: nextNumber,
        barcode:    body.barcode || autoBarcode,
        rfid:       body.rfid    || null,
        condition:  body.condition || "GOOD",
        status:     "AVAILABLE",
        // New copies inherit reference-only from the title (loanable=false if book is reference-only)
        loanable:   body.loanable !== undefined ? !!body.loanable : !book.referenceOnly,
        price:      body.price ? Number(body.price) : null,
        notes:      body.notes || null,
        // Inherit the book's home branch so copy location starts in sync
        ...(book.branchId && { branchId: book.branchId }),
      },
    });
    // Keep denormalized counters in sync
    await tx.book.update({
      where: { id: bookId },
      data:  { totalCopies: { increment: 1 }, availableCopies: { increment: 1 } },
    });
    return created;
  });

  await logActivity(actorFromSession(session), Actions.BOOK_COPY_ADDED, {
    entityType: "Book",
    entityId:   bookId,
    entityName: book.title,
    detail:     { copyNumber: copy.copyNumber, barcode: copy.barcode, condition: copy.condition },
  });

  return NextResponse.json(copy, { status: 201 });
}
