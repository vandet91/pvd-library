import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";

/**
 * GET /api/stock/copies
 * Returns all BookCopy records with status = STOCK, including book info.
 * Used by the Deploy modal to list selectable copies.
 */
export async function GET() {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const copies = await prisma.bookCopy.findMany({
    where:   { status: "STOCK" },
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
