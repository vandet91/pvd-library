import { prisma } from "@/lib/prisma";

export interface BookAvailability {
  bookId:        string;
  totalCopies:   number;
  availableNow:  number;        // copies with status AVAILABLE (immediately borrowable)
  borrowed:      number;        // loans ACTIVE + OVERDUE
  onHoldShelf:   number;        // reservations in READY status (copy already pulled)
  inQueue:       number;        // reservations in PENDING or APPROVED status
  queueCapacity: number;        // computed from MAX_RESERVATION_QUEUE_MULTIPLIER setting
  canReserve:    boolean;       // is there room in the queue?
  queueFull:     boolean;       // queue is at capacity
  nextPosition:  number;        // what position would a NEW reservation be in?
}

/**
 * Compute the current borrow/reservation picture for a book.
 *
 * Queue semantics:
 *   - "in queue" = reservations not yet placed on the hold shelf (PENDING/APPROVED).
 *   - "on hold shelf" = reservations marked READY (a copy is held for that member).
 *   - "borrowed" = currently checked-out copies.
 *
 * Queue capacity:
 *   - Cap = totalCopies × MAX_RESERVATION_QUEUE_MULTIPLIER (default 3).
 *   - A book with 5 copies & multiplier=3 → up to 15 outstanding reservations
 *     before new ones are blocked.
 */
export async function getBookAvailability(bookId: string): Promise<BookAvailability> {
  const [book, multSetting, borrowed, onHoldShelf, inQueue] = await Promise.all([
    prisma.book.findUnique({ where: { id: bookId }, select: { totalCopies: true } }),
    prisma.settings.findUnique({ where: { key: "MAX_RESERVATION_QUEUE_MULTIPLIER" } }),
    prisma.loan.count({        where: { bookId, status: { in: ["ACTIVE", "OVERDUE"] } } }),
    prisma.reservation.count({ where: { bookId, status: "READY" } }),
    prisma.reservation.count({ where: { bookId, status: { in: ["PENDING", "APPROVED"] } } }),
  ]);

  const totalCopies = book?.totalCopies ?? 0;
  const availableNow = Math.max(0, totalCopies - borrowed - onHoldShelf);

  const multiplier    = Math.max(1, Number(multSetting?.value ?? "3"));
  const queueCapacity = totalCopies * multiplier;
  const outstanding   = inQueue + onHoldShelf;
  const canReserve    = totalCopies > 0 && outstanding < queueCapacity;
  // Next position = number of people already waiting (PENDING + APPROVED + READY) + 1.
  // Members who are READY are still "ahead" of new entries because they get the next free copy.
  const nextPosition  = outstanding + 1;

  return {
    bookId,
    totalCopies,
    availableNow,
    borrowed,
    onHoldShelf,
    inQueue,
    queueCapacity,
    canReserve,
    queueFull: !canReserve,
    nextPosition,
  };
}

/**
 * What's the queue position of an existing reservation? Counts how many
 * older outstanding reservations come before it (excluding RETURNED/CANCELLED).
 * READY reservations always rank ahead of PENDING/APPROVED in the same book.
 */
export async function getReservationQueuePosition(reservationId: string): Promise<number | null> {
  const me = await prisma.reservation.findUnique({
    where:  { id: reservationId },
    select: { bookId: true, status: true, createdAt: true },
  });
  if (!me) return null;
  if (me.status !== "PENDING" && me.status !== "APPROVED" && me.status !== "READY") return null;

  // Count READY reservations on the same book — they're always ahead
  const readyAhead = await prisma.reservation.count({
    where: { bookId: me.bookId, status: "READY", id: { not: reservationId } },
  });

  if (me.status === "READY") {
    // For READY, position is among the READY reservations ordered by createdAt
    const olderReady = await prisma.reservation.count({
      where: {
        bookId:   me.bookId,
        status:   "READY",
        createdAt: { lt: me.createdAt },
        id:       { not: reservationId },
      },
    });
    return olderReady + 1;
  }

  // PENDING/APPROVED: count all READY + any older PENDING/APPROVED
  const olderInQueue = await prisma.reservation.count({
    where: {
      bookId:   me.bookId,
      status:   { in: ["PENDING", "APPROVED"] },
      createdAt: { lt: me.createdAt },
      id:       { not: reservationId },
    },
  });
  return readyAhead + olderInQueue + 1;
}
