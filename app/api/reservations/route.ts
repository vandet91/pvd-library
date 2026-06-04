import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { logActivity, actorFromSession, Actions } from "@/lib/activity-log";
import { notifyMember, tg } from "@/lib/telegram";
import { resolveCirculationRule } from "@/lib/circulation-rules";

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

    const member = await prisma.member.findUnique({
      where:  { userId },
      select: { id: true, name: true, memberType: true, isActive: true, pendingApproval: true, restrictionStatus: true, restrictionReason: true },
    });
    if (!member) return NextResponse.json({ error: "Member record not found" }, { status: 404 });
    if (member.pendingApproval)
      return NextResponse.json({ error: "Your account is pending staff approval", code: "PENDING_APPROVAL" }, { status: 403 });
    if (!member.isActive)
      return NextResponse.json({ error: "Your account is inactive. Please contact the library.", code: "ACCOUNT_INACTIVE" }, { status: 403 });
    // Restriction guard — any level other than NONE blocks reservations
    if (member.restrictionStatus !== "NONE") {
      const label = member.restrictionStatus.toLowerCase().replace("_", " ");
      return NextResponse.json({
        error: `Your account is ${label}. Reservations are not permitted at this time. Please contact the library.`,
        code:  "ACCOUNT_RESTRICTED",
        restrictionStatus: member.restrictionStatus,
      }, { status: 403 });
    }

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
      select: { title: true, referenceOnly: true, materialType: true, branchId: true },
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

    // ── Resolve circulation rule once (used for allowHomeLoan + maxLoans) ──
    const rule = await resolveCirculationRule({
      memberType:   member.memberType,
      materialType: targetBook.materialType ?? undefined,
      branchId:     targetBook.branchId     ?? undefined,
    });

    if (!rule.allowHomeLoan) {
      return NextResponse.json({
        error: `"${targetBook.title}" cannot be reserved for home loan under your account type's circulation rules.`,
        code:  "HOME_LOAN_NOT_ALLOWED",
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

    // ── Quota check via Circulation Rule ────────────────────────────
    const [activeLoanCount, overdueCount, reservationCount] = await Promise.all([
      prisma.loan.count({ where: { memberId: member.id, status: "ACTIVE"  } }),
      prisma.loan.count({ where: { memberId: member.id, status: "OVERDUE" } }),
      prisma.reservation.count({ where: { memberId: member.id, status: { in: ["PENDING", "APPROVED", "READY"] } } }),
    ]);

    if (overdueCount > 0)
      return NextResponse.json({
        error: `You have ${overdueCount} overdue book${overdueCount > 1 ? "s" : ""} — please return them before making new reservations`,
      }, { status: 409 });

    const totalActive = activeLoanCount + reservationCount;
    if (totalActive >= rule.maxLoans)
      return NextResponse.json({
        error: `Reservation limit reached — you have ${activeLoanCount} book${activeLoanCount !== 1 ? "s" : ""} borrowed and ${reservationCount} reserved (limit: ${rule.maxLoans} for your account type${!rule.isDefault ? " · custom rule applied" : ""})`,
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

    await logActivity(actorFromSession(session), Actions.RESERVATION_CREATED, {
      entityType: "Member",
      entityId:   member.id,
      entityName: member.name,
      detail:     { bookId, bookTitle: targetBook.title, queuePosition: availability.nextPosition },
    });
    notifyMember(member.id, tg.reservationCreated(member.name, targetBook.title, availability.nextPosition)).catch(() => {});

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
