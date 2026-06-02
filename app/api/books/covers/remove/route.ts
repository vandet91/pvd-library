import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";

/**
 * POST /api/books/covers/remove
 * Body: { ids: string[] }
 * Clears coverImage for all given book IDs.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.ids) ? body.ids : [];

  if (ids.length === 0)
    return NextResponse.json({ removed: 0 });

  const { count } = await prisma.book.updateMany({
    where: { id: { in: ids } },
    data:  { coverImage: null },
  });

  return NextResponse.json({ removed: count });
}
