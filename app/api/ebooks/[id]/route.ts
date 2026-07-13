import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { auth } from "@/lib/auth";
import { z } from "zod";

const updateSchema = z.object({
  title:       z.string().min(1).optional(),
  titleKm:     z.string().optional(),
  description: z.string().optional(),
  ebookType:   z.enum(["PDF", "EPUB", "LINK", "VIDEO", "AUDIO"]).optional(),
  fileUrl:     z.string().min(1).optional(),
  coverImage:  z.string().optional(),
  language:    z.string().optional(),
  publishYear: z.number().optional(),
  categoryId:  z.string().optional(),
  authorId:    z.string().optional(),
  bookId:      z.string().nullable().optional(),
  isPublic:    z.boolean().optional(),
  views:       z.number().int().min(0).optional(),
});

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ebook = await prisma.ebook.findUnique({
    where: { id },
    include: { category: true, author: true },
  });
  if (!ebook) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // increment view count
  await prisma.ebook.update({ where: { id }, data: { views: { increment: 1 } } });

  return NextResponse.json(ebook);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id }  = await params;
  const body    = await request.json();
  const parsed  = updateSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues.map((e) => e.message).join(", ") }, { status: 400 });

  const ebook = await prisma.ebook.update({
    where:   { id },
    data:    parsed.data,
    include: { category: true, author: true },
  });
  return NextResponse.json(ebook);
}

export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await prisma.ebook.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
