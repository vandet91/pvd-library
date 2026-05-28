import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

/**
 * GET /api/ratings?bookId=X   OR   ?ebookId=X
 * Returns aggregate + the requesting member's own rating (if logged in).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const bookId  = searchParams.get("bookId")  || undefined;
  const ebookId = searchParams.get("ebookId") || undefined;

  if (!bookId && !ebookId)
    return NextResponse.json({ error: "bookId or ebookId required" }, { status: 400 });

  const where = bookId ? { bookId } : { ebookId };

  const [agg, ratings] = await Promise.all([
    prisma.rating.aggregate({
      where,
      _avg:   { score: true },
      _count: { score: true },
    }),
    prisma.rating.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true, score: true, review: true, createdAt: true,
        member: { select: { id: true, name: true } },
      },
    }),
  ]);

  // If the caller is a logged-in member, include their own rating
  let myRating: { id: string; score: number; review: string | null } | null = null;
  const session = await auth();
  if (session?.user?.id) {
    const member = await prisma.member.findUnique({
      where:  { userId: session.user.id },
      select: { id: true },
    });
    if (member) {
      const own = await prisma.rating.findFirst({
        where: { ...where, memberId: member.id },
        select: { id: true, score: true, review: true },
      });
      myRating = own ?? null;
    }
  }

  return NextResponse.json({
    avg:      agg._avg.score   ? Math.round(agg._avg.score * 10) / 10 : null,
    count:    agg._count.score,
    ratings,
    myRating,
  });
}

/**
 * POST /api/ratings
 * Upsert (create or update) the requesting member's rating.
 * Body: { bookId?, ebookId?, score: 1-5, review? }
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Login required" }, { status: 401 });

  const member = await prisma.member.findUnique({
    where:  { userId: session.user.id },
    select: { id: true },
  });
  if (!member)
    return NextResponse.json({ error: "Member profile not found" }, { status: 403 });

  const body = await request.json() as {
    bookId?: string; ebookId?: string; score: number; review?: string;
  };
  const { bookId, ebookId, score, review } = body;

  if (!bookId && !ebookId)
    return NextResponse.json({ error: "bookId or ebookId required" }, { status: 400 });
  if (!score || score < 1 || score > 5)
    return NextResponse.json({ error: "score must be 1–5" }, { status: 400 });

  // Upsert: one rating per member per item
  let rating;
  if (bookId) {
    rating = await prisma.rating.upsert({
      where:  { memberId_bookId: { memberId: member.id, bookId } },
      create: { memberId: member.id, bookId, score, review: review ?? null },
      update: { score, review: review ?? null },
    });
  } else {
    rating = await prisma.rating.upsert({
      where:  { memberId_ebookId: { memberId: member.id, ebookId: ebookId! } },
      create: { memberId: member.id, ebookId: ebookId!, score, review: review ?? null },
      update: { score, review: review ?? null },
    });
  }

  return NextResponse.json(rating, { status: 201 });
}
