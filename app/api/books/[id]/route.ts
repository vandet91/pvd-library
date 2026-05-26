import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { can } from "@/lib/rbac";

const MATERIAL_TYPES = ["BOOK", "MAGAZINE", "JOURNAL", "NEWSPAPER", "DVD", "AUDIO_CD", "THESIS", "MAP", "OTHER"] as const;

const bookUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  titleKm: z.string().optional(),
  subtitle: z.string().optional(),
  edition: z.string().optional(),
  isbn: z.string().optional(),
  description: z.string().optional(),
  coverImage: z.string().optional(),
  publishYear: z.number().optional(),
  pages: z.number().optional(),
  language: z.string().optional(),
  location: z.string().optional(),
  locationId: z.string().optional().nullable(),
  totalCopies: z.number().min(1).optional(),
  price: z.number().min(0).optional().nullable(),
  referenceOnly: z.boolean().optional(),
  materialType: z.enum(MATERIAL_TYPES).optional(),
  categoryId: z.string().optional(),
  authorId: z.string().optional(),
  coAuthorIds: z.array(z.string()).optional(),
  publisherId: z.string().optional(),
});

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const book = await prisma.book.findUnique({
    where: { id },
    include: { category: true, author: true, coAuthors: true, publisher: true, loans: { include: { member: true }, orderBy: { createdAt: "desc" }, take: 10 } },
  });
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(book);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const parsed = bookUpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // coAuthorIds is a relation — use `set` so the full list is replaced atomically
  const { coAuthorIds, locationId: locationIdFromForm, ...bookData } = parsed.data;

  // If locationId was sent directly from the form, use it; otherwise fall back to text-match
  let locationUpdate: { locationId: string | null } | object = {};
  if (locationIdFromForm !== undefined) {
    locationUpdate = { locationId: locationIdFromForm ?? null };
  } else if (bookData.location !== undefined) {
    if (!bookData.location.trim()) {
      locationUpdate = { locationId: null };
    } else {
      const found = await prisma.location.findFirst({
        where:  { name: { equals: bookData.location.trim(), mode: "insensitive" } },
        select: { id: true },
      });
      locationUpdate = { locationId: found?.id ?? null };
    }
  }

  const book = await prisma.book.update({
    where: { id },
    data: {
      ...bookData,
      ...locationUpdate,
      ...(coAuthorIds !== undefined && {
        coAuthors: { set: coAuthorIds.map((cid) => ({ id: cid })) },
      }),
    },
    include: { category: true, author: true, coAuthors: true },
  });
  return NextResponse.json(book);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await prisma.book.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
