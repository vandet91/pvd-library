import { NextRequest, NextResponse } from "next/server";
import { aiClient, AI_MODEL, AI_ENABLED } from "@/lib/ai-client";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!AI_ENABLED) {
    return NextResponse.json({ error: "AI not configured" }, { status: 503 });
  }

  const { id } = await params;

  // Fetch last 10 loans with book info
  const loans = await prisma.loan.findMany({
    where: { memberId: id },
    orderBy: { borrowDate: "desc" },
    take: 10,
    include: {
      book: {
        select: {
          title: true,
          audienceLevel: true,
          category: { select: { name: true } },
          author:   { select: { name: true } },
        },
      },
    },
  });

  if (loans.length === 0) {
    return NextResponse.json({ recommendations: [], basedOn: [] });
  }

  const loanSummary = loans.map((l) =>
    `"${l.book.title}" by ${l.book.author?.name ?? "Unknown"} (Category: ${l.book.category?.name ?? "None"}, Audience: ${l.book.audienceLevel})`
  ).join("\n");

  let themes: string[] = [];
  try {
    const completion = await aiClient.chat.completions.create({
      model: AI_MODEL,
      max_tokens: 400,
      messages: [
        {
          role: "system",
          content: 'Based on a member\'s reading history, suggest 5 book themes/topics they would enjoy. Respond only with JSON: {"themes":["theme1","theme2","theme3","theme4","theme5"]}',
        },
        {
          role: "user",
          content: `Member's recent reading:\n${loanSummary}`,
        },
      ],
    });
    const text  = completion.choices[0]?.message?.content ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]) as { themes?: string[] };
      themes = parsed.themes ?? [];
    }
  } catch {
    return NextResponse.json({ error: "AI error" }, { status: 500 });
  }

  // Semantic search: find books matching each theme
  const alreadyReadIds = new Set(loans.map((l) => l.bookId));
  const bookSets: Map<string, { book: Record<string, unknown>; reason: string }> = new Map();

  for (const theme of themes.slice(0, 5)) {
    const matches = await prisma.book.findMany({
      where: {
        OR: [
          { title:       { contains: theme, mode: "insensitive" } },
          { description: { contains: theme, mode: "insensitive" } },
          { category:    { name: { contains: theme, mode: "insensitive" } } },
        ],
        id: { notIn: [...alreadyReadIds] },
        availableCopies: { gt: 0 },
      },
      take: 3,
      select: {
        id: true, title: true, isbn: true, coverImage: true, publishYear: true,
        author:   { select: { name: true } },
        category: { select: { name: true } },
      },
    });
    for (const book of matches) {
      if (!bookSets.has(book.id)) {
        bookSets.set(book.id, { book: book as unknown as Record<string, unknown>, reason: `Matches theme: ${theme}` });
      }
    }
    if (bookSets.size >= 5) break;
  }

  const recommendations = [...bookSets.values()].slice(0, 5);
  return NextResponse.json({ recommendations, basedOn: themes });
}
