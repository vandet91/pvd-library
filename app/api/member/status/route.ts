import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

/** Returns the authenticated member's restriction status (used for portal banners). */
export async function GET() {
  const session = await auth();
  if (!session?.user?.email)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where:   { email: session.user.email },
    include: { member: { select: {
      restrictionStatus: true,
      restrictionReason: true,
      restrictionExpiry: true,
      restrictedAt:      true,
    }}},
  });

  if (!user?.member) return NextResponse.json({ restrictionStatus: "NONE" });

  return NextResponse.json({
    restrictionStatus: user.member.restrictionStatus,
    restrictionReason: user.member.restrictionReason,
    restrictionExpiry: user.member.restrictionExpiry,
    restrictedAt:      user.member.restrictedAt,
  });
}
