import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { auth } from "@/lib/auth";
import { BookCondition } from "@prisma/client";

/* POST /api/books/batch
   Execute a batch action on a list of book IDs.

   Body:
     action  : "location" | "condition" | "withdraw" | "archive" | "restore" | "repair"
     bookIds : string[]
     payload : { location?, condition?, reason?, withdrawnAt? }
*/

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { action, bookIds, payload = {} } = body as {
    action:  string;
    bookIds: string[];
    payload: Record<string, string>;
  };

  if (!Array.isArray(bookIds) || bookIds.length === 0)
    return NextResponse.json({ error: "bookIds must be a non-empty array" }, { status: 400 });

  if (bookIds.length > 200)
    return NextResponse.json({ error: "Maximum 200 books per batch" }, { status: 400 });

  switch (action) {
    /* ── Move to a new shelf / location ─────────────────────────── */
    case "location": {
      if (!payload.location?.trim())
        return NextResponse.json({ error: "Location is required" }, { status: 400 });
      const result = await prisma.book.updateMany({
        where: { id: { in: bookIds } },
        data:  { location: payload.location.trim() },
      });
      return NextResponse.json({ updated: result.count });
    }

    /* ── Change physical condition ──────────────────────────────── */
    case "condition": {
      const cond = payload.condition as BookCondition | undefined;
      if (!cond || !(cond in BookCondition))
        return NextResponse.json({ error: "Invalid condition" }, { status: 400 });
      const result = await prisma.book.updateMany({
        where: { id: { in: bookIds } },
        data:  { condition: cond },
      });
      return NextResponse.json({ updated: result.count });
    }

    /* ── Withdraw (deaccession) ─────────────────────────────────── */
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

    /* ── Archive (stored, not circulating) ──────────────────────── */
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

    /* ── Restore withdrawn / archived books ─────────────────────── */
    case "restore": {
      const books = await prisma.book.findMany({
        where:  { id: { in: bookIds } },
        select: { id: true, totalCopies: true },
      });
      await Promise.all(
        books.map((b) =>
          prisma.book.update({
            where: { id: b.id },
            data:  {
              condition:       BookCondition.GOOD,
              withdrawnAt:     null,
              withdrawnReason: null,
              availableCopies: b.totalCopies,
            },
          }),
        ),
      );
      return NextResponse.json({ updated: books.length });
    }

    /* ── Send to repair ─────────────────────────────────────────── */
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

    /* ── Mark as inventoried (bulk) ─────────────────────────────── */
    case "inventory-mark": {
      const result = await prisma.book.updateMany({
        where: { id: { in: bookIds } },
        data:  { lastInventoryAt: new Date() },
      });
      return NextResponse.json({ updated: result.count });
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}
