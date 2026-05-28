import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "STAFF"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status   = searchParams.get("status") as "PAID" | "UNPAID" | "WAIVED" | null;
  const memberId = searchParams.get("memberId") || undefined;
  const search   = searchParams.get("search")?.trim() || undefined;

  const fines = await prisma.fine.findMany({
    where: {
      ...(status   ? { status }   : {}),
      ...(memberId ? { memberId } : {}),
      ...(search   ? {
        OR: [
          { member: { name:     { contains: search, mode: "insensitive" } } },
          { member: { memberId: { contains: search, mode: "insensitive" } } },
        ],
      } : {}),
    },
    include: {
      member: true,
      loan: { include: { book: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(fines);
}
