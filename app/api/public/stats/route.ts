import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);

    const [
      totalBooks, totalMembers, booksBorrowed, availableSum,
      newBooks, newMembers, newBorrows,
    ] = await Promise.all([
      prisma.book.count(),
      prisma.member.count({ where: { isActive: true } }),
      prisma.loan.count({ where: { status: { in: ["ACTIVE", "OVERDUE"] } } }),
      prisma.book.aggregate({ _sum: { availableCopies: true } }),
      prisma.book.count({ where: { createdAt: { gte: monthAgo } } }),
      prisma.member.count({ where: { isActive: true, createdAt: { gte: monthAgo } } }),
      prisma.loan.count({ where: { borrowDate: { gte: monthAgo } } }),
    ]);

    return NextResponse.json({
      totalBooks,
      totalMembers,
      booksBorrowed,
      availableToday: availableSum._sum.availableCopies ?? 0,
      newBooksThisMonth:  newBooks,
      newMembersThisMonth: newMembers,
      newBorrowsThisMonth: newBorrows,
    });
  } catch {
    return NextResponse.json({ error: "Failed to load stats" }, { status: 500 });
  }
}
