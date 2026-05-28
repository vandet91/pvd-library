import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

/**
 * GET /api/sale/orders — member's own order history
 */
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const member = await prisma.member.findFirst({
    where: { userId: session.user?.id ?? "" },
    select: { id: true },
  });
  if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  const orders = await prisma.saleOrder.findMany({
    where:   { memberId: member.id },
    include: {
      branch: { select: { id: true, name: true } },
      items: {
        include: {
          book: { select: { id: true, title: true, coverImage: true, author: { select: { name: true } } } },
          copy: { select: { id: true, copyNumber: true, barcode: true, condition: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(orders);
}
