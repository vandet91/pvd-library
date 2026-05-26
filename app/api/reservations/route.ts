import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";

// GET — list reservations
//   Staff (ADMIN/LIBRARIAN/STAFF): all reservations, filterable by status
//   Patron (MEMBER): own reservations only
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || undefined;

    // Auto-expire stale PENDING reservations before returning data
    await prisma.reservation.updateMany({
      where: {
        status:    "PENDING",
        expiresAt: { lt: new Date() },
      },
      data: { status: "EXPIRED" },
    });

    /* ── Staff path ───────────────────────────────────────────────── */
    if (can(session.user?.role, "STAFF")) {
      // Try with materialType first; fall back if Prisma client not yet regenerated
      let reservations;
      try {
        reservations = await prisma.reservation.findMany({
          where: { ...(status && { status: status as never }) },
          include: {
            member: { select: { id: true, name: true, memberId: true } },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            book:   { select: { id: true, title: true, isbn: true, availableCopies: true, location: true, shelfLocation: { select: { name: true } }, materialType: true } as any },
            copy:   { select: { id: true, copyNumber: true, barcode: true } },
          },
          orderBy: { createdAt: "desc" },
        });
      } catch {
        reservations = await prisma.reservation.findMany({
          where: { ...(status && { status: status as never }) },
          include: {
            member: { select: { id: true, name: true, memberId: true } },
            book:   { select: { id: true, title: true, isbn: true, availableCopies: true, location: true, shelfLocation: { select: { name: true } } } },
            copy:   { select: { id: true, copyNumber: true, barcode: true } },
          },
          orderBy: { createdAt: "desc" },
        });
      }
      return NextResponse.json(reservations);
    }

    /* ── Patron path ──────────────────────────────────────────────── */
    const userId = session.user?.id;
    if (!userId) return NextResponse.json([], { status: 200 });

    const member = await prisma.member.findUnique({ where: { userId } });
    if (!member) return NextResponse.json([], { status: 200 });

    // Try with materialType first; fall back if Prisma client not yet regenerated
    let reservations;
    try {
      reservations = await prisma.reservation.findMany({
        where: { memberId: member.id, ...(status && { status: status as never }) },
        include: {
          book: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            select: { id: true, title: true, isbn: true, availableCopies: true, materialType: true, author: { select: { name: true } }, coverImage: true } as any,
          },
        },
        orderBy: { createdAt: "desc" },
      });
    } catch {
      reservations = await prisma.reservation.findMany({
        where: { memberId: member.id, ...(status && { status: status as never }) },
        include: {
          book: {
            select: { id: true, title: true, isbn: true, availableCopies: true, author: { select: { name: true } }, coverImage: true },
          },
        },
        orderBy: { createdAt: "desc" },
      });
    }
    return NextResponse.json(reservations);
  } catch (err) {
    console.error("[ReservationsAPI GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST — patron adds a book to basket / creates reservation
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { bookId, note } = await request.json();
    if (!bookId) return NextResponse.json({ error: "bookId required" }, { status: 400 });

    const userId = session.user?.id;
    if (!userId) return NextResponse.json({ error: "No user ID in session" }, { status: 401 });

    const member = await prisma.member.findUnique({ where: { userId } });
    if (!member) return NextResponse.json({ error: "Member record not found" }, { status: 404 });

    const existing = await prisma.reservation.findFirst({
      where: { memberId: member.id, bookId, status: { in: ["PENDING", "APPROVED", "READY"] } },
    });
    if (existing) return NextResponse.json({ error: "Already in basket" }, { status: 409 });

    // Block reservation if the member ALREADY HAS this book checked out — they
    // can renew their current loan instead of queuing for another copy.
    const activeLoan = await prisma.loan.findFirst({
      where:   { memberId: member.id, bookId, status: { in: ["ACTIVE", "OVERDUE"] } },
      include: { book: { select: { title: true } } },
    });
    if (activeLoan) {
      return NextResponse.json({
        error: `You already have "${activeLoan.book.title}" on loan. You can renew it from your loans page instead of reserving another copy.`,
        code:  "ALREADY_ON_LOAN",
      }, { status: 409 });
    }

    // Block reservations for reference-only titles
    const targetBook = await prisma.book.findUnique({
      where:  { id: bookId },
      select: { title: true, referenceOnly: true },
    });
    if (!targetBook) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }
    if (targetBook.referenceOnly) {
      return NextResponse.json({
        error: `"${targetBook.title}" is reference-only — visit the library to read it on-site.`,
        code:  "REFERENCE_ONLY",
      }, { status: 409 });
    }

    // ── Per-book queue cap ───────────────────────────────────────────
    // Block new reservations once the queue (in-line + on-hold-shelf)
    // exceeds totalCopies × MAX_RESERVATION_QUEUE_MULTIPLIER.
    const { getBookAvailability } = await import("@/lib/book-availability");
    const availability = await getBookAvailability(bookId);
    if (availability.totalCopies === 0) {
      return NextResponse.json({ error: "This book has no copies in the library" }, { status: 409 });
    }
    if (!availability.canReserve) {
      return NextResponse.json({
        error: `Reservation queue is full — ${availability.queueCapacity} people already waiting (limit ${availability.queueCapacity} per book). Please try again later.`,
        queueCapacity: availability.queueCapacity,
        outstanding:   availability.inQueue + availability.onHoldShelf,
      }, { status: 409 });
    }

    // ── Quota check ─────────────────────────────────────────────────
    // Active items = loans (ACTIVE+OVERDUE) + reservations (PENDING+APPROVED+READY)
    const quotaSetting = await prisma.settings.findUnique({ where: { key: "MAX_LOANS_PER_MEMBER" } });
    const maxQuota     = parseInt(quotaSetting?.value ?? process.env.MAX_LOANS_PER_MEMBER ?? "3", 10);

    const [activeLoanCount, overdueCount, reservationCount] = await Promise.all([
      prisma.loan.count({ where: { memberId: member.id, status: "ACTIVE"  } }),
      prisma.loan.count({ where: { memberId: member.id, status: "OVERDUE" } }),
      prisma.reservation.count({ where: { memberId: member.id, status: { in: ["PENDING", "APPROVED", "READY"] } } }),
    ]);

    if (overdueCount > 0)
      return NextResponse.json({
        error: `You have ${overdueCount} overdue book${overdueCount > 1 ? "s" : ""} — please return them before making new reservations`,
      }, { status: 409 });

    const totalActive = activeLoanCount + reservationCount; // overdueCount already blocked above
    if (totalActive >= maxQuota)
      return NextResponse.json({
        error: `Reservation limit reached — you have ${activeLoanCount} book${activeLoanCount !== 1 ? "s" : ""} borrowed and ${reservationCount} reserved (limit: ${maxQuota} total)`,
      }, { status: 409 });

    // Read RESERVATION_EXPIRE_DAYS from settings (default 7)
    const setting = await prisma.settings.findUnique({
      where: { key: "RESERVATION_EXPIRE_DAYS" },
    });
    const expireDays = parseInt(setting?.value ?? "7", 10);
    const expiresAt  = new Date();
    expiresAt.setDate(expiresAt.getDate() + expireDays);

    const reservation = await prisma.reservation.create({
      data: {
        memberId:  member.id,
        bookId,
        note:      note ?? undefined,
        expiresAt,
      },
      include: { book: { select: { title: true } } },
    });

    // Tell the member their position so they know how long they'll likely wait.
    // `availability.nextPosition` was computed BEFORE this insert, so it's correct
    // for the row we just created (no off-by-one).
    return NextResponse.json({
      ...reservation,
      queuePosition: availability.nextPosition,
      queueCapacity: availability.queueCapacity,
      availableNow:  availability.availableNow,
    }, { status: 201 });
  } catch (err) {
    console.error("[ReservationsAPI POST]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
