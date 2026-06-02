import { NextRequest, NextResponse } from "next/server";
import { aiClient, AI_MODEL, AI_ENABLED } from "@/lib/ai-client";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

interface BookSummary {
  id: string;
  title: string;
  isbn: string | null;
  authorId: string | null;
  publishYear: number | null;
}

function normalizeIsbn(isbn: string) {
  return isbn.replace(/[-\s]/g, "").replace(/^978/, "");
}

function titlePrefix(title: string) {
  return title.toLowerCase().split(/\s+/).slice(0, 3).join(" ");
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!AI_ENABLED) {
    return NextResponse.json({ error: "AI not configured" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const PAGE_SIZE = 10;
  const MAX_GROUPS = 50;

  const books: BookSummary[] = await prisma.book.findMany({
    select: { id: true, title: true, isbn: true, authorId: true, publishYear: true },
    orderBy: { createdAt: "asc" },
  });

  // Group by stripped ISBN or by title prefix
  const isbnMap  = new Map<string, BookSummary[]>();
  const titleMap = new Map<string, BookSummary[]>();

  for (const book of books) {
    if (book.isbn) {
      const key = normalizeIsbn(book.isbn);
      if (!isbnMap.has(key)) isbnMap.set(key, []);
      isbnMap.get(key)!.push(book);
    } else {
      const key = titlePrefix(book.title);
      if (!titleMap.has(key)) titleMap.set(key, []);
      titleMap.get(key)!.push(book);
    }
  }

  const candidateGroups: BookSummary[][] = [];
  for (const group of isbnMap.values())  { if (group.length >= 2) candidateGroups.push(group); }
  for (const group of titleMap.values()) { if (group.length >= 2) candidateGroups.push(group); }

  const limitedGroups = candidateGroups.slice(0, MAX_GROUPS);
  const pageGroups    = limitedGroups.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Ask AI for each group
  const results = await Promise.all(pageGroups.map(async (group) => {
    const bookList = group.map((b) => `ID:${b.id} "${b.title}" (ISBN:${b.isbn ?? "N/A"}, Year:${b.publishYear ?? "?"})`)
      .join("\n");
    try {
      const completion = await aiClient.chat.completions.create({
        model: AI_MODEL,
        max_tokens: 200,
        messages: [
          {
            role: "system",
            content: 'You are a library deduplication assistant. Assess if these books are true duplicates or different editions. Respond with JSON: {"confidence":"high"|"medium"|"low","reason":"1 sentence"}',
          },
          { role: "user", content: `Are these the same book?\n${bookList}` },
        ],
      });
      const text  = completion.choices[0]?.message?.content ?? "";
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("No JSON");
      return { books: group, ...(JSON.parse(match[0]) as { confidence: string; reason: string }) };
    } catch {
      return { books: group, confidence: "low", reason: "Could not assess with AI." };
    }
  }));

  return NextResponse.json({
    groups:     results,
    total:      limitedGroups.length,
    page,
    pages:      Math.max(1, Math.ceil(limitedGroups.length / PAGE_SIZE)),
  });
}
