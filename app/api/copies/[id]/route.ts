import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { z } from "zod";

const updateSchema = z.object({
  barcode:   z.string().optional(),
  rfid:      z.string().optional().nullable(),
  condition: z.enum(["EXCELLENT", "GOOD", "FAIR", "POOR", "DAMAGED", "LOST", "WITHDRAWN", "ARCHIVED"]).optional(),
  status:    z.enum(["AVAILABLE", "BORROWED", "RESERVED", "LOST", "DAMAGED", "WITHDRAWN"]).optional(),
  loanable:  z.boolean().optional(),
  price:     z.number().nullable().optional(),
  notes:     z.string().optional().nullable(),
});

/** PATCH /api/copies/[id] — update a single copy */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // Need previous status to know whether availableCopies changes
  const before = await prisma.bookCopy.findUnique({ where: { id }, select: { status: true, bookId: true } });
  if (!before) return NextResponse.json({ error: "Copy not found" }, { status: 404 });

  // If the copy was holding a reservation (READY), find that reservation up-front
  // so we can release it inside the same transaction when the librarian frees the copy.
  const heldReservation = before.status === "RESERVED"
    ? await prisma.reservation.findFirst({
        where:  { copyId: id, status: "READY" },
        select: { id: true, memberId: true, book: { select: { title: true } } },
      })
    : null;

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.bookCopy.update({ where: { id }, data: parsed.data });

    // Keep Book.availableCopies in sync if status moved in/out of AVAILABLE
    const wasAvailable = before.status === "AVAILABLE";
    const isAvailable  = updated.status === "AVAILABLE";
    if (wasAvailable && !isAvailable) {
      await tx.book.update({ where: { id: before.bookId }, data: { availableCopies: { decrement: 1 } } });
    } else if (!wasAvailable && isAvailable) {
      await tx.book.update({ where: { id: before.bookId }, data: { availableCopies: { increment: 1 } } });
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

  return NextResponse.json(result.copy, {
    headers: result.releasedReservation
      ? { "X-Reservation-Released": result.releasedReservation.id }
      : undefined,
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
    include: { loans: { where: { status: { in: ["ACTIVE", "OVERDUE"] } }, select: { id: true } } },
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

  return NextResponse.json({ success: true });
}
