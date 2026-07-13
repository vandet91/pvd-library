import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { auth } from "@/lib/auth";
import { z } from "zod";

const schema = z.object({ name: z.string().min(1) });

export async function GET() {
  const authors = await prisma.author.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { books: true } } } });
  return NextResponse.json(authors);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((e) => e.message).join(", ") }, { status: 400 });

  const author = await prisma.author.create({ data: parsed.data });
  return NextResponse.json(author, { status: 201 });
}
