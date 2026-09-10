import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { finePerDay } = await request.json();

    if (typeof finePerDay !== "number" || finePerDay < 0) {
      return NextResponse.json({ error: "Invalid finePerDay" }, { status: 400 });
    }

    // Get all unpaid fines from overdue loans and recalculate
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const unpaidFines = await prisma.fine.findMany({
      where: { status: "UNPAID", type: "LATE_FEE" },
      include: { loan: true },
    });

    let updatedCount = 0;

    for (const fine of unpaidFines) {
      if (!fine.loan) continue;

      const dueDate = new Date(fine.loan.dueDate);
      const returnDate = fine.loan.returnDate ? new Date(fine.loan.returnDate) : today;

      const daysLate = Math.max(0, Math.floor((returnDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
      const newAmount = daysLate * finePerDay;

      if (newAmount !== fine.amount) {
        await prisma.fine.update({
          where: { id: fine.id },
          data: {
            amount: newAmount,
            daysLate: daysLate,
            updatedAt: new Date(),
          },
        });
        updatedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      updatedCount,
      message: `Reset ${updatedCount} active fines with new rate`,
    });
  } catch (error) {
    console.error("Error resetting fines:", error);
    return NextResponse.json({ error: "Failed to reset fines" }, { status: 500 });
  }
}
