import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";

const cancelSchema = z.object({
  action:       z.literal("cancel"),
  cancelReason: z.string().optional(),
});

const returnSchema = z.object({
  action: z.literal("request_return"),
  note:   z.string().optional(),
});

const patchSchema = z.discriminatedUnion("action", [cancelSchema, returnSchema]);

/**
 * GET  /api/sale/orders/[id] — get order detail (member sees own order only)
 * PATCH /api/sale/orders/[id] — member can cancel or request return
 */
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const member = await prisma.member.findFirst({
    where: { userId: session.user?.id ?? "" },
    select: { id: true },
  });
  if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  const order = await prisma.saleOrder.findFirst({
    where:   { id, memberId: member.id },
    include: {
      branch: { select: { id: true, name: true, address: true, phone: true } },
      items: {
        include: {
          book: {
            select: {
              id: true, title: true, coverImage: true, isbn: true,
              author: { select: { name: true } },
            },
          },
          copy: { select: { id: true, copyNumber: true, barcode: true, condition: true } },
        },
      },
    },
  });

  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  return NextResponse.json(order);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const member = await prisma.member.findFirst({
    where: { userId: session.user?.id ?? "" },
    select: { id: true },
  });
  if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  const order = await prisma.saleOrder.findFirst({
    where: { id, memberId: member.id },
  });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const body   = await request.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  if (parsed.data.action === "cancel") {
    // Can only cancel if still pending payment
    if (!["PENDING_PAYMENT"].includes(order.status)) {
      return NextResponse.json({ error: "Order cannot be cancelled at this stage. Please contact the library." }, { status: 400 });
    }
    const updated = await prisma.saleOrder.update({
      where: { id },
      data: {
        status:       "CANCELLED",
        cancelledAt:  new Date(),
        cancelReason: parsed.data.cancelReason ?? "Cancelled by member",
      },
    });
    return NextResponse.json(updated);
  }

  if (parsed.data.action === "request_return") {
    // Can request return only if COMPLETED or DELIVERED
    if (!["COMPLETED", "DELIVERED"].includes(order.status)) {
      return NextResponse.json({ error: "Returns can only be requested for completed or delivered orders." }, { status: 400 });
    }
    // Check return window
    const returnWindowSetting = await prisma.settings.findUnique({ where: { key: "BOOK_SALE_RETURN_WINDOW_DAYS" } });
    const windowDays = parseInt(returnWindowSetting?.value ?? "7");
    const daysSincePurchase = Math.floor((Date.now() - new Date(order.updatedAt).getTime()) / 86400000);
    if (daysSincePurchase > windowDays) {
      return NextResponse.json(
        { error: `Return window of ${windowDays} days has passed.` },
        { status: 400 },
      );
    }
    const updated = await prisma.saleOrder.update({
      where: { id },
      data: {
        status:    "RETURN_REQUESTED",
        staffNote: parsed.data.note ? `Return request: ${parsed.data.note}` : "Member requested return",
      },
    });
    return NextResponse.json(updated);
  }
}
