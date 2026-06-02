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

  /* Resolve which IDs to act on — fetch raw SQL to avoid stale engine issues */
  const rawItems = await prisma.$queryRawUnsafe<{
    bookId: string | null; copyId: string | null;
    ebookId: string | null; memberId: string | null; authorId: string | null; totalCopies?: number;
  }[]>(
    `SELECT bi."bookId", bi."copyId", bi."ebookId", bi."memberId", bi."authorId",
            b."totalCopies"
     FROM "BasketItem" bi
     LEFT JOIN "Book" b ON b.id = bi."bookId"
     WHERE bi."basketId" = $1 ${scope === "tagged" ? 'AND bi.tagged = true' : ''}`,
    basketId,
  );
  const items = rawItems;

  if (items.length === 0)
    return NextResponse.json({ error: "No items selected (none tagged)" }, { status: 400 });

  const bookIds = [...new Set(items.map((i) => i.bookId).filter(Boolean))] as string[];
  const copyIds = [...new Set(items.map((i) => i.copyId).filter(Boolean))] as string[];

  switch (action) {
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
              availableCopies: item.totalCopies ?? 1,
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

    case "move-location": {
      if (!payload.locationId) return NextResponse.json({ error: "locationId is required" }, { status: 400 });
      const result = await prisma.book.updateMany({
        where: { id: { in: bookIds } },
        data:  { locationId: payload.locationId },
      });
      return NextResponse.json({ updated: result.count });
    }

    case "move-branch": {
      if (!payload.branchId) return NextResponse.json({ error: "branchId is required" }, { status: 400 });
      const result = await prisma.bookCopy.updateMany({
        where: { id: { in: copyIds } },
        data:  { branchId: payload.branchId },
      });
      return NextResponse.json({ updated: result.count });
    }

    case "delete": {
      /* For ITEM baskets: delete the book records */
      if (bookIds.length) {
        await prisma.basketItem.deleteMany({ where: { basketId, bookId: { in: bookIds } } });
        const result = await prisma.book.deleteMany({ where: { id: { in: bookIds } } });
        return NextResponse.json({ deleted: result.count });
      }
      /* For AUTHOR baskets */
      const authorIds = items.map((i) => i.authorId).filter(Boolean) as string[];
      if (authorIds.length) {
        await prisma.basketItem.deleteMany({ where: { basketId, authorId: { in: authorIds } } });
        const result = await prisma.author.deleteMany({ where: { id: { in: authorIds } } });
        return NextResponse.json({ deleted: result.count });
      }
      /* For MEMBER baskets */
      const memberIdsD = items.map((i) => (i as Record<string, unknown>).memberId as string).filter(Boolean);
      if (memberIdsD.length) {
        await prisma.basketItem.deleteMany({ where: { basketId, memberId: { in: memberIdsD } } });
        const result = await prisma.member.deleteMany({ where: { id: { in: memberIdsD } } });
        return NextResponse.json({ deleted: result.count });
      }
      /* For EBOOK baskets */
      const ebookIdsD = items.map((i) => (i as Record<string, unknown>).ebookId as string).filter(Boolean);
      if (ebookIdsD.length) {
        await prisma.basketItem.deleteMany({ where: { basketId, ebookId: { in: ebookIdsD } } });
        const result = await prisma.ebook.deleteMany({ where: { id: { in: ebookIdsD } } });
        return NextResponse.json({ deleted: result.count });
      }
      return NextResponse.json({ error: "Nothing to delete" }, { status: 400 });
    }

    // ── EBOOK: set public / private ───────────────────────────────────────
    case "set-public": {
      const isPublic = payload.isPublic === "true";
      const ebookIds = items.map((i) => (i as Record<string, unknown>).ebookId as string).filter(Boolean);
      if (!ebookIds.length) return NextResponse.json({ error: "No e-books in scope" }, { status: 400 });
      const result = await prisma.ebook.updateMany({
        where: { id: { in: ebookIds } },
        data:  { isPublic },
      });
      return NextResponse.json({ updated: result.count });
    }

    // ── MEMBER: activate / deactivate ─────────────────────────────────────
    case "activate":
    case "deactivate": {
      const memberIds = items.map((i) => (i as Record<string, unknown>).memberId as string).filter(Boolean);
      if (!memberIds.length) return NextResponse.json({ error: "No members in scope" }, { status: 400 });
      const result = await prisma.member.updateMany({
        where: { id: { in: memberIds } },
        data:  { isActive: action === "activate" },
      });
      return NextResponse.json({ updated: result.count });
    }

    // ── MEMBER: extend expiry ─────────────────────────────────────────────
    case "extend-expiry": {
      if (!payload.expireDate) return NextResponse.json({ error: "expireDate is required" }, { status: 400 });
      const memberIds = items.map((i) => (i as Record<string, unknown>).memberId as string).filter(Boolean);
      if (!memberIds.length) return NextResponse.json({ error: "No members in scope" }, { status: 400 });
      const result = await prisma.member.updateMany({
        where: { id: { in: memberIds } },
        data:  { expireDate: new Date(payload.expireDate), isActive: true },
      });
      return NextResponse.json({ updated: result.count });
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}

type Ctx = { params: Promise<{ id: string }> };
