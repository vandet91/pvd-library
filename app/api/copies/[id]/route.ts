import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { z } from "zod";
import { logActivity, actorFromSession, Actions } from "@/lib/activity-log";

const updateSchema = z.object({
  barcode:      z.string().optional(),
  rfid:         z.string().optional().nullable(),
  condition:    z.enum(["EXCELLENT", "GOOD", "FAIR", "POOR", "DAMAGED", "LOST", "WITHDRAWN", "ARCHIVED"]).optional(),
  status:       z.enum(["STOCK", "AVAILABLE", "FOR_SALE", "BORROWED", "RESERVED", "SOLD", "LOST", "DAMAGED", "WITHDRAWN"]).optional(),
  loanable:     z.boolean().optional(),
  price:        z.number().nullable().optional(),
  notes:        z.string().optional().nullable(),
  branchId:     z.string().optional().nullable(),
  labelPrinted: z.boolean().optional(), // true once spine label has been physically applied
});

/** PATCH /api/copies/[id] — update a single copy.
 *  - STAFF may update labelPrinted only (physical label-application step).
 *  - All other fields (barcode, status, condition, etc.) require LIBRARIAN.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !can(session.user?.role, "STAFF"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((e) => e.message).join(", ") }, { status: 400 });

  // STAFF may only toggle labelPrinted — any other field requires LIBRARIAN
  const fields = Object.keys(parsed.data);
  const isLabelOnlyUpdate = fields.length === 1 && fields[0] === "labelPrinted";
  if (!isLabelOnlyUpdate && !can(session.user?.role, "LIBRARIAN")) {
    return NextResponse.json(
      { error: "Updating barcode, status, condition and other copy fields requires Librarian access." },
      { status: 403 },
    );
  }

  // Need previous state to sync availableCopies and to produce a diff in the activity log
  const before = await prisma.bookCopy.findUnique({
    where:  { id },
    select: {
      status: true, bookId: true, barcode: true, condition: true, copyNumber: true,
      book: { select: { title: true } },
    },
  });
  if (!before) return NextResponse.json({ error: "Copy not found" }, { status: 404 });

  // ── Guard: BORROWED / RESERVED / SOLD are flow-driven — block manual transitions ──
  const FLOW_ONLY = ["BORROWED", "RESERVED", "SOLD"] as const;
  if (parsed.data.status && (FLOW_ONLY as readonly string[]).includes(parsed.data.status)) {
    return NextResponse.json(
      {
        error: `"${parsed.data.status}" can only be set through its proper flow (loan / reservation / sale order) — not by manual edit.`,
      },
      { status: 400 },
    );
  }

  // ── Guard: if copy is in a sale cart and status is leaving FOR_SALE, remove it ──
  const cartItemToRemove =
    before.status === "FOR_SALE" &&
    parsed.data.status &&
    parsed.data.status !== "FOR_SALE"
      ? await prisma.saleCartItem.findUnique({ where: { copyId: id }, select: { id: true } })
      : null;

  // If the copy was holding a reservation (READY), find that reservation up-front
  // so we can release it inside the same transaction when the librarian frees the copy.
  const heldReservation = before.status === "RESERVED"
    ? await prisma.reservation.findFirst({
        where:  { copyId: id, status: "READY" },
        select: { id: true, memberId: true, book: { select: { title: true } } },
      })
    : null;

  const result = await prisma.$transaction(async (tx) => {
    // Remove from cart inside the transaction so it's atomic with the status change
    if (cartItemToRemove) {
      await tx.saleCartItem.delete({ where: { id: cartItemToRemove.id } });
    }

    const updated = await tx.bookCopy.update({ where: { id }, data: parsed.data });

    // Keep Book.availableCopies in sync if status moved in/out of AVAILABLE
    // STOCK and FOR_SALE are not available for lending
    const wasAvailable = before.status === "AVAILABLE";
    const isAvailable  = updated.status === "AVAILABLE";
    if (wasAvailable && !isAvailable) {
      await tx.book.update({ where: { id: before.bookId }, data: { availableCopies: { decrement: 1 } } });
    } else if (!wasAvailable && isAvailable) {
      await tx.book.update({ where: { id: before.bookId }, data: { availableCopies: { increment: 1 } } });
    }

    // ── Write a StockMovement whenever the status actually changes ──────────
    if (parsed.data.status && parsed.data.status !== before.status) {
      const movementType = (() => {
        switch (parsed.data.status) {
          case "STOCK":     return "RETURNED_TO_STOCK" as const;
          case "AVAILABLE": return "DEPLOYED"          as const;
          case "FOR_SALE":  return "DEPLOYED_FOR_SALE" as const;
          case "WITHDRAWN": return "WITHDRAWN"         as const;
          default:          return "STATUS_CHANGE"     as const;
        }
      })();

      await tx.stockMovement.create({
        data: {
          copyId:    id,
          bookId:    before.bookId,
          type:      movementType,
          fromStatus: before.status,
          toStatus:   updated.status,
          source:     "MANUAL",
          actorId:    session.user?.id   ?? null,
          actorName:  session.user?.name ?? null,
        },
      });
    }

    // If we just freed a copy that was held for someone, send their reservation back to APPROVED
    // (they're still in queue — staff can mark it READY again later when convenient).
    // Status going RESERVED → anything-not-RESERVED breaks the hold.
    let releasedReservation: { id: string; memberId: string; bookTitle: string } | null = null;
    if (heldReservation && updated.status !== "RESERVED") {
      await tx.reservation.update({
        where: { id: heldReservation.id },
        data:  { status: "APPROVED", copyId: null, holdShelf: null },
      });
      releasedReservation = {
        id:        heldReservation.id,
        memberId:  heldReservation.memberId,
        bookTitle: heldReservation.book.title,
      };
    }

    return { copy: updated, releasedReservation };
  });

  await logActivity(actorFromSession(session), Actions.BOOK_COPY_UPDATED, {
    entityType: "Book",
    entityId:   before.bookId,
    entityName: before.book?.title ?? undefined,
    detail: {
      copyNumber: before.copyNumber,
      barcode:    before.barcode,
      before: { status: before.status, condition: before.condition },
      after:  { status: result.copy.status, condition: result.copy.condition },
    },
  });

  return NextResponse.json(result.copy, {
    headers: {
      ...(result.releasedReservation ? { "X-Reservation-Released": result.releasedReservation.id } : {}),
      ...(cartItemToRemove          ? { "X-Cart-Item-Removed":    "1"                            } : {}),
    },
  });
}

/** DELETE /api/copies/[id] — remove a copy (only if no active loans) */
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const copy = await prisma.bookCopy.findUnique({
    where:   { id },
    include: {
      loans: { where: { status: { in: ["ACTIVE", "OVERDUE"] } }, select: { id: true } },
      book:  { select: { title: true } },
    },
  });
  if (!copy) return NextResponse.json({ error: "Copy not found" }, { status: 404 });
  if (copy.loans.length > 0) {
    return NextResponse.json({ error: "Cannot delete — copy has active loans" }, { status: 400 });
  }

  // Release any reservation that was holding this copy (READY status)
  const heldReservation = copy.status === "RESERVED"
    ? await prisma.reservation.findFirst({
        where:  { copyId: id, status: "READY" },
        select: { id: true },
      })
    : null;

  await prisma.$transaction(async (tx) => {
    if (heldReservation) {
      // Send the member back to APPROVED status — they're still in queue
      await tx.reservation.update({
        where: { id: heldReservation.id },
        data:  { status: "APPROVED", copyId: null, holdShelf: null },
      });
    }
    await tx.bookCopy.delete({ where: { id } });
    await tx.book.update({
      where: { id: copy.bookId },
      data:  {
        totalCopies:     { decrement: 1 },
        // Deleting a RESERVED copy frees the reserved spot but doesn't increase availableCopies
        // (it was already decremented when the copy went RESERVED).
        ...(copy.status === "AVAILABLE" && { availableCopies: { decrement: 1 } }),
      },
    });
  });

  await logActivity(actorFromSession(session), Actions.BOOK_COPY_DELETED, {
    entityType: "Book",
    entityId:   copy.bookId,
    entityName: copy.book?.title ?? undefined,
    detail:     { copyNumber: copy.copyNumber, barcode: copy.barcode, condition: copy.condition },
  });

  return NextResponse.json({ success: true });
}
