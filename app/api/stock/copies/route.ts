import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { CopyStatus } from "@prisma/client";

/**
 * GET /api/stock/copies
 *   ?status=STOCK   (default) | FOR_SALE | AVAILABLE
 * Returns BookCopy records with the given status, including book info.
 * Used by:
 *   - Deploy modal: lists STOCK copies to deploy
 *   - For Sale Inventory panel: lists FOR_SALE copies for price management
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const rawStatus = searchParams.get("status") ?? "STOCK";

  // Validate status value
  const validStatuses: CopyStatus[] = ["STOCK", "AVAILABLE", "FOR_SALE", "BORROWED", "RESERVED", "SOLD", "LOST", "DAMAGED", "WITHDRAWN"];
  const status: CopyStatus = validStatuses.includes(rawStatus as CopyStatus)
    ? (rawStatus as CopyStatus)
    : "STOCK";

  const copies = await prisma.bookCopy.findMany({
    where:   { status },
    include: {
      book: {
        select: {
          id: true, title: true, isbn: true,
          author: { select: { name: true } },
        },
      },
    },
    orderBy: [{ book: { title: "asc" } }, { copyNumber: "asc" }],
  });

  return NextResponse.json(copies);
}
