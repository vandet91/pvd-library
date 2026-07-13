import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { z } from "zod";
import { logActivity, actorFromSession, Actions } from "@/lib/activity-log";

const schema = z.object({
  copyIds:      z.array(z.string()).min(1),
  toBranchId:   z.string().min(1, "Destination branch is required"),
  notes:        z.string().optional(),
});

/**
 * POST /api/stock/transfer
 * Moves copies from one branch to another (status stays AVAILABLE / FOR_SALE).
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

  const { copyIds, toBranchId, notes } = parsed.data;

  const [toBranch, copies] = await Promise.all([
    prisma.branch.findUnique({ where: { id: toBranchId }, select: { id: true, name: true } }),
    prisma.bookCopy.findMany({
      where:   { id: { in: copyIds } },
      include: { book: { select: { id: true, title: true } } },
    }),
  ]);

  if (!toBranch) return NextResponse.json({ error: "Destination branch not found" }, { status: 404 });

  // Only AVAILABLE and FOR_SALE copies can be transferred
  const invalid = copies.filter((c) => !["AVAILABLE", "FOR_SALE"].includes(c.status));
  if (invalid.length > 0) {
    return NextResponse.json(
      { error: `Only AVAILABLE or FOR_SALE copies can be transferred. Invalid: ${
        invalid.map((c) => c.barcode ?? c.id).join(", ")
      }` },
      { status: 400 },
    );
  }

  await prisma.$transaction(async (tx) => {
    for (const copy of copies) {
      await tx.bookCopy.update({
        where: { id: copy.id },
        data:  { branchId: toBranchId },
      });
      await tx.stockMovement.create({
        data: {
          copyId:       copy.id,
          bookId:       copy.bookId,
          type:         "TRANSFERRED",
          fromStatus:   copy.status,
          toStatus:     copy.status,
          fromBranchId: copy.branchId ?? undefined,
          toBranchId,
          notes:        notes ?? null,
          actorId:      session.user?.id   ?? null,
          actorName:    session.user?.name ?? null,
        },
      });
    }
  });

  await logActivity(actorFromSession(session), Actions.STOCK_TRANSFERRED, {
    entityType: "Book",
    detail: { count: copies.length, toBranch: toBranch.name },
  });

  return NextResponse.json({ transferred: copies.length, toBranch: toBranch.name });
}
