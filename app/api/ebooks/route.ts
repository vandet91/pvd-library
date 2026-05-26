import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { auth } from "@/lib/auth";
import { z } from "zod";

const ebookSchema = z.object({
  title:       z.string().min(1),
  titleKm:     z.string().optional(),
  description: z.string().optional(),
  ebookType:   z.enum(["PDF", "EPUB", "LINK", "VIDEO", "AUDIO"]),
  fileUrl:     z.string().min(1, "File URL is required"),
  coverImage:  z.string().optional(),
  language:    z.string().optional().default("en"),
  publishYear: z.number().optional(),
  categoryId:  z.string().optional(),
  authorId:    z.string().optional(),
  bookId:      z.string().optional(),
  isPublic:    z.boolean().optional().default(true),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  const isAdmin = can(session?.user?.role, "LIBRARIAN");

  const { searchParams } = new URL(request.url);
  const q          = searchParams.get("q") || "";
  const type       = searchParams.get("type") || undefined;
  const categoryId = searchParams.get("categoryId") || undefined;
  const sort       = searchParams.get("sort") || "newest";
  const limit      = parseInt(searchParams.get("limit") || "100", 10);

  const orderBy = sort === "views"
    ? { views: "desc" as const }
    : { createdAt: "desc" as const };

  const ebooks = await prisma.ebook.findMany({
    where: {
      // Admins see everything; public users see public ebooks AND protected ones
      // (protected are shown in listing but their fileUrl is hidden)
      ...(isAdmin ? {} : {}),   // show all to everyone in listing
      ...(q && { OR: [
        { title:  { contains: q, mode: "insensitive" } },
        { author: { name: { contains: q, mode: "insensitive" } } },
      ]}),
      ...(type       && { ebookType: type as "PDF"|"EPUB"|"LINK"|"VIDEO"|"AUDIO" }),
      ...(categoryId && { categoryId }),
    },
    include: { category: true, author: true },
    orderBy,
    take: limit,
  });

  // Strip fileUrl from protected ebooks unless the requester is an admin
  const sanitised = ebooks.map((e) => ({
    ...e,
    fileUrl: isAdmin || e.isPublic ? e.fileUrl : null,
  }));

  return NextResponse.json(sanitised);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body   = await request.json();
  const parsed = ebookSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const ebook = await prisma.ebook.create({
    data:    parsed.data,
    include: { category: true, author: true },
  });

  return NextResponse.json(ebook, { status: 201 });
}
