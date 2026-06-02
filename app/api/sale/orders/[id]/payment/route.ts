import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { notifyMember, notifyAdmin, tg } from "@/lib/telegram";

const schema = z.object({
  paymentProof: z.string().min(1, "Payment proof is required"),
  paymentRef:   z.string().optional(),
});

/**
 * POST /api/sale/orders/[id]/payment
 * Member submits QR payment proof screenshot.
 * Transitions order from PENDING_PAYMENT → PAYMENT_SUBMITTED.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const member = await prisma.member.findFirst({
    where: { userId: session.user?.id ?? "" },
    select: { id: true, name: true },
  });
  if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  const order = await prisma.saleOrder.findFirst({
    where: { id, memberId: member.id },
  });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  if (order.status !== "PENDING_PAYMENT") {
    return NextResponse.json(
      { error: "Payment proof can only be submitted for orders pending payment." },
      { status: 400 },
    );
  }

  const body   = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => e.message).join(", ");
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const updated = await prisma.saleOrder.update({
    where: { id },
    data: {
      status:       "PAYMENT_SUBMITTED",
      paymentProof: parsed.data.paymentProof,
      paymentRef:   parsed.data.paymentRef ?? null,
    },
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

  // Notify member that proof was received + alert admin to confirm payment
  notifyMember(member.id, tg.salePaymentSubmitted(member.name, order.orderNumber)).catch(() => {});
  notifyAdmin(tg.adminPaymentProof(member.name, order.orderNumber)).catch(() => {});

  return NextResponse.json(updated);
}
