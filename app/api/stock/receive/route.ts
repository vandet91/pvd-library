import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { z } from "zod";
import { logActivity, actorFromSession, Actions } from "@/lib/activity-log";

const schema = z.object({
  copyIds:   z.array(z.string()).min(1),
  source:    z.enum(["PURCHASE", "DONATION", "TRANSFER", "RETURN", "MANUAL"]).default("MANUAL"),
  reference: z.string().optional(),
  unitCost:  z.number().optional(),
  currency:  z.string().default("USD"),
  notes:     z.string().optional(),
});

/**
 * POST /api/stock/receive
 * Manually moves existing copies (any status) → STOCK.
 * Used to pull deployed copies back into the warehouse / stock area.
 * Requires LIBRARIAN+.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body   = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues.map((e) => e.message).join(", ") }, { status: 400 });

  const { copyIds, source, reference, unitCost, currency, notes } = parsed.data;

  // Block if copy has an active loan
  const activeLoanCopies = await prisma.bookCopy.findMany({
    where: {
      id:    { in: copyIds },
      loans: { some: { status: { in: ["ACTIVE", "OVERDUE"] } } },
    },
    select: { id: true, barcode: true },
  });
  if (activeLoanCopies.length > 0) {
    return NextResponse.json(
      {
        error: `Cannot receive copies with active loans: ${
          activeLoanCopies.map((c) => c.barcode ?? c.id).join(", ")
        }`,
      },
      { status: 400 },
    );
  }

  // Resolve barcodes → IDs: anything that isn't a UUID-shaped string is treated as a barcode
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const ids: string[]      = copyIds.filter(s => uuidRe.test(s));
  const barcodes: string[] = copyIds.filter(s => !uuidRe.test(s));

  if (barcodes.length > 0) {
    const byBarcode = await prisma.bookCopy.findMany({
      where:  { barcode: { in: barcodes } },
      select: { id: true },
    });
    ids.push(...byBarcode.map(c => c.id));
  }

  const copies = await prisma.bookCopy.findMany({
    where:   { id: { in: ids } },
    include: { book: { select: { id: true, title: true } } },
  });

  const received = await prisma.$transaction(async (tx) => {
    const results = [];

    for (const copy of copies) {
      const wasAvailable = copy.status === "AVAILABLE";

      const updated = await tx.bookCopy.update({
        where: { id: copy.id },
        data:  { status: "STOCK", branchId: null },
      });

      // Decrement availableCopies if copy was on shelf
      if (wasAvailable) {
        await tx.book.update({
          where: { id: copy.bookId },
          data:  { availableCopies: { decrement: 1 } },
        });
      }

      const isNew = copy.status === "STOCK"; // already stock → just a re-receive
      await tx.stockMovement.create({
        data: {
          copyId:      copy.id,
          bookId:      copy.bookId,
          type:        isNew ? "RECEIVED" : "RETURNED_TO_STOCK",
          fromStatus:  isNew ? undefined : copy.status,
          toStatus:    "STOCK",
          fromBranchId: copy.branchId ?? undefined,
          source,
          reference:   reference ?? null,
          unitCost:    unitCost   ?? null,
          currency,
          notes:       notes ?? null,
          actorId:     session.user?.id   ?? null,
          actorName:   session.user?.name ?? null,
        },
      });

      results.push(updated);
    }

    return results;
  });

  await logActivity(actorFromSession(session), Actions.STOCK_RECEIVED, {
    entityType: "Book",
    detail: {
      count:     received.length,
      source,
      reference: reference ?? null,
    },
  });

  return NextResponse.json({ received: received.length, source });
}
