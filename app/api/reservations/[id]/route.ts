import { NextRequest, NextResponse } from "next/server";
import { addDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { logActivity, actorFromSession, Actions } from "@/lib/activity-log";
import { notifyMember, tg } from "@/lib/telegram";

// PATCH — staff approves/cancels/fulfils; member cancels own
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const { status, holdShelf: holdShelfInput, copyId: copyIdInput } = body as {
    status: string;
    holdShelf?: string;
    copyId?: string;          // optional — librarian may pre-select a copy when marking READY
  };

  const isStaff = can(session.user?.role, "STAFF");
  const validStatuses = isStaff
    ? ["PENDING", "APPROVED", "READY", "CANCELLED", "FULFILLED"]
    : ["CANCELLED"];

  if (!validStatuses.includes(status))
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });

  // Non-staff: can only cancel their own reservations
  if (!isStaff) {
    const member     = await prisma.member.findUnique({ where: { userId: session.user.id } });
    const reservation = await prisma.reservation.findUnique({ where: { id } });
    if (!member || reservation?.memberId !== member.id)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── READY: librarian pulls a specific copy from the shelf ──────
  if (status === "READY") {
    const reservation = await prisma.reservation.findUnique({
      where:   { id },
      include: { copy: true },
    });
    if (!reservation)
      return NextResponse.json({ error: "Reservation not found" }, { status: 404 });

    const holdShelf = holdShelfInput?.trim() || "Hold Shelf";

    // Resolve the copy: librarian's explicit pick if provided, else first AVAILABLE
    let pickedCopy = copyIdInput
      ? await prisma.bookCopy.findUnique({ where: { id: copyIdInput } })
      : await prisma.bookCopy.findFirst({
          where:   { bookId: reservation.bookId, status: "AVAILABLE" },
          orderBy: { copyNumber: "asc" },
        });

    if (copyIdInput && (!pickedCopy || pickedCopy.bookId !== reservation.bookId))
      return NextResponse.json({ error: "Selected copy does not belong to this book" }, { status: 400 });
    if (pickedCopy && pickedCopy.status !== "AVAILABLE")
      return NextResponse.json({ error: `Copy #${pickedCopy.copyNumber} is currently ${pickedCopy.status}` }, { status: 409 });
    if (!pickedCopy)
      return NextResponse.json({ error: "No available copies — cannot mark READY" }, { status: 409 });

    const updated = await prisma.$transaction(async (tx) => {
      const r = await tx.reservation.update({
        where: { id },
        data:  { status: "READY", holdShelf, copyId: pickedCopy.id },
        include: {
          member: { select: { id: true, name: true, memberId: true } },
          book:   { select: { title: true, location: true, shelfLocation: { select: { name: true } } } },
          copy:   { select: { id: true, copyNumber: true, barcode: true } },
        },
      });
      // Mark the copy RESERVED so it can't be borrowed by someone else
      await tx.bookCopy.update({
        where: { id: pickedCopy.id },
        data:  { status: "RESERVED" },
      });
      // Decrement availableCopies (copy is no longer borrowable)
      await tx.book.update({
        where: { id: reservation.bookId },
        data:  { availableCopies: { decrement: 1 } },
      });
      return r;
    });
    await logActivity(actorFromSession(session), Actions.RESERVATION_READY, {
      entityType: "Member",
      entityId:   updated.member.id,
      entityName: updated.member.name,
      detail: {
        bookTitle:  updated.book.title,
        copyNumber: updated.copy?.copyNumber,
        barcode:    updated.copy?.barcode,
        holdShelf,
      },
    });
    notifyMember(updated.member.id, tg.reservationReady(updated.member.name, updated.book.title, updated.expiresAt ?? null)).catch(() => {});
    return NextResponse.json(updated);
  }

  // ── FULFILL: convert the held copy to an active loan ───────────
  if (status === "FULFILLED") {
    const reservation = await prisma.reservation.findUnique({
      where:   { id },
      include: { book: true, copy: true },
    });
    if (!reservation)
      return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
    if (reservation.status !== "READY")
      return NextResponse.json({ error: "Only READY reservations can be fulfilled" }, { status: 409 });

    // Check member doesn't already have this book on loan
    const activeLoan = await prisma.loan.findFirst({
      where: { memberId: reservation.memberId, bookId: reservation.bookId, status: { in: ["ACTIVE", "OVERDUE"] } },
    });
    if (activeLoan)
      return NextResponse.json({ error: "Member already has this book on loan" }, { status: 409 });

    // Read default loan days from settings (fallback 14)
    const setting  = await prisma.settings.findUnique({ where: { key: "DEFAULT_LOAN_DAYS" } });
    const loanDays = parseInt(setting?.value ?? process.env.DEFAULT_LOAN_DAYS ?? "14", 10);
    const dueDate  = addDays(new Date(), loanDays);

    // Use the copy that was held on the shelf. Fall back to any AVAILABLE copy
    // for legacy reservations created before copyId was tracked.
    let copyToBorrow = reservation.copy;
    if (!copyToBorrow) {
      copyToBorrow = await prisma.bookCopy.findFirst({
        where:   { bookId: reservation.bookId, status: "AVAILABLE" },
        orderBy: { copyNumber: "asc" },
      });
      // Pre-Phase-3 fallback also needs an availableCopies decrement; new flow already did it on READY
      if (copyToBorrow && reservation.book.availableCopies < 1) {
        return NextResponse.json({ error: "No available copies" }, { status: 409 });
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const r = await tx.reservation.update({
        where: { id },
        data:  { status: "FULFILLED" },
        include: {
          member: { select: { id: true, name: true, memberId: true } },
          book:   { select: { title: true } },
          copy:   { select: { id: true, copyNumber: true, barcode: true } },
        },
      });
      await tx.loan.create({
        data: {
          memberId:   reservation.memberId,
          bookId:     reservation.bookId,
          copyId:     copyToBorrow?.id ?? null,
          borrowDate: new Date(),
          dueDate,
          status:     "ACTIVE",
        },
      });
      // If we used the pre-reserved copy from READY, availableCopies was already decremented.
      // Only decrement again for legacy fallback (no copyId on reservation).
      if (!reservation.copyId) {
        await tx.book.update({
          where: { id: reservation.bookId },
          data:  { availableCopies: { decrement: 1 } },
        });
      }
      if (copyToBorrow) {
        await tx.bookCopy.update({
          where: { id: copyToBorrow.id },
          data:  { status: "BORROWED" },
        });
      }
      return r;
    });

    await logActivity(actorFromSession(session), Actions.RESERVATION_FULFILLED, {
      entityType: "Member",
      entityId:   updated.member.id,
      entityName: updated.member.name,
      detail: {
        bookTitle:  updated.book.title,
        copyNumber: updated.copy?.copyNumber,
        barcode:    updated.copy?.barcode,
      },
    });
    notifyMember(updated.member.id, tg.checkout(updated.member.name, updated.book.title, dueDate)).catch(() => {});
    return NextResponse.json(updated);
  }

  // ── CANCELLED / EXPIRED: release the held copy back to AVAILABLE ─
  if (status === "CANCELLED" || status === "EXPIRED") {
    const reservation = await prisma.reservation.findUnique({
      where:   { id },
      include: { copy: true },
    });
    if (!reservation)
      return NextResponse.json({ error: "Reservation not found" }, { status: 404 });

    const wasReady = reservation.status === "READY";

    const updated = await prisma.$transaction(async (tx) => {
      const r = await tx.reservation.update({
        where: { id },
        data:  { status: status as "CANCELLED" | "EXPIRED" },
        include: {
          member: { select: { id: true, name: true, memberId: true } },
          book:   { select: { title: true } },
        },
      });
      // If a copy was on hold for this reservation, return it to the shelf
      if (wasReady && reservation.copyId && reservation.copy?.status === "RESERVED") {
        await tx.bookCopy.update({
          where: { id: reservation.copyId },
          data:  { status: "AVAILABLE" },
        });
        await tx.book.update({
          where: { id: reservation.bookId },
          data:  { availableCopies: { increment: 1 } },
        });
      }
      return r;
    });
    const cancelAction = status === "EXPIRED" ? Actions.RESERVATION_EXPIRED : Actions.RESERVATION_CANCELLED;
    await logActivity(actorFromSession(session), cancelAction, {
      entityType: "Member",
      entityId:   updated.member.id,
      entityName: updated.member.name,
      detail:     { bookTitle: updated.book.title, wasReady },
    });
    if (status === "CANCELLED") {
      notifyMember(updated.member.id, tg.reservationCancelled(updated.member.name, updated.book.title)).catch(() => {});
    }
    return NextResponse.json(updated);
  }

  // ── PENDING / APPROVED — simple status flip, no side effects ───
  const updated = await prisma.reservation.update({
    where: { id },
    data:  { status: status as "PENDING" | "APPROVED" },
    include: {
      member: { select: { id: true, name: true, memberId: true } },
      book:   { select: { title: true } },
    },
  });

  await logActivity(actorFromSession(session), Actions.RESERVATION_UPDATED, {
    entityType: "Member",
    entityId:   updated.member.id,
    entityName: updated.member.name,
    detail:     { bookTitle: updated.book.title, status },
  });
  if (status === "APPROVED") {
    notifyMember(updated.member.id, tg.reservationApproved(updated.member.name, updated.book.title)).catch(() => {});
  }
  return NextResponse.json(updated);
}

// DELETE — remove a reservation (member removes own; staff removes any)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  if (!can(session.user?.role, "STAFF")) {
    const member = await prisma.member.findUnique({ where: { userId: session.user.id } });
    const reservation = await prisma.reservation.findUnique({ where: { id } });
    if (!member || reservation?.memberId !== member.id)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Release any held copy back to the shelf before deleting the reservation
  const reservation = await prisma.reservation.findUnique({
    where: { id }, include: { copy: true },
  });
  const resWithMember = await prisma.reservation.findUnique({
    where:   { id },
    include: {
      member: { select: { id: true, name: true } },
      book:   { select: { title: true } },
    },
  });

  await prisma.$transaction(async (tx) => {
    if (reservation?.status === "READY" && reservation.copyId && reservation.copy?.status === "RESERVED") {
      await tx.bookCopy.update({
        where: { id: reservation.copyId },
        data:  { status: "AVAILABLE" },
      });
      await tx.book.update({
        where: { id: reservation.bookId },
        data:  { availableCopies: { increment: 1 } },
      });
    }
    await tx.reservation.delete({ where: { id } });
  });

  await logActivity(actorFromSession(session), Actions.RESERVATION_DELETED, {
    entityType: "Member",
    entityId:   resWithMember?.member.id,
    entityName: resWithMember?.member.name,
    detail:     { bookTitle: resWithMember?.book.title },
  });
  return NextResponse.json({ success: true });
}
