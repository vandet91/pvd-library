import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";

export async function GET() {
  const session = await auth();
  if (!session || !can(session.user?.role, "STAFF"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const yesterday  = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const in30Days   = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const [
    overdueLoans,
    pendingReservations,
    recentReturns,
    expiringMembers,
  ] = await Promise.all([
    prisma.loan.findMany({
      where:   { status: "OVERDUE" },
      include: {
        member: { select: { name: true } },
        book:   { select: { title: true } },
      },
      orderBy: { dueDate: "asc" },
      take: 5,
    }),
    prisma.reservation.findMany({
      where:   { status: "PENDING" },
      include: {
        member: { select: { name: true } },
        book:   { select: { title: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.loan.findMany({
      where:   { status: "RETURNED", returnDate: { gte: yesterday } },
      include: {
        member: { select: { name: true } },
        book:   { select: { title: true } },
      },
      orderBy: { returnDate: "desc" },
      take: 3,
    }),
    prisma.member.findMany({
      where: {
        isActive:   true,
        expireDate: { not: null, lte: in30Days, gte: new Date() },
      },
      select: { id: true, name: true, expireDate: true },
      orderBy: { expireDate: "asc" },
      take: 5,
    }),
  ]);

  type PendingReq = { id: string; createdAt: Date; member: { name: string } };
  let pendingRequests: PendingReq[] = [];
  try {
    pendingRequests = await (prisma as unknown as {
      bookRequest: { findMany: (a: unknown) => Promise<PendingReq[]> };
    }).bookRequest.findMany({
      where:   { status: "PENDING" },
      include: { member: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
  } catch { /* model not yet available */ }

  type NotifType = "overdue" | "reservation" | "return" | "request" | "expiry";
  interface Notif {
    id: string; type: NotifType; title: string;
    message: string; href: string; createdAt: string;
  }

  const notifications: Notif[] = [
    ...overdueLoans.map((l) => ({
      id: `overdue-${l.id}`, type: "overdue" as NotifType,
      title: `${l.member.name}`,
      message: `"${l.book.title}" overdue since ${new Date(l.dueDate).toLocaleDateString()}`,
      href: "circulation", createdAt: l.dueDate.toISOString(),
    })),
    ...pendingReservations.map((r) => ({
      id: `reservation-${r.id}`, type: "reservation" as NotifType,
      title: `${r.member.name}`,
      message: `Reserved "${r.book.title}" — awaiting approval`,
      href: "reservations", createdAt: r.createdAt.toISOString(),
    })),
    ...recentReturns.map((l) => ({
      id: `return-${l.id}`, type: "return" as NotifType,
      title: `${l.member.name}`,
      message: `Returned "${l.book.title}"`,
      href: "circulation", createdAt: (l.returnDate ?? l.updatedAt).toISOString(),
    })),
    ...pendingRequests.map((r) => ({
      id: `request-${r.id}`, type: "request" as NotifType,
      title: `Book Request: ${r.member.name}`,
      message: `Requested a new acquisition`,
      href: "book-requests", createdAt: r.createdAt.toISOString(),
    })),
    ...expiringMembers.map((m) => {
      const daysLeft = Math.ceil(
        (new Date(m.expireDate!).getTime() - Date.now()) / 86_400_000,
      );
      return {
        id: `expiry-${m.id}`, type: "expiry" as NotifType,
        title: `${m.name}`,
        message: `Membership expires in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}`,
        href: "members", createdAt: m.expireDate!.toISOString(),
      };
    }),
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 12);

  return NextResponse.json({
    notifications,
    counts: {
      overdue:      overdueLoans.length,
      reservations: pendingReservations.length,
      requests:     pendingRequests.length,
      expiring:     expiringMembers.length,
      total:        overdueLoans.length + pendingReservations.length + pendingRequests.length,
    },
  });
}
