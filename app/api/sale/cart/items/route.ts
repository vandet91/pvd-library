import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";

const addSchema = z.object({ copyId: z.string() });

/**
 * POST /api/sale/cart/items  — add a copy to the member's sale cart
 * DELETE /api/sale/cart/items — remove a copy { copyId }
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body   = await request.json().catch(() => ({}));
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "copyId required" }, { status: 400 });

  const { copyId } = parsed.data;

  // Verify copy is FOR_SALE and not already in another cart
  const copy = await prisma.bookCopy.findUnique({
    where:   { id: copyId },
    include: { saleCartItem: true },
  });
  if (!copy)                        return NextResponse.json({ error: "Copy not found" }, { status: 404 });
  if (copy.status !== "FOR_SALE")   return NextResponse.json({ error: "This copy is not available for purchase" }, { status: 400 });
  if (copy.saleCartItem)            return NextResponse.json({ error: "This copy is already in someone's cart" }, { status: 409 });

  // Get or create cart for this member
  const member = await prisma.member.findFirst({
    where: { userId: session.user?.id ?? "" },
    select: { id: true },
  });
  if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  // Check sale feature is enabled
  const saleSetting = await prisma.settings.findUnique({ where: { key: "BOOK_SALE_ENABLED" } });
  if (saleSetting?.value !== "true") {
    return NextResponse.json({ error: "Book sale is not enabled" }, { status: 403 });
  }

  const cart = await prisma.saleCart.upsert({
    where:  { memberId: member.id },
    create: { memberId: member.id },
    update: {},
  });

  const item = await prisma.saleCartItem.create({
    data: { cartId: cart.id, copyId, bookId: copy.bookId },
  });

  return NextResponse.json(item, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body   = await request.json().catch(() => ({}));
  const { copyId } = body as { copyId?: string };
  if (!copyId) return NextResponse.json({ error: "copyId required" }, { status: 400 });

  const member = await prisma.member.findFirst({
    where: { userId: session.user?.id ?? "" },
    select: { id: true },
  });
  if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  const cart = await prisma.saleCart.findUnique({ where: { memberId: member.id } });
  if (!cart) return NextResponse.json({ success: true });

  await prisma.saleCartItem.deleteMany({
    where: { cartId: cart.id, copyId },
  });

  return NextResponse.json({ success: true });
}
