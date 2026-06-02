import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { z } from "zod";
import { logActivity, actorFromSession, Actions } from "@/lib/activity-log";

const schema = z.object({
  copyIds:      z.array(z.string()).min(1, "Select at least one copy"),
  targetStatus: z.enum(["AVAILABLE", "FOR_SALE"]),
  branchId:     z.string().min(1, "Branch is required"),
  notes:        z.string().optional(),
  price:        z.number().min(0).optional(),  // bulk price applied to all FOR_SALE copies
});

/**
 * POST /api/stock/deploy
 * Moves one or more copies from STOCK → AVAILABLE (for lending) or FOR_SALE.
 * Requires LIBRARIAN+.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body   = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.errors.map((e) => e.message).join(", ") }, { status: 400 });

  const { copyIds, targetStatus, branchId, notes, price } = parsed.data;

  // Verify branch exists
  const branch = await prisma.branch.findUnique({
    where:  { id: branchId },
    select: { id: true, name: true },
  });
  if (!branch) return NextResponse.json({ error: "Branch not found" }, { status: 404 });

  // Verify all copies are currently in STOCK
  const copies = await prisma.bookCopy.findMany({
    where:   { id: { in: copyIds } },
    include: { book: { select: { id: true, title: true } } },
  });

  const notInStock = copies.filter((c) => c.status !== "STOCK");
  if (notInStock.length > 0) {
    return NextResponse.json(
      {
        error: `${notInStock.length} copy/copies not in STOCK status: ${
          notInStock.map((c) => c.barcode ?? c.id).join(", ")
        }`,
      },
      { status: 400 },
    );
  }

  const movementType = targetStatus === "FOR_SALE" ? "DEPLOYED_FOR_SALE" : "DEPLOYED";

  const deployed = await prisma.$transaction(async (tx) => {
    const results = [];

    for (const copy of copies) {
      // Update copy status + assign to branch
      const updated = await tx.bookCopy.update({
        where: { id: copy.id },
        data:  {
          status: targetStatus,
          branchId,
          // Apply bulk price when deploying FOR_SALE (only if provided)
          ...(targetStatus === "FOR_SALE" && price !== undefined && { price }),
        },
      });

      // If deploying as AVAILABLE, increment the book's availableCopies counter
      if (targetStatus === "AVAILABLE") {
        await tx.book.update({
          where: { id: copy.bookId },
          data:  { availableCopies: { increment: 1 } },
        });
      }

      // Create stock movement record
      await tx.stockMovement.create({
        data: {
          copyId:      copy.id,
          bookId:      copy.bookId,
          type:        movementType,
          fromStatus:  "STOCK",
          toStatus:    targetStatus,
          toBranchId:  branchId,
          notes:       notes ?? null,
          actorId:     session.user?.id   ?? null,
          actorName:   session.user?.name ?? null,
        },
      });

      results.push(updated);
    }

    return results;
  });

  await logActivity(actorFromSession(session), Actions.STOCK_DEPLOYED, {
    entityType: "Book",
    detail: {
      count:        deployed.length,
      targetStatus,
      branch:       branch.name,
      copyBarcodes: copies.map((c) => c.barcode).filter(Boolean),
    },
  });

  return NextResponse.json({
    deployed: deployed.length,
    targetStatus,
    branch: branch.name,
  });
}
