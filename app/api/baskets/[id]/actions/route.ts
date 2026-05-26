import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { auth } from "@/lib/auth";
import { BookCondition } from "@prisma/client";

/* POST /api/baskets/[id]/actions
   Run a batch action on the TAGGED books in this basket.

   Body:
     action   : "location" | "condition" | "withdraw" | "archive" |
                "restore"  | "repair"    | "inventory-mark" | "delete"
     payload  : { location?, condition?, reason?, withdrawnAt? }
     scope    : "tagged" (default) | "all"  — which items to apply to
*/
export async function POST(request: NextRequest, { params }: Ctx) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: basketId } = await params;

  const basket = await prisma.basket.findUnique({ where: { id: basketId } });
  if (!basket) return NextResponse.json({ error: "Basket not found" }, { status: 404 });

  const body = await request.json() as {
    action:   string;
    payload?: Record<string, string>;
    scope?:   "tagged" | "all";
  };
  const { action, payload = {}, scope = "tagged" } = body;

  /* Resolve which book / copy IDs to act on */
  const items = await prisma.basketItem.findMany({
    where: {
      basketId,
      ...(scope === "tagged" ? { tagged: true } : {}),
    },
    select: { bookId: true, copyId: true, book: { select: { totalCopies: true } } },
  });

  if (items.length === 0)
    return NextResponse.json({ error: "No books selected (none tagged)" }, { status: 400 });

  const bookIds = [...new Set(items.map((i) => i.bookId))];
  const copyIds = [...new Set(items.map((i) => i.copyId))];

  switch (action) {
    case "location": {
      if (!payload.location?.trim())
        return NextResponse.json({ error: "location is required" }, { status: 400 });
      const result = await prisma.book.updateMany({
        where: { id: { in: bookIds } },
        data:  { location: payload.location.trim() },
      });
      return NextResponse.json({ updated: result.count });
    }

    case "condition": {
      const cond = payload.condition as BookCondition | undefined;
      if (!cond || !(cond in BookCondition))
        return NextResponse.json({ error: "Invalid condition" }, { status: 400 });
      // Update the physical copy condition (per-copy), not the book-level field
      const result = await prisma.bookCopy.updateMany({
        where: { id: { in: copyIds } },
        data:  { condition: cond },
      });
      return NextResponse.json({ updated: result.count });
    }

    case "withdraw": {
      const result = await prisma.book.updateMany({
        where: { id: { in: bookIds } },
        data:  {
          condition:       BookCondition.WITHDRAWN,
          withdrawnAt:     payload.withdrawnAt ? new Date(payload.withdrawnAt) : new Date(),
          withdrawnReason: payload.reason || "Deaccessioned",
          availableCopies: 0,
        },
      });
      return NextResponse.json({ updated: result.count });
    }

    case "archive": {
      const result = await prisma.book.updateMany({
        where: { id: { in: bookIds } },
        data:  {
          condition:       BookCondition.ARCHIVED,
          withdrawnAt:     payload.withdrawnAt ? new Date(payload.withdrawnAt) : new Date(),
          withdrawnReason: payload.reason || "Archived",
          availableCopies: 0,
        },
      });
      return NextResponse.json({ updated: result.count });
    }

    case "restore": {
      await Promise.all(
        items.map((item) =>
          prisma.book.update({
            where: { id: item.bookId },
            data:  {
              condition:       BookCondition.GOOD,
              withdrawnAt:     null,
              withdrawnReason: null,
              availableCopies: item.book.totalCopies,
            },
          })
        )
      );
      return NextResponse.json({ updated: items.length });
    }

    case "repair": {
      const result = await prisma.book.updateMany({
        where: { id: { in: bookIds } },
        data:  {
          condition:       BookCondition.POOR,
          availableCopies: 0,
          withdrawnReason: payload.reason || "Sent for repair",
        },
      });
      return NextResponse.json({ updated: result.count });
    }

    case "inventory-mark": {
      const result = await prisma.book.updateMany({
        where: { id: { in: bookIds } },
        data:  { lastInventoryAt: new Date() },
      });
      return NextResponse.json({ updated: result.count });
    }

    case "delete": {
      /* Remove from basket first, then delete the book records */
      await prisma.basketItem.deleteMany({ where: { basketId, bookId: { in: bookIds } } });
      const result = await prisma.book.deleteMany({ where: { id: { in: bookIds } } });
      return NextResponse.json({ deleted: result.count });
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}

type Ctx = { params: Promise<{ id: string }> };
