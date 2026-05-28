import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

/** Returns the authenticated member's own fines. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.email)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Resolve the member record linked to this user
  const user = await prisma.user.findUnique({
    where:   { email: session.user.email },
    include: { member: true },
  });
  if (!user?.member)
    return NextResponse.json({ error: "No member account" }, { status: 404 });

  const fines = await prisma.fine.findMany({
    where:   { memberId: user.member.id },
    include: { loan: { include: { book: true } } },
    orderBy: { createdAt: "desc" },
  });

  // Return safe subset — never expose internal IDs not needed by the member
  return NextResponse.json(
    fines.map((f) => ({
      id:            f.id,
      amount:        f.amount,
      daysLate:      f.daysLate,
      type:          f.type,
      status:        f.status,
      paidAt:        f.paidAt,
      paymentMethod: f.paymentMethod,
      notes:         f.notes,
      createdAt:     f.createdAt,
      book: {
        title:      f.loan.book.title,
        coverImage: f.loan.book.coverImage,
      },
      loan: {
        dueDate:    f.loan.dueDate,
        returnDate: f.loan.returnDate,
      },
    }))
  );
}
