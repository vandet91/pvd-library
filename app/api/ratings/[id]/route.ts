import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

/**
 * DELETE /api/ratings/[id]
 * A member can only delete their own rating.
 */
export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Login required" }, { status: 401 });

  const member = await prisma.member.findUnique({
    where:  { userId: session.user.id },
    select: { id: true },
  });
  if (!member)
    return NextResponse.json({ error: "Member profile not found" }, { status: 403 });

  const rating = await prisma.rating.findUnique({ where: { id } });
  if (!rating) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (rating.memberId !== member.id)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.rating.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
