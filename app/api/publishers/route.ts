import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { auth } from "@/lib/auth";

export async function GET() {
  const publishers = await prisma.publisher.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { books: true } } },
  });
  return NextResponse.json(publishers);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await request.json();
  if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });

  const publisher = await prisma.publisher.create({ data: { name: name.trim() } });
  return NextResponse.json(publisher, { status: 201 });
}
