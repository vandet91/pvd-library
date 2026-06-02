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
  const paginate   = searchParams.has("page");
  const pageParam  = parseInt(searchParams.get("page") || "1", 10) || 1;
  const limitParam = parseInt(searchParams.get("limit") || (paginate ? "20" : "100"), 10);
  const limit      = paginate ? Math.min(limitParam, 100) : Math.min(limitParam, 500);
  const skip       = paginate ? (pageParam - 1) * limit : 0;

  const orderBy = sort === "views"
    ? { views: "desc" as const }
    : { createdAt: "desc" as const };

  const where = {
    ...(q && { OR: [
      { title:  { contains: q, mode: "insensitive" as const } },
      { author: { name: { contains: q, mode: "insensitive" as const } } },
    ]}),
    ...(type       && { ebookType: type as "PDF"|"EPUB"|"LINK"|"VIDEO"|"AUDIO" }),
    ...(categoryId && { categoryId }),
  };

  const ebooks = await prisma.ebook.findMany({
    where,
    include: { category: true, author: true },
    orderBy,
    take: limit,
    skip,
  });

  const total = paginate ? await prisma.ebook.count({ where }) : null;

  // ── Attach avg rating (one groupBy query) ────────────────────────────
  const ebookIds = ebooks.map((e) => e.id);
  const ratingAggs = await prisma.rating.groupBy({
    by:    ["ebookId"],
    where: { ebookId: { in: ebookIds } },
    _avg:   { score: true },
    _count: { score: true },
  });
  const ratingMap = new Map(ratingAggs.map((r) => [
    r.ebookId,
    { avgRating: r._avg.score ? Math.round(r._avg.score * 10) / 10 : null, ratingCount: r._count.score },
  ]));

  // Strip fileUrl from protected ebooks unless the requester is an admin
  const sanitised = ebooks.map((e) => ({
    ...e,
    fileUrl: isAdmin || e.isPublic ? e.fileUrl : null,
    ...(ratingMap.get(e.id) ?? { avgRating: null, ratingCount: 0 }),
  }));

  if (paginate && total !== null) {
    return NextResponse.json({
      ebooks: sanitised,
      total,
      page:  pageParam,
      pages: Math.ceil(total / limit) || 1,
    });
  }
  return NextResponse.json(sanitised);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body   = await request.json();
  const parsed = ebookSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.errors.map((e) => e.message).join(", ") }, { status: 400 });

  const ebook = await prisma.ebook.create({
    data:    parsed.data,
    include: { category: true, author: true },
  });

  return NextResponse.json(ebook, { status: 201 });
}
