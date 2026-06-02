import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { z } from "zod";

const updateSchema = z.object({ name: z.string().min(1) });

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body   = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors.map((e) => e.message).join(", ") }, { status: 400 });

  try {
    const author = await prisma.author.update({ where: { id }, data: parsed.data });
    return NextResponse.json(author);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Update failed" }, { status: 400 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Block delete if author is in use (primary author OR co-author OR ebook author)
  const [primaryCount, coAuthorCount, ebookCount] = await Promise.all([
    prisma.book.count({  where: { authorId: id } }),
    prisma.book.count({  where: { coAuthors: { some: { id } } } }),
    prisma.ebook.count({ where: { authorId: id } }),
  ]);
  const inUse = primaryCount + coAuthorCount + ebookCount;
  if (inUse > 0) {
    return NextResponse.json({
      error: `Cannot delete — author is used by ${inUse} item${inUse > 1 ? "s" : ""} (${primaryCount} books as primary, ${coAuthorCount} as co-author, ${ebookCount} ebooks)`,
    }, { status: 409 });
  }

  await prisma.author.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
