import { NextRequest, NextResponse } from "next/server";
import { aiClient, AI_MODEL, AI_ENABLED } from "@/lib/ai-client";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import type OpenAI from "openai";

/* ── Request schema ─────────────────────────────────────────────────────── */
const messageSchema = z.object({
  role:    z.enum(["user", "assistant"]),
  content: z.string().max(2000),
});

const bodySchema = z.object({
  messages: z.array(messageSchema).min(1).max(20),
  mode:     z.enum(["book", "ebook"]).optional().default("book"),
});

/* ── System prompts ─────────────────────────────────────────────────────── */
const SYSTEM_PROMPT = `You are a friendly library assistant for PVD Library.
Help members find both physical books and digital resources (E-Library).

You have five tools available — use them for ALL data questions, never guess:
- search_books: find physical books by title, author, topic, category, language, or availability
- search_ebooks: find digital resources (PDFs, EPUBs, videos, audio, links) in the E-Library
- get_trending_books: top borrowed physical books over a time period ("trending", "popular", "most read")
- get_new_arrivals: recently added physical books ("new books", "latest arrivals", "added this week")
- get_collection_stats: overall library numbers ("how many books", "total members", "statistics")

Use search_ebooks when the user asks about: PDFs, ebooks, e-books, digital resources, videos, audio, online resources, the E-Library, or links.
Use search_books for physical books, borrowing, availability, or general book searches.

Respond in the same language the user writes in (English or Khmer ភាសាខ្មែរ).
Be concise and friendly. For digital resources, mention the type (PDF, EPUB, Video, Audio, Link) and whether it is free or requires login.
If no results match, suggest trying different keywords or a broader search.`;

const EBOOK_SYSTEM_PROMPT = `You are a friendly digital library assistant for PVD Library's e-Library.
Help members find ebooks, PDFs, videos, audio, and other digital resources.
ALWAYS use the search_ebooks tool when asked about any digital resource — never guess titles or availability.
Respond in the same language the user writes in (English or Khmer ភាសាខ្មែរ).
Be concise and friendly. Mention the resource type (PDF, EPUB, Video, Audio, Link) in your reply.
If no results match, suggest trying different keywords or browsing by category.`;

/* ── Tool definitions ───────────────────────────────────────────────────── */
const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name:        "search_books",
      description: "Search the library catalog by title, author, topic, ISBN, category, language, or availability.",
      parameters: {
        type:       "object",
        properties: {
          query: {
            type:        "string",
            description: "Keywords — book title, author name, topic, or ISBN",
          },
          category: {
            type:        "string",
            description: "Filter by category name (e.g. History, Science, Fiction)",
          },
          language: {
            type:        "string",
            description: "Filter by language (e.g. Khmer, English, French)",
          },
          available: {
            type:        "boolean",
            description: "Set true to return only books currently available for borrowing",
          },
          limit: {
            type:        "number",
            description: "Max results to return (default 5, max 10)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name:        "get_trending_books",
      description: "Get the most borrowed / trending books over a recent time window. Use for questions like 'what's popular this month', 'trending books', 'most read books this week'.",
      parameters: {
        type:       "object",
        properties: {
          days: {
            type:        "number",
            description: "How many past days to look at. 7 = this week, 30 = this month, 90 = last 3 months. Default 30.",
          },
          limit: {
            type:        "number",
            description: "Number of top books to return. Default 5, max 10.",
          },
          category: {
            type:        "string",
            description: "Optional: filter to a specific category (e.g. Fiction, Science)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name:        "get_new_arrivals",
      description: "Get recently added books. Use for questions like 'new books this week', 'latest arrivals', 'what's new in the library'.",
      parameters: {
        type:       "object",
        properties: {
          days: {
            type:        "number",
            description: "How many past days to look back. 7 = this week, 30 = this month. Default 30.",
          },
          limit: {
            type:        "number",
            description: "Number of books to return. Default 5, max 10.",
          },
          category: {
            type:        "string",
            description: "Optional: filter to a specific category",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name:        "get_collection_stats",
      description: "Get overall library statistics. Use for questions like 'how many books do you have', 'total members', 'library overview', 'collection size'.",
      parameters: {
        type:       "object",
        properties: {},
        required:   [],
      },
    },
  },
];

/* ── Ebook tool definition ──────────────────────────────────────────────── */
const EBOOK_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name:        "search_ebooks",
      description: "Search the digital library (ebooks, PDFs, videos, audio, links). Use for ANY question about digital resources.",
      parameters: {
        type:       "object",
        properties: {
          query: {
            type:        "string",
            description: "Keywords — title, author, topic",
          },
          category: {
            type:        "string",
            description: "Filter by category name (e.g. History, Science, Fiction)",
          },
          language: {
            type:        "string",
            description: "Filter by language (e.g. Khmer, English)",
          },
          ebookType: {
            type:        "string",
            description: "Filter by type: PDF, EPUB, VIDEO, AUDIO, or LINK",
          },
          publicOnly: {
            type:        "boolean",
            description: "Set true to return only free/public resources (no login required)",
          },
          limit: {
            type:        "number",
            description: "Max results (default 5, max 10)",
          },
        },
        required: [],
      },
    },
  },
];

/* ── Shared result types ────────────────────────────────────────────────── */
interface BookResult {
  id:              string;
  title:           string;
  author:          string;
  category:        string;
  language:        string;
  availableCopies: number;
  totalCopies:     number;
  isbn:            string | null;
}

/* ── Tool: search_books ─────────────────────────────────────────────────── */
async function runSearchBooks(args: {
  query?:    string;
  category?: string;
  language?: string;
  available?: boolean;
  limit?:    number;
}): Promise<{ count: number; books: BookResult[] }> {
  const { query, category, language, available, limit } = args;

  let categoryId: string | undefined;
  if (category?.trim()) {
    const cat = await prisma.category.findFirst({
      where:  { name: { contains: category.trim(), mode: "insensitive" } },
      select: { id: true },
    });
    categoryId = cat?.id;
  }

  const books = await prisma.book.findMany({
    where: {
      ...(query?.trim() && {
        OR: [
          { title:       { contains: query.trim(), mode: "insensitive" } },
          { isbn:        { contains: query.trim(), mode: "insensitive" } },
          { description: { contains: query.trim(), mode: "insensitive" } },
          { titleKm:     { contains: query.trim(), mode: "insensitive" } },
          { author:      { name: { contains: query.trim(), mode: "insensitive" } } },
        ],
      }),
      ...(categoryId && { categoryId }),
      ...(language?.trim() && { language: { contains: language.trim(), mode: "insensitive" } }),
      ...(available === true && { availableCopies: { gt: 0 } }),
    },
    include: {
      author:   { select: { name: true } },
      category: { select: { name: true } },
    },
    orderBy: [{ availableCopies: "desc" }, { createdAt: "desc" }],
    take:    Math.min(limit ?? 5, 10),
  });

  return {
    count: books.length,
    books: books.map((b) => ({
      id:              b.id,
      title:           b.title,
      author:          b.author?.name ?? "Unknown",
      category:        b.category?.name ?? "Uncategorized",
      language:        b.language ?? "Unknown",
      availableCopies: b.availableCopies,
      totalCopies:     b.totalCopies,
      isbn:            b.isbn,
    })),
  };
}

/* ── Tool: get_trending_books ───────────────────────────────────────────── */
async function runGetTrendingBooks(args: {
  days?:     number;
  limit?:    number;
  category?: string;
}): Promise<{ period: string; count: number; books: (BookResult & { borrowCount: number })[] }> {
  const days  = Math.min(Math.max(args.days ?? 30, 1), 365);
  const limit = Math.min(args.limit ?? 5, 10);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Optional category filter
  let categoryId: string | undefined;
  if (args.category?.trim()) {
    const cat = await prisma.category.findFirst({
      where:  { name: { contains: args.category.trim(), mode: "insensitive" } },
      select: { id: true },
    });
    categoryId = cat?.id;
  }

  // Group loans directly by bookId (Loan has bookId field, borrowDate for the date)
  const loanCounts = await prisma.loan.groupBy({
    by:      ["bookId"],
    where:   { borrowDate: { gte: since } },
    _count:  { bookId: true },
    orderBy: { _count: { bookId: "desc" } },
    take:    limit,
  });

  if (loanCounts.length === 0) {
    return { period: `last ${days} days`, count: 0, books: [] };
  }

  const bookCountMap = new Map(loanCounts.map((l) => [l.bookId, l._count.bookId]));
  const topBookIds   = loanCounts.map((l) => l.bookId);

  const books = await prisma.book.findMany({
    where: {
      id: { in: topBookIds },
      ...(categoryId && { categoryId }),
    },
    include: {
      author:   { select: { name: true } },
      category: { select: { name: true } },
    },
  });

  // Preserve rank order from loanCounts
  const sorted = topBookIds
    .map((id) => books.find((b) => b.id === id))
    .filter(Boolean) as typeof books;

  return {
    period: `last ${days} days`,
    count:  sorted.length,
    books:  sorted.map((b) => ({
      id:              b.id,
      title:           b.title,
      author:          b.author?.name ?? "Unknown",
      category:        b.category?.name ?? "Uncategorized",
      language:        b.language ?? "Unknown",
      availableCopies: b.availableCopies,
      totalCopies:     b.totalCopies,
      isbn:            b.isbn,
      borrowCount:     bookCountMap.get(b.id) ?? 0,
    })),
  };
}

/* ── Tool: get_new_arrivals ─────────────────────────────────────────────── */
async function runGetNewArrivals(args: {
  days?:     number;
  limit?:    number;
  category?: string;
}): Promise<{ period: string; count: number; books: BookResult[] }> {
  const days  = Math.min(Math.max(args.days ?? 30, 1), 365);
  const limit = Math.min(args.limit ?? 5, 10);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  let categoryId: string | undefined;
  if (args.category?.trim()) {
    const cat = await prisma.category.findFirst({
      where:  { name: { contains: args.category.trim(), mode: "insensitive" } },
      select: { id: true },
    });
    categoryId = cat?.id;
  }

  const books = await prisma.book.findMany({
    where: {
      createdAt: { gte: since },
      ...(categoryId && { categoryId }),
    },
    include: {
      author:   { select: { name: true } },
      category: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take:    limit,
  });

  return {
    period: `last ${days} days`,
    count:  books.length,
    books:  books.map((b) => ({
      id:              b.id,
      title:           b.title,
      author:          b.author?.name ?? "Unknown",
      category:        b.category?.name ?? "Uncategorized",
      language:        b.language ?? "Unknown",
      availableCopies: b.availableCopies,
      totalCopies:     b.totalCopies,
      isbn:            b.isbn,
    })),
  };
}

/* ── Tool: get_collection_stats ─────────────────────────────────────────── */
async function runGetCollectionStats(): Promise<{
  totalBooks:       number;
  totalCopies:      number;
  availableCopies:  number;
  totalMembers:     number;
  activeLoans:      number;
  overdueLoans:     number;
  totalCategories:  number;
}> {
  const now = new Date();

  const [
    totalBooks,
    totalCopies,
    availableCopies,
    totalMembers,
    activeLoans,
    overdueLoans,
    totalCategories,
  ] = await Promise.all([
    prisma.book.count(),
    prisma.bookCopy.count(),
    prisma.bookCopy.count({ where: { status: "AVAILABLE" } }),
    prisma.member.count({ where: { isActive: true } }),
    prisma.loan.count({ where: { status: "ACTIVE" } }),
    prisma.loan.count({ where: { status: "OVERDUE" } }),
    prisma.category.count(),
  ]);

  return {
    totalBooks,
    totalCopies,
    availableCopies,
    totalMembers,
    activeLoans,
    overdueLoans,
    totalCategories,
  };
}

/* ── Tool: search_ebooks ────────────────────────────────────────────────── */
interface EbookResult {
  id:          string;
  title:       string;
  author:      string;
  category:    string;
  ebookType:   string;
  language:    string;
  isPublic:    boolean;
  views:       number;
}

async function runSearchEbooks(args: {
  query?:      string;
  category?:   string;
  language?:   string;
  ebookType?:  string;
  publicOnly?: boolean;
  limit?:      number;
}): Promise<{ count: number; ebooks: EbookResult[] }> {
  const { query, category, language, ebookType, publicOnly, limit } = args;

  let categoryId: string | undefined;
  if (category?.trim()) {
    const cat = await prisma.category.findFirst({
      where:  { name: { contains: category.trim(), mode: "insensitive" } },
      select: { id: true },
    });
    categoryId = cat?.id;
  }

  const ebooks = await prisma.ebook.findMany({
    where: {
      ...(query?.trim() && {
        OR: [
          { title:       { contains: query.trim(), mode: "insensitive" } },
          { titleKm:     { contains: query.trim(), mode: "insensitive" } },
          { description: { contains: query.trim(), mode: "insensitive" } },
          { author:      { name: { contains: query.trim(), mode: "insensitive" } } },
        ],
      }),
      ...(categoryId && { categoryId }),
      ...(language?.trim() && { language: { contains: language.trim(), mode: "insensitive" } }),
      ...(ebookType?.trim() && { ebookType: ebookType.trim().toUpperCase() as never }),
      ...(publicOnly === true && { isPublic: true }),
    },
    include: {
      author:   { select: { name: true } },
      category: { select: { name: true } },
    },
    orderBy: { views: "desc" },
    take:    Math.min(limit ?? 5, 10),
  });

  return {
    count:  ebooks.length,
    ebooks: ebooks.map((e) => ({
      id:        e.id,
      title:     e.title,
      author:    e.author?.name ?? "Unknown",
      category:  e.category?.name ?? "Uncategorized",
      ebookType: e.ebookType,
      language:  e.language ?? "Unknown",
      isPublic:  e.isPublic,
      views:     e.views,
    })),
  };
}

/* ── Safe argument parser (DeepSeek may return null / "" for no-arg tools) ─ */
function safeParseArgs(raw: string | null | undefined): Record<string, unknown> {
  if (!raw || raw.trim() === "") return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/* ── Retry helper (handles 429 rate-limit from free-tier providers) ─────── */
async function callWithRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  baseDelayMs = 2000,
): Promise<T> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      if (status === 429 && attempt < retries - 1) {
        // Exponential back-off: 2 s, 4 s, 8 s
        await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** attempt));
        continue;
      }
      throw err;
    }
  }
  /* unreachable, but satisfies TS */
  throw new Error("Max retries reached");
}

/* ── POST /api/search/chat ──────────────────────────────────────────────── */
export async function POST(request: NextRequest) {
  if (!AI_ENABLED) {
    return NextResponse.json(
      { error: "AI search is not configured. Add AI_API_KEY to your .env file." },
      { status: 503 },
    );
  }

  // Check if member AI search is disabled in settings
  const aiSetting = await prisma.settings.findUnique({ where: { key: "AI_SEARCH_MEMBER" } });
  if (aiSetting?.value === "false") {
    return NextResponse.json(
      { error: "AI search has been disabled." },
      { status: 403 },
    );
  }

  const body   = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const isEbookMode = parsed.data.mode === "ebook";

  const userMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: isEbookMode ? EBOOK_SYSTEM_PROMPT : SYSTEM_PROMPT },
    ...parsed.data.messages,
  ];

  try {
    // book mode gets ALL tools (physical + digital); ebook mode stays ebook-only
    const activeTools = isEbookMode ? EBOOK_TOOLS : [...TOOLS, ...EBOOK_TOOLS];

    /* ── Round 1: AI may respond directly OR call tools ── */
    const round1 = await callWithRetry(() =>
      aiClient.chat.completions.create({
        model:       AI_MODEL,
        messages:    userMessages,
        tools:       activeTools,
        tool_choice: "auto",
        max_tokens:  1024,
      }),
    );

    const msg1 = round1.choices[0]?.message;
    if (!msg1) throw new Error("Empty response from AI");

    /* ── No tool call — return text directly ── */
    if (!msg1.tool_calls || msg1.tool_calls.length === 0) {
      return NextResponse.json({ reply: msg1.content ?? "", books: [] });
    }

    /* ── Execute all tool calls ── */
    const toolResultMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
    let lastBooks: BookResult[] = [];

    // Push assistant's tool-call message first
    toolResultMessages.push(msg1);

    for (const tc of msg1.tool_calls as { id: string; function: { name: string; arguments: string } }[]) {
      let result: unknown;
      const args = safeParseArgs(tc.function.arguments);

      switch (tc.function.name) {
        case "search_ebooks":
          {
            const data = await runSearchEbooks(args);
            // Map ebooks into BookResult shape so the chat UI can render cards
            lastBooks = data.ebooks.map((e) => ({
              id:              e.id,
              title:           e.title,
              author:          e.author,
              category:        `${e.category} · ${e.ebookType}`,
              language:        e.language,
              availableCopies: e.isPublic ? 1 : 0,
              totalCopies:     1,
              isbn:            null,
            }));
            result = data;
          }
          break;

        case "search_books":
          {
            const data = await runSearchBooks(args);
            lastBooks  = data.books;
            result     = data;
          }
          break;

        case "get_trending_books":
          {
            const data = await runGetTrendingBooks(args);
            lastBooks  = data.books;
            result     = data;
          }
          break;

        case "get_new_arrivals":
          {
            const data = await runGetNewArrivals(args);
            lastBooks  = data.books;
            result     = data;
          }
          break;

        case "get_collection_stats":
          result = await runGetCollectionStats();
          break;

        default:
          result = { error: "Unknown tool" };
      }

      toolResultMessages.push({
        role:         "tool",
        tool_call_id: tc.id,
        content:      JSON.stringify(result),
      });
    }

    /* ── Round 2: AI reads tool results and writes final reply ── */
    const round2 = await callWithRetry(() =>
      aiClient.chat.completions.create({
        model:      AI_MODEL,
        messages:   [...userMessages, ...toolResultMessages],
        max_tokens: 1024,
      }),
    );

    const finalText = round2.choices[0]?.message?.content ?? "";
    return NextResponse.json({ reply: finalText, books: lastBooks });

  } catch (err: unknown) {
    console.error("[AI Search]", err);
    const status = (err as { status?: number })?.status;
    if (status === 429) {
      return NextResponse.json(
        { error: "The AI service is busy right now (rate limit). Please wait a moment and try again." },
        { status: 429 },
      );
    }
    const message = err instanceof Error ? err.message : "AI request failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
