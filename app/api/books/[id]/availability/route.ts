import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getBookAvailability } from "@/lib/book-availability";

/**
 * GET /api/books/[id]/availability — borrow & reservation queue snapshot.
 * Used by the catalog UI to show "available now / in queue / queue full" badges.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const data = await getBookAvailability(id);
  return NextResponse.json(data);
}
