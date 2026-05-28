import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

/**
 * GET /api/sale/cart
 * Returns (or creates) the logged-in member's sale cart with items.
 */
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const member = await prisma.member.findFirst({
    where: { userId: session.user?.id ?? "" },
    select: { id: true },
  });
  if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  // Get or create cart
  let cart = await prisma.saleCart.findUnique({
    where: { memberId: member.id },
    include: {
      items: {
        include: {
          copy: {
            select: {
              id: true, copyNumber: true, barcode: true,
              condition: true, status: true, price: true,
            },
          },
          book: {
            select: {
              id: true, title: true, isbn: true, coverImage: true,
              author: { select: { name: true } },
            },
          },
        },
        orderBy: { addedAt: "asc" },
      },
    },
  });

  const cartInclude = {
    items: {
      include: {
        copy: { select: { id: true, copyNumber: true, barcode: true, condition: true, status: true, price: true } },
        book: { select: { id: true, title: true, isbn: true, coverImage: true, author: { select: { name: true } } } },
      },
      orderBy: { addedAt: "asc" } as const,
    },
  };

  if (!cart) {
    const created = await prisma.saleCart.create({ data: { memberId: member.id }, include: cartInclude });
    return NextResponse.json(created);
  }

  // Remove items whose copy is no longer FOR_SALE
  const staleIds = cart.items
    .filter((i) => i.copy.status !== "FOR_SALE")
    .map((i) => i.id);
  if (staleIds.length > 0) {
    await prisma.saleCartItem.deleteMany({ where: { id: { in: staleIds } } });
    const refreshed = await prisma.saleCart.findUnique({ where: { memberId: member.id }, include: cartInclude });
    return NextResponse.json(refreshed);
  }

  return NextResponse.json(cart);
}
