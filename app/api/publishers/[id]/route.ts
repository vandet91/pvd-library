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
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((e) => e.message).join(", ") }, { status: 400 });

  try {
    const publisher = await prisma.publisher.update({ where: { id }, data: parsed.data });
    return NextResponse.json(publisher);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Update failed" }, { status: 400 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const bookCount = await prisma.book.count({ where: { publisherId: id } });
  if (bookCount > 0) {
    return NextResponse.json({
      error: `Cannot delete — publisher is used by ${bookCount} book${bookCount !== 1 ? "s" : ""}`,
    }, { status: 409 });
  }

  await prisma.publisher.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
