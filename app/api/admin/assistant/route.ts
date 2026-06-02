import { NextRequest, NextResponse } from "next/server";
import { aiClient, AI_MODEL, AI_ENABLED } from "@/lib/ai-client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { z } from "zod";
import type OpenAI from "openai";

/* ── Schema ─────────────────────────────────────────────────────────────── */
const bodySchema = z.object({
  messages: z.array(z.object({
    role:    z.enum(["user", "assistant"]),
    content: z.string().max(3000),
  })).min(1).max(30),
});

/* ── System prompt ───────────────────────────────────────────────────────── */
const SYSTEM_PROMPT = `You are an AI library administration assistant for PVD Library.
You help librarians and staff manage the collection, track operations, and get actionable insights.

ALWAYS use the available tools to get real data — never guess or make up numbers.

Available tools:
- search_books: Find books by title, author, topic, category, language, availability
- get_trending_books: Most borrowed books over a time period (week/month/quarter)
- get_new_arrivals: Recently added books
- get_collection_stats: Overall collection numbers and statistics
- get_processing_queue: Books awaiting physical processing — unlabeled basket items, copies without barcodes, or copies where the spine label has not been applied (labelPrinted=false)
- get_weeding_candidates: Books to consider removing — poor condition, long unused, or never borrowed
- get_acquisition_suggestions: Books to buy more copies of — high demand, understocked, or member requests
- get_member_risk_report: Members with overdue loans, unpaid fines, or discipline incidents
- get_daily_briefing: Morning summary — overdue loans, new checkouts today, unpaid fines, processing queue, expiring memberships, pending reservations. Use for "daily briefing", "morning report", "what's urgent today", "summary"
- lookup_member: Find a specific member by name, email, phone, or member ID — shows their current loans, overdue books, fines, and reservations. Use for "find member", "member info", "check member", "show loans for"
- get_overdue_report: Detailed list of overdue loans with days late, member contact info, and fine status. Use for "overdue", "late returns", "who hasn't returned"
- get_expiring_memberships: Members whose membership expires within N days. Use for "expiring membership", "renewal reminder", "membership expires"
- get_reservation_pipeline: Status breakdown of all reservations — pending approval, approved (book to be pulled), ready on hold shelf. Use for "reservations", "hold shelf", "books to pull", "waiting list"
- get_fine_report: Fine collection summary — total unpaid, by member, or largest amounts. Use for "fines", "unpaid fines", "how much owed", "fine collection"
- get_idle_members: Active members who haven't borrowed in N months. Use for "inactive members", "dormant members", "who hasn't visited"
- get_low_stock_alert: Books with very few available copies — helps prioritise acquisition. Use for "low stock", "unavailable books", "need more copies", "popular unavailable"
- create_staff_task: Create an actionable to-do item for the library staff task board. Use whenever the user or data implies something that needs to be done later — e.g. "remind me to follow up", "add this to our list", "track this", or when you find issues worth flagging (overdue members to contact, books to process, etc.)

Be concise, professional, and actionable.
Format results as clean lists with key details.
After showing data, always suggest what action the librarian should take next.
Respond in the same language the user writes in (English or Khmer ភាសាខ្មែរ).`;

/* ── Tool definitions ────────────────────────────────────────────────────── */
const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_books",
      description: "Search the library catalog by title, author, topic, ISBN, category, language, or availability.",
      parameters: {
        type: "object",
        properties: {
          query:    { type: "string",  description: "Keywords — title, author, topic, or ISBN" },
          category: { type: "string",  description: "Filter by category name" },
          language: { type: "string",  description: "Filter by language" },
          available:{ type: "boolean", description: "Only books currently available for borrowing" },
          limit:    { type: "number",  description: "Max results (default 8, max 15)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_trending_books",
      description: "Get the most borrowed books over a recent period. Use for 'trending', 'popular', 'most read'.",
      parameters: {
        type: "object",
        properties: {
          days:     { type: "number", description: "Past days: 7=week, 30=month, 90=quarter. Default 30." },
          limit:    { type: "number", description: "Number of results. Default 10, max 20." },
          category: { type: "string", description: "Optional category filter." },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_new_arrivals",
      description: "Get recently added books. Use for 'new books', 'latest arrivals', 'added this week'.",
      parameters: {
        type: "object",
        properties: {
          days:     { type: "number", description: "Past days to look back. Default 30." },
          limit:    { type: "number", description: "Max results. Default 10." },
          category: { type: "string", description: "Optional category filter." },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_collection_stats",
      description: "Overall library statistics — total books, copies, members, active loans, overdue count.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_processing_queue",
      description: "Get books awaiting physical processing. Use for 'unlabeled books', 'no barcode', 'needs label', 'label not applied', 'processing queue', 'books to tag', 'spine label'.",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            description: "'untagged' = basket items not labeled yet, 'no_barcode' = copies with no barcode/RFID, 'unlabeled_copies' = copies where spine label not physically applied (labelPrinted=false), 'all' = all three (default)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_weeding_candidates",
      description: "Get books to consider removing from the collection. Use for 'weeding', 'withdraw', 'deaccession', 'old unused books', 'damaged books', 'never borrowed'.",
      parameters: {
        type: "object",
        properties: {
          reason: {
            type: "string",
            description: "'poor_condition' = POOR/DAMAGED/FAIR condition, 'dormant' = not borrowed in 2+ years, 'never_borrowed' = never borrowed since added 1+ year ago, 'all' = all (default 'all')",
          },
          dormantDays: { type: "number", description: "Days threshold for dormant books. Default 730." },
          limit:       { type: "number", description: "Max results per type. Default 10." },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_acquisition_suggestions",
      description: "Get books to acquire or order more copies of. Use for 'buy more', 'acquisition', 'understocked', 'popular unavailable', 'member requests', 'what to order'.",
      parameters: {
        type: "object",
        properties: {
          focus: {
            type: "string",
            description: "'high_demand' = pending reservations with 0 copies, 'understocked' = popular but few copies, 'requests' = member purchase requests, 'all' = all (default)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_member_risk_report",
      description: "Get members with risk indicators. Use for 'at-risk members', 'overdue members', 'problem members', 'members with fines', 'discipline'.",
      parameters: {
        type: "object",
        properties: {
          filter: {
            type: "string",
            description: "'overdue' = overdue loans, 'fines' = unpaid fines, 'incidents' = discipline incidents, 'restricted' = restricted accounts, 'all' = all (default)",
          },
          limit: { type: "number", description: "Max results. Default 15." },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_daily_briefing",
      description: "Morning summary of all urgent library operations. Covers overdue loans, new checkouts today, unpaid fines, processing queue, expiring memberships, and pending reservations. Use for 'morning briefing', 'daily summary', 'what needs attention', 'urgent today'.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "lookup_member",
      description: "Find a specific member by name, email, phone, or member ID. Returns their active loans, overdue books, unpaid fines, and pending reservations. Use for 'find member', 'check member', 'member info', 'show loans for [name]'.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Member name, email, phone, or member ID to search for." },
          limit: { type: "number", description: "Max results. Default 5." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_overdue_report",
      description: "Detailed list of overdue loans with how many days late, member contact info, and accrued fine status. Use for 'overdue report', 'late returns', 'who hasn't returned', 'long overdue'.",
      parameters: {
        type: "object",
        properties: {
          minDaysLate: { type: "number", description: "Minimum days late to include. Default 0 (all overdue)." },
          limit:       { type: "number", description: "Max results. Default 20." },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_expiring_memberships",
      description: "Members whose membership expires within N days. Use for 'expiring memberships', 'renewal reminder', 'membership expires soon'.",
      parameters: {
        type: "object",
        properties: {
          days:  { type: "number", description: "Days ahead to look. Default 30, max 365." },
          limit: { type: "number", description: "Max results. Default 20." },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_reservation_pipeline",
      description: "Status breakdown of reservations — pending approval, approved (book to be pulled from shelf), or ready on hold shelf for pickup. Use for 'reservations', 'hold shelf', 'books to pull', 'awaiting pickup'.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            description: "'pending' = awaiting approval, 'approved' = staff must pull book from shelf, 'ready' = on hold shelf awaiting member pickup, 'all' = all statuses (default)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_fine_report",
      description: "Fine collection report. Use for 'unpaid fines', 'fine summary', 'how much owed', 'who owes fines', 'fine collection'.",
      parameters: {
        type: "object",
        properties: {
          filter: {
            type: "string",
            description: "'summary' = totals by status (default), 'by_member' = grouped by member with total owed, 'largest' = individual largest unpaid fines",
          },
          limit: { type: "number", description: "Max results for by_member or largest. Default 15." },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_idle_members",
      description: "Active members who have not borrowed any book in the past N months. Use for 'inactive members', 'dormant members', 'who hasn't visited', 'engagement report'.",
      parameters: {
        type: "object",
        properties: {
          months: { type: "number", description: "Inactivity threshold in months. Default 6, max 24." },
          limit:  { type: "number", description: "Max results. Default 20." },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_low_stock_alert",
      description: "Books with very few available copies, especially those with pending reservations. Use for 'low stock', 'unavailable books', 'out of copies', 'need more copies', 'popular unavailable'.",
      parameters: {
        type: "object",
        properties: {
          threshold: { type: "number", description: "Available-copy threshold (≤ this number). Default 1." },
          limit:     { type: "number", description: "Max results. Default 20." },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_staff_task",
      description: "Create an actionable to-do item on the staff task board. Call this when the user says 'add to tasks', 'remind me', 'track this', 'create a task', or when you proactively identify something that needs staff follow-up (e.g. members to contact, books to process, items to order).",
      parameters: {
        type: "object",
        properties: {
          title:       { type: "string",  description: "Short, imperative task title — starts with a verb. E.g. 'Contact overdue member John Doe', 'Order 2 more copies of Harry Potter'" },
          description: { type: "string",  description: "More detail about what needs to be done and why (optional but recommended)" },
          priority:    { type: "string",  enum: ["LOW", "MEDIUM", "HIGH", "URGENT"], description: "Task urgency. Default MEDIUM. Use URGENT only for time-sensitive issues." },
          category:    { type: "string",  description: "Category: 'overdue' | 'reservations' | 'acquisition' | 'processing' | 'members' | 'fines' | 'other'" },
          dueDate:     { type: "string",  description: "ISO 8601 due date (optional). E.g. '2025-06-01T00:00:00Z'" },
          relatedId:   { type: "string",  description: "ID of the related entity (member ID, book ID, loan ID, etc.) — optional" },
          relatedType: { type: "string",  description: "Type: 'member' | 'book' | 'loan' | 'reservation' — optional" },
        },
        required: ["title"],
      },
    },
  },
];

/* ── Tool implementations ─────────────────────────────────────────────────── */

async function runSearchBooks(args: Record<string, unknown>) {
  const { query, category, language, available, limit } = args as {
    query?: string; category?: string; language?: string;
    available?: boolean; limit?: number;
  };

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
    take:    Math.min((limit as number) ?? 8, 15),
  });

  return {
    count: books.length,
    books: books.map((b) => ({
      id: b.id, title: b.title, author: b.author?.name ?? "Unknown",
      category: b.category?.name ?? "Uncategorized", language: b.language ?? "Unknown",
      availableCopies: b.availableCopies, totalCopies: b.totalCopies, isbn: b.isbn,
    })),
  };
}

async function runGetTrendingBooks(args: Record<string, unknown>) {
  const days  = Math.min(Math.max((args.days as number) ?? 30, 1), 365);
  const limit = Math.min((args.limit as number) ?? 10, 20);
  const since = new Date(Date.now() - days * 86_400_000);

  let categoryId: string | undefined;
  if ((args.category as string)?.trim()) {
    const cat = await prisma.category.findFirst({
      where: { name: { contains: (args.category as string).trim(), mode: "insensitive" } },
      select: { id: true },
    });
    categoryId = cat?.id;
  }

  const loanCounts = await prisma.loan.groupBy({
    by:      ["bookId"],
    where:   { borrowDate: { gte: since } },
    _count:  { bookId: true },
    orderBy: { _count: { bookId: "desc" } },
    take:    limit,
  });
  if (!loanCounts.length) return { period: `last ${days} days`, count: 0, books: [] };

  const ids    = loanCounts.map((l) => l.bookId);
  const cntMap = new Map(loanCounts.map((l) => [l.bookId, l._count.bookId]));
  const books  = await prisma.book.findMany({
    where:   { id: { in: ids }, ...(categoryId && { categoryId }) },
    include: { author: { select: { name: true } }, category: { select: { name: true } } },
  });
  const sorted = ids
    .map((id) => books.find((b) => b.id === id))
    .filter(Boolean) as typeof books;

  return {
    period: `last ${days} days`,
    count:  sorted.length,
    books:  sorted.map((b) => ({
      id: b.id, title: b.title, author: b.author?.name ?? "Unknown",
      category: b.category?.name ?? "Uncategorized",
      availableCopies: b.availableCopies, totalCopies: b.totalCopies,
      borrowCount: cntMap.get(b.id) ?? 0,
    })),
  };
}

async function runGetNewArrivals(args: Record<string, unknown>) {
  const days  = Math.min(Math.max((args.days as number) ?? 30, 1), 365);
  const limit = Math.min((args.limit as number) ?? 10, 20);
  const since = new Date(Date.now() - days * 86_400_000);

  let categoryId: string | undefined;
  if ((args.category as string)?.trim()) {
    const cat = await prisma.category.findFirst({
      where: { name: { contains: (args.category as string).trim(), mode: "insensitive" } },
      select: { id: true },
    });
    categoryId = cat?.id;
  }

  const books = await prisma.book.findMany({
    where:   { createdAt: { gte: since }, ...(categoryId && { categoryId }) },
    include: { author: { select: { name: true } }, category: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take:    limit,
  });

  return {
    period: `last ${days} days`,
    count:  books.length,
    books:  books.map((b) => ({
      id: b.id, title: b.title, author: b.author?.name ?? "Unknown",
      category: b.category?.name ?? "Uncategorized",
      availableCopies: b.availableCopies, totalCopies: b.totalCopies,
    })),
  };
}

async function runGetCollectionStats() {
  const [totalBooks, totalCopies, availCopies, totalMembers, activeLoans, overdueLoans, categories] =
    await Promise.all([
      prisma.book.count(),
      prisma.bookCopy.count(),
      prisma.bookCopy.count({ where: { status: "AVAILABLE" } }),
      prisma.member.count({ where: { isActive: true } }),
      prisma.loan.count({ where: { status: "ACTIVE" } }),
      prisma.loan.count({ where: { status: "OVERDUE" } }),
      prisma.category.count(),
    ]);

  return { totalBooks, totalCopies, availableCopies: availCopies, totalMembers, activeLoans, overdueLoans, totalCategories: categories };
}

async function runGetProcessingQueue(args: Record<string, unknown>) {
  const type = (args.type as string) ?? "all";

  const results: Record<string, unknown> = {};

  if (type === "untagged" || type === "all") {
    const untagged = await prisma.basketItem.findMany({
      where: { tagged: false },
      include: {
        basket: { select: { id: true, name: true } },
        book:   { select: { id: true, title: true, isbn: true } },
        copy:   { select: { id: true, copyNumber: true, barcode: true, labelPrinted: true } },
      },
      orderBy: [{ basketId: "asc" }, { addedAt: "asc" }],
      take: 50,
    });

    // Group by basket
    const byBasket: Record<string, { basketName: string; count: number; items: typeof untagged }> = {};
    for (const item of untagged) {
      if (!byBasket[item.basketId]) {
        byBasket[item.basketId] = { basketName: item.basket.name, count: 0, items: [] };
      }
      byBasket[item.basketId].count++;
      byBasket[item.basketId].items.push(item);
    }

    results.untaggedTotal   = untagged.length;
    results.untaggedBaskets = Object.entries(byBasket).map(([id, b]) => ({
      basketId:   id,
      basketName: b.basketName,
      count:      b.count,
      // Include labelPrinted status so AI can report per-copy label state
      books: b.items.slice(0, 5).map((i) => ({
        title:        i.book.title,
        copyNumber:   i.copy.copyNumber,
        labelPrinted: i.copy.labelPrinted,
      })),
    }));
  }

  if (type === "no_barcode" || type === "all") {
    const noBarcode = await prisma.bookCopy.count({ where: { barcode: null, rfid: null } });
    const examples  = await prisma.bookCopy.findMany({
      where:   { barcode: null, rfid: null },
      include: { book: { select: { title: true } } },
      take:    10,
    });
    results.noBarcodeTotal    = noBarcode;
    results.noBarcodeExamples = examples.map((c) => `${c.book.title} (copy #${c.copyNumber})`);
  }

  if (type === "unlabeled_copies" || type === "all") {
    // Copies where the physical spine label has not been applied yet (labelPrinted=false)
    const [unlabeledCount, unlabeledExamples] = await Promise.all([
      prisma.bookCopy.count({ where: { labelPrinted: false } }),
      prisma.bookCopy.findMany({
        where:   { labelPrinted: false },
        include: { book: { select: { title: true, isbn: true } } },
        orderBy: { acquiredAt: "desc" },
        take:    15,
      }),
    ]);
    results.unlabeledCopiesTotal    = unlabeledCount;
    results.unlabeledCopiesExamples = unlabeledExamples.map((c) => ({
      title:      c.book.title,
      copyNumber: c.copyNumber,
      barcode:    c.barcode ?? null,
      status:     c.status,
    }));
  }

  return results;
}

async function runGetWeedingCandidates(args: Record<string, unknown>) {
  const reason     = (args.reason     as string) ?? "all";
  const dormantDays= (args.dormantDays as number) ?? 730;
  const limit      = Math.min((args.limit as number) ?? 10, 30);

  const dormantCutoff = new Date(Date.now() - dormantDays * 86_400_000);
  const oneYearAgo    = new Date(Date.now() - 365 * 86_400_000);

  const results: Record<string, unknown> = {};

  if (reason === "poor_condition" || reason === "all") {
    const poor = await prisma.book.findMany({
      where: { condition: { in: ["POOR", "DAMAGED", "FAIR"] as never[] }, withdrawnAt: null },
      include: {
        author: { select: { name: true } },
        _count: { select: { loans: true } },
      },
      orderBy: { condition: "asc" },
      take:    limit,
    });
    results.poorConditionCount = poor.length;
    results.poorConditionBooks = poor.map((b) => ({
      id: b.id, title: b.title, author: b.author?.name ?? "Unknown",
      condition: b.condition, loanCount: b._count.loans,
    }));
  }

  if (reason === "dormant" || reason === "all") {
    const all = await prisma.book.findMany({
      where:   { withdrawnAt: null },
      include: {
        author: { select: { name: true } },
        _count: { select: { loans: true } },
        loans:  { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
      },
    });
    const dormant = all
      .filter((b) => b.loans.length > 0 && new Date(b.loans[0].createdAt) < dormantCutoff)
      .slice(0, limit);
    results.dormantCount = dormant.length;
    results.dormantBooks = dormant.map((b) => ({
      id: b.id, title: b.title, author: b.author?.name ?? "Unknown",
      lastBorrowed: b.loans[0].createdAt, loanCount: b._count.loans,
    }));
  }

  if (reason === "never_borrowed" || reason === "all") {
    const all = await prisma.book.findMany({
      where: { createdAt: { lt: oneYearAgo }, withdrawnAt: null },
      include: {
        author: { select: { name: true } },
        loans:  { take: 1, select: { id: true } },
      },
    });
    const never = all.filter((b) => b.loans.length === 0).slice(0, limit);
    results.neverBorrowedCount = never.length;
    results.neverBorrowedBooks = never.map((b) => ({
      id: b.id, title: b.title, author: b.author?.name ?? "Unknown",
    }));
  }

  return results;
}

async function runGetAcquisitionSuggestions(args: Record<string, unknown>) {
  const focus = (args.focus as string) ?? "all";
  const results: Record<string, unknown> = {};

  if (focus === "high_demand" || focus === "all") {
    const groups = await prisma.reservation.groupBy({
      by:      ["bookId"],
      where:   { status: { in: ["PENDING", "APPROVED", "READY"] } },
      _count:  { bookId: true },
      orderBy: { _count: { bookId: "desc" } },
      take:    10,
    });
    const books = await prisma.book.findMany({
      where:   { id: { in: groups.map((g) => g.bookId) } },
      select:  { id: true, title: true, availableCopies: true, totalCopies: true, isbn: true },
    });
    const map = new Map(books.map((b) => [b.id, b]));
    results.highDemand = groups
      .map((g) => ({ ...map.get(g.bookId), pendingReservations: g._count.bookId }))
      .filter((b) => b.id);
  }

  if (focus === "understocked" || focus === "all") {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
    const loanGroups    = await prisma.loan.groupBy({
      by: ["bookId"], where: { createdAt: { gte: thirtyDaysAgo } },
      _count: { bookId: true }, orderBy: { _count: { bookId: "desc" } }, take: 30,
    });
    const ids   = loanGroups.map((l) => l.bookId);
    const books = await prisma.book.findMany({
      where: { id: { in: ids }, totalCopies: { lt: 3 } },
      select: { id: true, title: true, availableCopies: true, totalCopies: true, isbn: true },
    });
    const cntMap = new Map(loanGroups.map((l) => [l.bookId, l._count.bookId]));
    results.understocked = books
      .map((b) => ({ ...b, recentLoans: cntMap.get(b.id) ?? 0 }))
      .filter((b) => (b.recentLoans ?? 0) >= 2)
      .sort((a, b) => (b.recentLoans ?? 0) - (a.recentLoans ?? 0));
  }

  if (focus === "requests" || focus === "all") {
    const requests = await prisma.bookRequest.findMany({
      where:   { status: "PENDING" },
      include: { member: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take:    15,
    });
    results.pendingRequests = requests.map((r) => ({
      id: r.id, title: r.title, author: r.author, isbn: r.isbn,
      requestedBy: r.member.name, requestedAt: r.createdAt,
    }));
  }

  return results;
}

async function runGetMemberRiskReport(args: Record<string, unknown>) {
  const filter = (args.filter as string) ?? "all";
  const limit  = Math.min((args.limit as number) ?? 15, 50);

  const where: Record<string, unknown> = { isActive: true };

  if (filter === "overdue")   { where.loans    = { some: { status: "OVERDUE"  } }; }
  else if (filter === "fines")     { where.fines    = { some: { status: "UNPAID"   } }; }
  else if (filter === "incidents") { where.incidents= { some: { resolvedAt: null   } }; }
  else if (filter === "restricted"){ where.restrictionStatus = { not: "NONE" }; }
  else {
    where.OR = [
      { loans:    { some: { status: "OVERDUE" } } },
      { fines:    { some: { status: "UNPAID"  } } },
      { incidents:{ some: { resolvedAt: null  } } },
      { restrictionStatus: { not: "NONE" } },
    ];
  }

  const members = await prisma.member.findMany({
    where,
    include: {
      loans:    { where: { status: "OVERDUE"  }, select: { dueDate: true, book: { select: { title: true } } } },
      fines:    { where: { status: "UNPAID"   }, select: { amount: true } },
      incidents:{ where: { resolvedAt: null   }, select: { type: true, severity: true } },
    },
    take: limit,
  });

  return {
    count: members.length,
    members: members.map((m) => ({
      id:                m.id,
      name:              m.name,
      memberId:          m.memberId,
      memberType:        m.memberType,
      restrictionStatus: m.restrictionStatus,
      overdueCount:      m.loans.length,
      fineTotal:         m.fines.reduce((s, f) => s + f.amount, 0),
      incidentCount:     m.incidents.length,
      overdueBooks:      m.loans.map((l) => l.book.title),
    })),
  };
}

async function runGetDailyBriefing() {
  const now      = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const in7Days  = new Date(now.getTime() + 7  * 86_400_000);
  const in30Days = new Date(now.getTime() + 30 * 86_400_000);

  const [
    overdueLoans,
    activeLoans,
    newLoansToday,
    returnsToday,
    unpaidFinesCount,
    unpaidFinesAgg,
    pendingReservations,
    approvedReservations,
    readyPickup,
    processingQueue,
    expiringIn7d,
    expiringIn30d,
    pendingBookRequests,
    pendingMembers,
  ] = await Promise.all([
    prisma.loan.count({ where: { status: "OVERDUE" } }),
    prisma.loan.count({ where: { status: "ACTIVE"  } }),
    prisma.loan.count({ where: { borrowDate: { gte: todayStart } } }),
    prisma.loan.count({ where: { returnDate: { gte: todayStart }, status: "RETURNED" } }),
    prisma.fine.count({ where: { status: "UNPAID"  } }),
    prisma.fine.aggregate({ where: { status: "UNPAID" }, _sum: { amount: true } }),
    prisma.reservation.count({ where: { status: "PENDING"  } }),
    prisma.reservation.count({ where: { status: "APPROVED" } }),
    prisma.reservation.count({ where: { status: "READY"    } }),
    prisma.bookCopy.count({   where: { labelPrinted: false  } }),
    prisma.member.count({ where: { isActive: true, expireDate: { gte: now, lte: in7Days  } } }),
    prisma.member.count({ where: { isActive: true, expireDate: { gte: now, lte: in30Days } } }),
    prisma.bookRequest.count({ where: { status: "PENDING" } }),
    prisma.member.count({ where: { pendingApproval: true  } }),
  ]);

  return {
    reportDate:  now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
    loans: {
      overdue:      overdueLoans,
      active:       activeLoans,
      newToday:     newLoansToday,
      returnsToday,
    },
    fines: {
      unpaidCount:  unpaidFinesCount,
      totalUnpaid:  unpaidFinesAgg._sum.amount ?? 0,
    },
    reservations: {
      pendingApproval: pendingReservations,
      approved_needsPull: approvedReservations,
      readyForPickup:  readyPickup,
    },
    processing: {
      unlabeledCopies: processingQueue,
    },
    memberships: {
      expiringIn7Days:  expiringIn7d,
      expiringIn30Days: expiringIn30d,
    },
    pendingBookRequests,
    membersPendingApproval: pendingMembers,
  };
}

async function runLookupMember(args: Record<string, unknown>) {
  const q = (args.query as string)?.trim();
  if (!q) return { error: "Query is required — provide a name, email, phone, or member ID." };

  const members = await prisma.member.findMany({
    where: {
      OR: [
        { name:     { contains: q, mode: "insensitive" } },
        { email:    { contains: q, mode: "insensitive" } },
        { memberId: { contains: q, mode: "insensitive" } },
        { phone:    { contains: q } },
      ],
    },
    include: {
      loans: {
        where:   { status: { in: ["ACTIVE", "OVERDUE"] } },
        include: { book: { select: { title: true } } },
        orderBy: { dueDate: "asc" },
      },
      fines:    { where: { status: "UNPAID" }, select: { amount: true, type: true, createdAt: true } },
      reservations: {
        where:   { status: { in: ["PENDING", "APPROVED", "READY"] } },
        include: { book: { select: { title: true } } },
      },
    },
    take: Math.min((args.limit as number) ?? 5, 10),
  });

  return {
    count: members.length,
    members: members.map((m) => ({
      id:                m.id,
      name:              m.name,
      memberId:          m.memberId,
      email:             m.email,
      phone:             m.phone,
      memberType:        m.memberType,
      isActive:          m.isActive,
      expireDate:        m.expireDate,
      restrictionStatus: m.restrictionStatus,
      activeLoans: m.loans
        .filter((l) => l.status === "ACTIVE")
        .map((l) => ({ title: l.book.title, dueDate: l.dueDate })),
      overdueLoans: m.loans
        .filter((l) => l.status === "OVERDUE")
        .map((l) => ({
          title:    l.book.title,
          dueDate:  l.dueDate,
          daysLate: Math.floor((Date.now() - new Date(l.dueDate).getTime()) / 86_400_000),
        })),
      unpaidFines: {
        count: m.fines.length,
        total: m.fines.reduce((s, f) => s + f.amount, 0),
      },
      pendingReservations: m.reservations.map((r) => ({ title: r.book.title, status: r.status })),
    })),
  };
}

async function runGetOverdueReport(args: Record<string, unknown>) {
  const minDaysLate = Math.max((args.minDaysLate as number) ?? 0, 0);
  const limit       = Math.min((args.limit       as number) ?? 20, 50);
  const cutoffDate  = new Date(Date.now() - minDaysLate * 86_400_000);

  const loans = await prisma.loan.findMany({
    where:   { status: "OVERDUE", dueDate: { lte: cutoffDate } },
    include: {
      member: { select: { id: true, name: true, memberId: true, email: true, phone: true } },
      book:   { select: { title: true, isbn: true } },
      fine:   { select: { amount: true, status: true } },
    },
    orderBy: { dueDate: "asc" },
    take:    limit,
  });

  return {
    totalOverdue: await prisma.loan.count({ where: { status: "OVERDUE" } }),
    showing:      loans.length,
    minDaysLate,
    loans: loans.map((l) => ({
      loanId:   l.id,
      member:   { name: l.member.name, memberId: l.member.memberId, email: l.member.email, phone: l.member.phone },
      book:     l.book.title,
      dueDate:  l.dueDate,
      daysLate: Math.floor((Date.now() - new Date(l.dueDate).getTime()) / 86_400_000),
      fine:     l.fine ? { amount: l.fine.amount, status: l.fine.status } : null,
    })),
  };
}

async function runGetExpiringMemberships(args: Record<string, unknown>) {
  const days  = Math.min(Math.max((args.days  as number) ?? 30, 1), 365);
  const limit = Math.min((args.limit as number) ?? 20, 50);
  const now    = new Date();
  const cutoff = new Date(now.getTime() + days * 86_400_000);

  const members = await prisma.member.findMany({
    where:   { isActive: true, expireDate: { gte: now, lte: cutoff } },
    select:  {
      id: true, name: true, memberId: true, email: true, phone: true,
      memberType: true, expireDate: true,
      _count: { select: { loans: true } },
    },
    orderBy: { expireDate: "asc" },
    take:    limit,
  });

  return {
    period: `next ${days} days`,
    count:  members.length,
    members: members.map((m) => ({
      id:              m.id,
      name:            m.name,
      memberId:        m.memberId,
      email:           m.email,
      phone:           m.phone,
      memberType:      m.memberType,
      expireDate:      m.expireDate,
      daysUntilExpiry: Math.ceil((new Date(m.expireDate!).getTime() - now.getTime()) / 86_400_000),
      totalLoans:      m._count.loans,
    })),
  };
}

async function runGetReservationPipeline(args: Record<string, unknown>) {
  const statusArg = (args.status as string) ?? "all";
  const statuses  = statusArg === "all"
    ? (["PENDING", "APPROVED", "READY"] as const)
    : ([statusArg.toUpperCase()] as const);

  const results: Record<string, unknown> = {};

  for (const s of statuses) {
    const reservations = await prisma.reservation.findMany({
      where:   { status: s as never },
      include: {
        member: { select: { name: true, memberId: true, phone: true, email: true } },
        book:   { select: { title: true, availableCopies: true } },
      },
      orderBy: { createdAt: "asc" },
      take:    25,
    });
    results[s.toLowerCase()] = {
      count: reservations.length,
      items: reservations.map((r) => ({
        id:              r.id,
        memberName:      r.member.name,
        memberId:        r.member.memberId,
        memberPhone:     r.member.phone,
        memberEmail:     r.member.email,
        bookTitle:       r.book.title,
        availableCopies: r.book.availableCopies,
        holdShelf:       r.holdShelf ?? null,
        expiresAt:       r.expiresAt ?? null,
        requestedAt:     r.createdAt,
      })),
    };
  }

  // Also return total counts for all statuses when asking for 'all'
  if (statusArg === "all") {
    const [pending, approved, ready] = await Promise.all([
      prisma.reservation.count({ where: { status: "PENDING"  } }),
      prisma.reservation.count({ where: { status: "APPROVED" } }),
      prisma.reservation.count({ where: { status: "READY"    } }),
    ]);
    results.totals = { pending, approved, ready };
  }

  return results;
}

async function runGetFineReport(args: Record<string, unknown>) {
  const filter = (args.filter as string) ?? "summary";
  const limit  = Math.min((args.limit as number) ?? 15, 50);

  if (filter === "summary") {
    const [unpaidCount, paidCount, waivedCount, unpaidAgg, paidAgg] = await Promise.all([
      prisma.fine.count({ where: { status: "UNPAID"  } }),
      prisma.fine.count({ where: { status: "PAID"    } }),
      prisma.fine.count({ where: { status: "WAIVED"  } }),
      prisma.fine.aggregate({ where: { status: "UNPAID" }, _sum: { amount: true } }),
      prisma.fine.aggregate({ where: { status: "PAID"   }, _sum: { amount: true } }),
    ]);
    return {
      summary: {
        unpaid: { count: unpaidCount, totalAmount: unpaidAgg._sum.amount ?? 0 },
        paid:   { count: paidCount,   totalAmount: paidAgg._sum.amount   ?? 0 },
        waived: { count: waivedCount },
      },
    };
  }

  if (filter === "by_member") {
    const groups = await prisma.fine.groupBy({
      by:      ["memberId"],
      where:   { status: "UNPAID" },
      _sum:    { amount: true },
      _count:  { id: true },
      orderBy: { _sum: { amount: "desc" } },
      take:    limit,
    });
    const memberIds = groups.map((g) => g.memberId);
    const members   = await prisma.member.findMany({
      where:  { id: { in: memberIds } },
      select: { id: true, name: true, memberId: true, email: true, phone: true },
    });
    const mmap = new Map(members.map((m) => [m.id, m]));
    return {
      byMember: groups.map((g) => ({
        ...mmap.get(g.memberId),
        unpaidFineCount: g._count.id,
        totalOwed:       g._sum.amount ?? 0,
      })),
    };
  }

  if (filter === "largest") {
    const fines = await prisma.fine.findMany({
      where:   { status: "UNPAID" },
      include: {
        member: { select: { name: true, memberId: true, phone: true, email: true } },
        loan:   { include: { book: { select: { title: true } } } },
      },
      orderBy: { amount: "desc" },
      take:    limit,
    });
    return {
      largest: fines.map((f) => ({
        amount:     f.amount,
        type:       f.type,
        daysLate:   f.daysLate,
        memberName: f.member.name,
        memberId:   f.member.memberId,
        phone:      f.member.phone,
        email:      f.member.email,
        bookTitle:  f.loan.book.title,
        createdAt:  f.createdAt,
      })),
    };
  }

  return { error: `Unknown filter "${filter}". Use 'summary', 'by_member', or 'largest'.` };
}

async function runGetIdleMembers(args: Record<string, unknown>) {
  const months  = Math.min(Math.max((args.months as number) ?? 6, 1), 24);
  const limit   = Math.min((args.limit  as number) ?? 20, 50);
  const cutoff  = new Date(Date.now() - months * 30 * 86_400_000);

  const members = await prisma.member.findMany({
    where: {
      isActive: true,
      loans: { none: { borrowDate: { gte: cutoff } } },
    },
    include: {
      _count: { select: { loans: true } },
      loans:  { orderBy: { borrowDate: "desc" }, take: 1, select: { borrowDate: true } },
    },
    take: limit,
  });

  return {
    period:  `no loans in last ${months} months`,
    count:   members.length,
    members: members.map((m) => ({
      id:           m.id,
      name:         m.name,
      memberId:     m.memberId,
      email:        m.email,
      memberType:   m.memberType,
      totalLoans:   m._count.loans,
      lastLoanDate: m.loans[0]?.borrowDate ?? null,
    })),
  };
}

async function runGetLowStockAlert(args: Record<string, unknown>) {
  const threshold = Math.min(Math.max((args.threshold as number) ?? 1, 0), 5);
  const limit     = Math.min((args.limit     as number) ?? 20, 50);

  const books = await prisma.book.findMany({
    where:   { availableCopies: { lte: threshold }, totalCopies: { gt: 0 }, withdrawnAt: null },
    include: {
      author:   { select: { name: true } },
      category: { select: { name: true } },
      _count:   { select: { reservations: true } },
    },
    orderBy: [{ availableCopies: "asc" }, { totalCopies: "desc" }],
    take:    limit,
  });

  return {
    threshold,
    count: books.length,
    books: books.map((b) => ({
      id:                  b.id,
      title:               b.title,
      author:              b.author?.name ?? "Unknown",
      category:            b.category?.name ?? "Uncategorized",
      availableCopies:     b.availableCopies,
      totalCopies:         b.totalCopies,
      pendingReservations: b._count.reservations,
      isbn:                b.isbn,
    })),
  };
}

async function runCreateStaffTask(args: Record<string, unknown>, actorId?: string | null) {
  const title       = (args.title       as string)?.trim();
  const description = (args.description as string)?.trim() || undefined;
  const priority    = (args.priority    as string) || "MEDIUM";
  const category    = (args.category    as string) || undefined;
  const dueDate     = (args.dueDate     as string) || undefined;
  const relatedId   = (args.relatedId   as string) || undefined;
  const relatedType = (args.relatedType as string) || undefined;

  if (!title) return { error: "title is required" };

  const task = await prisma.staffTask.create({
    data: {
      title,
      description,
      priority:    priority as never,
      category,
      dueDate:     dueDate ? new Date(dueDate) : undefined,
      relatedId,
      relatedType,
      createdByAI: true,
      aiContext:   `Created by AI assistant${actorId ? ` for user ${actorId}` : ""}`,
    },
  });

  return {
    success:  true,
    taskId:   task.id,
    title:    task.title,
    priority: task.priority,
    message:  `✅ Task created: "${task.title}"`,
  };
}

/* ── Retry helper ─────────────────────────────────────────────────────────── */
async function withRetry<T>(fn: () => Promise<T>, retries = 3, baseMs = 2000): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try { return await fn(); }
    catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      if (status === 429 && i < retries - 1) {
        await new Promise((r) => setTimeout(r, baseMs * 2 ** i));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Max retries reached");
}

function safeArgs(raw: string | null | undefined): Record<string, unknown> {
  if (!raw?.trim()) return {};
  try {
    const p = JSON.parse(raw);
    return p && typeof p === "object" ? p : {};
  } catch { return {}; }
}

/**
 * DeepSeek (and some other models) emit tool calls as raw text in message.content
 * instead of the structured tool_calls field when using the OpenAI-compatible API.
 *
 * Two formats seen in the wild:
 *
 * Format A – XML tags:
 *   <｜｜DSML｜｜tool_calls>
 *   <｜｜DSML｜｜invoke name="tool_name">
 *   <param>value</param>
 *   </｜｜DSML｜｜invoke>
 *   </｜｜DSML｜｜tool_calls>
 *
 * Format B – JSON inside <tool_call>…</tool_call>:
 *   <tool_call>{"name":"tool_name","arguments":{…}}</tool_call>
 *
 * Returns synthesised tool_calls array in OpenAI format, or null if none found.
 */
function parseDeepSeekToolCalls(
  content: string | null | undefined,
): { id: string; function: { name: string; arguments: string } }[] | null {
  if (!content) return null;
  const results: { id: string; function: { name: string; arguments: string } }[] = [];

  // Format B — <tool_call>{"name":…,"arguments":…}</tool_call>
  const jsonRe = /<tool_call>([\s\S]*?)<\/tool_call>/g;
  let m: RegExpExecArray | null;
  while ((m = jsonRe.exec(content)) !== null) {
    try {
      const obj = JSON.parse(m[1].trim());
      if (obj?.name) {
        results.push({
          id: `tc_${Math.random().toString(36).slice(2)}`,
          function: { name: obj.name, arguments: JSON.stringify(obj.arguments ?? obj.parameters ?? {}) },
        });
      }
    } catch { /* skip malformed */ }
  }
  if (results.length) return results;

  // Format A — <｜｜DSML｜｜invoke name="…">…</｜｜DSML｜｜invoke>
  const dsmlRe = /<[｜|]{2}DSML[｜|]{2}invoke\s+name="([^"]+)">([\s\S]*?)<\/[｜|]{2}DSML[｜|]{2}invoke>/g;
  while ((m = dsmlRe.exec(content)) !== null) {
    const name   = m[1];
    const body   = m[2];
    const params: Record<string, string> = {};
    // Each child tag is a parameter: <tagname>value</tagname>
    const paramRe = /<(\w+)>([\s\S]*?)<\/\1>/g;
    let p: RegExpExecArray | null;
    while ((p = paramRe.exec(body)) !== null) params[p[1]] = p[2].trim();
    results.push({
      id: `tc_${Math.random().toString(36).slice(2)}`,
      function: { name, arguments: JSON.stringify(params) },
    });
  }
  return results.length ? results : null;
}

/* ── POST /api/admin/assistant ───────────────────────────────────────────── */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "STAFF"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!AI_ENABLED) {
    return NextResponse.json(
      { error: "AI assistant is not configured. Add AI_API_KEY to your .env file." },
      { status: 503 },
    );
  }

  // Check if admin AI is disabled in settings
  const aiSetting = await prisma.settings.findUnique({ where: { key: "AI_SEARCH_ADMIN" } });
  if (aiSetting?.value === "false") {
    return NextResponse.json(
      { error: "AI assistant has been disabled by the administrator." },
      { status: 403 },
    );
  }

  const body   = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const msgs: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...parsed.data.messages,
  ];

  try {
    // ── Round 1 ─────────────────────────────────────────────────────────────
    const r1  = await withRetry(() =>
      aiClient.chat.completions.create({
        model: AI_MODEL, messages: msgs, tools: TOOLS, tool_choice: "auto", max_tokens: 2048,
      }),
    );
    const m1  = r1.choices[0]?.message;
    if (!m1) throw new Error("Empty AI response");

    // Some models (DeepSeek) return tool calls as raw text rather than structured tool_calls
    const effectiveToolCalls =
      (m1.tool_calls?.length ? m1.tool_calls : null) ??
      parseDeepSeekToolCalls(m1.content);

    if (!effectiveToolCalls?.length) {
      // Strip any raw tool-call markup from the reply before returning
      const cleanReply = (m1.content ?? "")
        .replace(/<[｜|]{2}DSML[｜|]{2}tool_calls>[\s\S]*?<\/[｜|]{2}DSML[｜|]{2}tool_calls>/g, "")
        .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "")
        .trim();
      return NextResponse.json({ reply: cleanReply, data: null });
    }

    // ── Execute tools ────────────────────────────────────────────────────────
    const toolMsgs: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [m1 as never];
    const collectedData: Record<string, unknown> = {};

    for (const tc of effectiveToolCalls as { id: string; function: { name: string; arguments: string } }[]) {
      const args = safeArgs(tc.function.arguments);
      let result: unknown;

      switch (tc.function.name) {
        case "search_books":              result = await runSearchBooks(args);             break;
        case "get_trending_books":        result = await runGetTrendingBooks(args);        break;
        case "get_new_arrivals":          result = await runGetNewArrivals(args);          break;
        case "get_collection_stats":      result = await runGetCollectionStats();          break;
        case "get_processing_queue":      result = await runGetProcessingQueue(args);      break;
        case "get_weeding_candidates":    result = await runGetWeedingCandidates(args);    break;
        case "get_acquisition_suggestions": result = await runGetAcquisitionSuggestions(args); break;
        case "get_member_risk_report":    result = await runGetMemberRiskReport(args);    break;
        case "get_daily_briefing":        result = await runGetDailyBriefing();            break;
        case "lookup_member":             result = await runLookupMember(args);            break;
        case "get_overdue_report":        result = await runGetOverdueReport(args);        break;
        case "get_expiring_memberships":  result = await runGetExpiringMemberships(args);  break;
        case "get_reservation_pipeline":  result = await runGetReservationPipeline(args);  break;
        case "get_fine_report":           result = await runGetFineReport(args);           break;
        case "get_idle_members":          result = await runGetIdleMembers(args);          break;
        case "get_low_stock_alert":       result = await runGetLowStockAlert(args);                              break;
        case "create_staff_task":         result = await runCreateStaffTask(args, session.user?.id ?? null);  break;
        default:                          result = { error: "Unknown tool" };
      }

      collectedData[tc.function.name] = result;
      toolMsgs.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
    }

    // ── Round 2 ─────────────────────────────────────────────────────────────
    const r2 = await withRetry(() =>
      aiClient.chat.completions.create({
        model: AI_MODEL, messages: [...msgs, ...toolMsgs], max_tokens: 2048,
      }),
    );

    return NextResponse.json({
      reply: r2.choices[0]?.message?.content ?? "",
      data:  collectedData,
    });

  } catch (err: unknown) {
    console.error("[Admin Assistant]", err);
    const status = (err as { status?: number })?.status;
    if (status === 429) {
      return NextResponse.json(
        { error: "The AI service is busy (rate limit). Please wait a moment and try again." },
        { status: 429 },
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI request failed" },
      { status: 500 },
    );
  }
}
