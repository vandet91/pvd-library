import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { z } from "zod";

const updateSchema = z.object({
  name:   z.string().min(1).optional(),
  nameKm: z.string().optional().nullable(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body   = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const category = await prisma.category.update({ where: { id }, data: parsed.data });
    return NextResponse.json(category);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Update failed" }, { status: 400 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const [bookCount, ebookCount] = await Promise.all([
    prisma.book.count({  where: { categoryId: id } }),
    prisma.ebook.count({ where: { categoryId: id } }),
  ]);
  const inUse = bookCount + ebookCount;
  if (inUse > 0) {
    return NextResponse.json({
      error: `Cannot delete — category is used by ${bookCount} book${bookCount !== 1 ? "s" : ""}${ebookCount > 0 ? ` and ${ebookCount} ebook${ebookCount !== 1 ? "s" : ""}` : ""}`,
    }, { status: 409 });
  }

  await prisma.category.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
