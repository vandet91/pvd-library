import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { aiClient, AI_MODEL, AI_ENABLED } from "@/lib/ai-client";

/* ── Types ──────────────────────────────────────────────────────────────────── */

export type EnrichField =
  | "cover" | "description" | "publishYear"
  | "pages" | "language" | "author" | "publisher";

interface EnrichedData {
  coverUrl?:       string | null;
  description?:    string | null;
  publishYear?:    number | null;
  pages?:          number | null;
  language?:       string | null;
  authorName?:     string | null;
  publisherName?:  string | null;
  source:          "openlibrary" | "google" | "merged" | "ai" | "merged+ai" | "elibrary" | string;
}

export interface EnrichResult {
  id:           string;
  title:        string;
  isbn:         string;
  updated:      boolean;
  fieldsUpdated: string[];
  source:       string | null;
  error?:       string;
}

/* ── ISBN cleaner ───────────────────────────────────────────────────────────── */

function cleanIsbn(isbn: string): string {
  return isbn.replace(/[\s\-]/g, "");
}

function isValidIsbn(isbn: string): boolean {
  const clean = cleanIsbn(isbn);
  return /^\d{10}$/.test(clean) || /^(978|979)\d{10}$/.test(clean);
}

/* ── OpenLibrary ────────────────────────────────────────────────────────────── */

async function fetchOpenLibrary(isbn: string): Promise<Partial<EnrichedData> | null> {
  try {
    const clean = cleanIsbn(isbn);
    const url   = `https://openlibrary.org/api/books?bibkeys=ISBN:${clean}&format=json&jscmd=data`;
    const res   = await fetch(url, {
      signal:  AbortSignal.timeout(8000),
      headers: { "User-Agent": "PVD-Library/1.0 (isbn-enrichment)" },
    });
    if (!res.ok) return null;

    const data = await res.json();
    const book = data[`ISBN:${clean}`];
    if (!book) return null;

    const desc = typeof book.description === "string"
      ? book.description
      : (book.description?.value ?? null);

    // OpenLibrary cover CDN — only use if API confirmed a cover exists
    const coverUrl = book.cover?.large ?? book.cover?.medium ?? book.cover?.small
      ? `https://covers.openlibrary.org/b/isbn/${clean}-L.jpg`
      : null;

    // Language: OpenLibrary returns [{ key: "/languages/eng" }]
    const langKey: string | undefined = book.languages?.[0]?.key;
    const language = langKey ? normaliseLanguage(langKey.replace("/languages/", "")) : null;

    let publishYear: number | null = null;
    if (book.publish_date) {
      const m = String(book.publish_date).match(/\d{4}/);
      if (m) publishYear = parseInt(m[0], 10);
    }

    return {
      coverUrl,
      description:   desc ?? null,
      publishYear,
      pages:         book.number_of_pages ?? null,
      language,
      authorName:    book.authors?.[0]?.name ?? null,
      publisherName: book.publishers?.[0]?.name ?? null,
    };
  } catch {
    return null;
  }
}

/* ── Google Books ───────────────────────────────────────────────────────────── */

async function fetchGoogleBooks(isbn: string): Promise<Partial<EnrichedData> | null> {
  try {
    const clean = cleanIsbn(isbn);
    const url   = `https://www.googleapis.com/books/v1/volumes?q=isbn:${clean}&maxResults=1`;
    const res   = await fetch(url, {
      signal:  AbortSignal.timeout(8000),
      headers: { "User-Agent": "PVD-Library/1.0 (isbn-enrichment)" },
    });
    if (!res.ok) return null;

    const data = await res.json();
    const info = data.items?.[0]?.volumeInfo;
    if (!info) return null;

    const thumb: string | null = info.imageLinks?.thumbnail
      ? info.imageLinks.thumbnail.replace("http:", "https:").replace("zoom=1", "zoom=3")
      : null;

    let publishYear: number | null = null;
    if (info.publishedDate) {
      const m = String(info.publishedDate).match(/\d{4}/);
      if (m) publishYear = parseInt(m[0], 10);
    }

    return {
      coverUrl:      thumb,
      description:   info.description ?? null,
      publishYear,
      pages:         info.pageCount   ?? null,
      language:      info.language    ? normaliseLanguage(info.language) : null,
      authorName:    info.authors?.[0] ?? null,
      publisherName: info.publisher   ?? null,
    };
  } catch {
    return null;
  }
}

/* ── Language normaliser ────────────────────────────────────────────────────── */

const LANG_MAP: Record<string, string> = {
  eng: "en", fre: "fr", ger: "de", spa: "es", chi: "zh",
  jpn: "ja", kor: "ko", ara: "ar", por: "pt", rus: "ru",
  ita: "it", tha: "th", khm: "km", vie: "vi", ind: "id",
};

function normaliseLanguage(raw: string): string {
  return LANG_MAP[raw.toLowerCase()] ?? raw.toLowerCase().slice(0, 2);
}

/* ── Merge two enriched sources (prefer OpenLibrary cover, Google description) */

function merge(ol: Partial<EnrichedData> | null, gb: Partial<EnrichedData> | null): EnrichedData | null {
  if (!ol && !gb) return null;
  const base = ol ?? gb!;
  return {
    coverUrl:      ol?.coverUrl      ?? gb?.coverUrl      ?? null,
    description:   gb?.description   ?? ol?.description   ?? null,  // Google usually better
    publishYear:   ol?.publishYear   ?? gb?.publishYear   ?? null,
    pages:         ol?.pages         ?? gb?.pages         ?? null,
    language:      ol?.language      ?? gb?.language      ?? null,
    authorName:    ol?.authorName    ?? gb?.authorName    ?? null,
    publisherName: ol?.publisherName ?? gb?.publisherName ?? null,
    source:        ol && gb ? "merged" : ol ? "openlibrary" : "google",
  };
}

/* ── Khmer detection ────────────────────────────────────────────────────────── */

/** Returns true if the string contains Khmer Unicode characters (U+1780–U+17FF). */
function isKhmer(text: string): boolean {
  return /[ក-៿]/.test(text);
}

/* ── eLibrary Cambodia cover fallback (title-based, no ISBN) ────────────────── */

async function fetchElibraryCoversUrl(title: string, titleKm?: string | null): Promise<string | null> {
  // Prefer Khmer title for better match on this Cambodian library site
  const query = (titleKm ?? title).trim();
  if (!query) return null;

  try {
    const url = `https://www.elibraryofcambodia.org/?s=${encodeURIComponent(query)}&post_type=book-covers`;
    const res = await fetch(url, {
      signal:  AbortSignal.timeout(10_000),
      headers: { "User-Agent": "PVD-Library/1.0 (cover-enrichment)" },
    });
    if (!res.ok) return null;

    const html = await res.text();

    // Extract first usable cover image from WordPress article cards
    const articleRe = /<article[\s\S]*?<\/article>/gi;
    let m: RegExpExecArray | null;
    while ((m = articleRe.exec(html)) !== null) {
      const block  = m[0];
      const imgTag = /<img[^>]+>/i.exec(block)?.[0] ?? "";
      const url    = /data-src="([^"]+)"/.exec(imgTag)?.[1]
                  ?? /(?<!\w)src="([^"]+)"/.exec(imgTag)?.[1]
                  ?? "";
      if (url && url.includes("wp-content/uploads") && !url.includes("default-book"))
        return url;
    }
    return null;
  } catch {
    return null;
  }
}

/* ── AI enrichment ──────────────────────────────────────────────────────────── */

async function fetchAI(
  book:      { title: string; titleKm?: string | null; isbn: string; authorName?: string | null; publishYear?: number | null; language?: string | null },
  fields:    EnrichField[],
  khmerMode: boolean,
): Promise<Partial<EnrichedData> | null> {
  if (!AI_ENABLED) return null;

  // AI cannot provide real cover images or page counts
  const aiFields = fields.filter((f) => f !== "cover" && f !== "pages");
  if (aiFields.length === 0) return null;

  const fieldList = aiFields.map((f) => {
    switch (f) {
      case "description": return `"description": "<2–4 sentence summary in English>"`;
      case "publishYear": return `"publishYear": <4-digit year as integer, or null>`;
      case "language":    return `"language": "<ISO 639-1 code e.g. en, km, fr, or null>"`;
      case "author":      return `"authorName": "<full author name, or null>"`;
      case "publisher":   return `"publisherName": "<publisher name, or null>"`;
      default:            return null;
    }
  }).filter(Boolean).join(",\n  ");

  const context = [
    book.authorName  && `Author: ${book.authorName}`,
    book.publishYear && `Year: ${book.publishYear}`,
    book.language    && `Language: ${book.language}`,
  ].filter(Boolean).join("\n");

  const prompt = khmerMode
    ? `You are a librarian assistant specialising in Khmer and Cambodian literature.
The book below has a Khmer title. These books are rarely indexed in international databases.

Book title (Khmer): "${book.title}"
${book.titleKm ? `Khmer script title: "${book.titleKm}"` : ""}
ISBN: ${book.isbn}
${context}

Instructions:
- If you recognise this specific book, provide accurate data.
- If you don't recognise it, you MAY infer from the title:
    • Set "language" to "km" (Khmer)
    • Write a brief, plausible description based on what the title suggests (2–3 sentences in English). Clearly avoid specific invented facts.
    • Set "authorName", "publisherName", "publishYear" to null if unknown — do NOT guess.
- Return ONLY valid JSON, no markdown:
{
  ${fieldList}
}`
    : `You are a librarian assistant with knowledge of published books.
Return ONLY a valid JSON object. Set a field to null if you are not confident. Do NOT invent facts.

Book title: "${book.title}"
ISBN: ${book.isbn}
${context}

Return ONLY this JSON (no markdown, no explanation):
{
  ${fieldList}
}`;

  try {
    const response = await aiClient.chat.completions.create({
      model:       AI_MODEL,
      temperature: khmerMode ? 0.3 : 0.1,  // slightly higher for Khmer inference
      max_tokens:  500,
      messages:    [{ role: "user", content: prompt }],
    });

    const raw  = response.choices[0]?.message?.content?.trim() ?? "";
    const json = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(json);

    return {
      description:   typeof parsed.description   === "string" ? parsed.description   : null,
      publishYear:   typeof parsed.publishYear    === "number" ? parsed.publishYear    : null,
      language:      typeof parsed.language       === "string" ? parsed.language       : null,
      authorName:    typeof parsed.authorName     === "string" ? parsed.authorName     : null,
      publisherName: typeof parsed.publisherName  === "string" ? parsed.publisherName  : null,
      source:        "ai",
    };
  } catch {
    return null;
  }
}

/* ── Author / Publisher upsert ──────────────────────────────────────────────── */

async function upsertAuthor(name: string): Promise<string> {
  const existing = await prisma.author.findFirst({
    where:  { name: { equals: name.trim(), mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await prisma.author.create({ data: { name: name.trim() }, select: { id: true } });
  return created.id;
}

async function upsertPublisher(name: string): Promise<string> {
  const existing = await prisma.publisher.findFirst({
    where:  { name: { equals: name.trim(), mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await prisma.publisher.create({ data: { name: name.trim() }, select: { id: true } });
  return created.id;
}

/* ── Process single book ────────────────────────────────────────────────────── */

async function processBook(
  book:      { id: string; title: string; titleKm?: string | null; isbn: string; coverImage: string | null; description: string | null; publishYear: number | null; pages: number | null; language: string | null; authorId: string | null; publisherId: string | null },
  fields:    EnrichField[],
  overwrite: boolean,
  useAI:     boolean,
): Promise<EnrichResult> {
  const result: EnrichResult = {
    id: book.id, title: book.title, isbn: book.isbn,
    updated: false, fieldsUpdated: [], source: null,
  };

  try {
    // Determine which fields actually need enriching
    const needed = fields.filter((f) => {
      if (overwrite) return true;
      switch (f) {
        case "cover":       return !book.coverImage;
        case "description": return !book.description;
        case "publishYear": return !book.publishYear;
        case "pages":       return !book.pages;
        case "language":    return !book.language;
        case "author":      return !book.authorId;
        case "publisher":   return !book.publisherId;
      }
    });
    if (needed.length === 0) return result;

    // Detect Khmer title — OpenLibrary/Google Books rarely have these
    const khmerBook = isKhmer(book.title) || isKhmer(book.titleKm ?? "") || book.language === "km";

    let enriched: EnrichedData | null = null;

    if (khmerBook && useAI && AI_ENABLED) {
      // ── Khmer path: AI is PRIMARY, APIs are supplementary ──────────────────
      // Try APIs in parallel (might have data if the book also has an ISBN-linked English record)
      const [ol, gb, aiData] = await Promise.all([
        fetchOpenLibrary(book.isbn),
        fetchGoogleBooks(book.isbn),
        fetchAI(
          { title: book.title, titleKm: book.titleKm, isbn: book.isbn, language: book.language ?? "km" },
          needed,
          true, // khmerMode
        ),
      ]);
      const apiData = merge(ol, gb);

      // Prefer API data where available, AI fills the rest
      if (apiData || aiData) {
        enriched = {
          coverUrl:      apiData?.coverUrl      ?? null,
          description:   apiData?.description   ?? aiData?.description   ?? null,
          publishYear:   apiData?.publishYear   ?? aiData?.publishYear   ?? null,
          pages:         apiData?.pages         ?? null,
          language:      apiData?.language      ?? aiData?.language      ?? "km",
          authorName:    apiData?.authorName    ?? aiData?.authorName    ?? null,
          publisherName: apiData?.publisherName ?? aiData?.publisherName ?? null,
          source:        apiData
            ? (aiData ? "merged+ai" : apiData.source)
            : "ai",
        } as EnrichedData;
      }
    } else {
      // ── Standard path: APIs first, AI as fallback ──────────────────────────
      const [ol, gb] = await Promise.all([
        fetchOpenLibrary(book.isbn),
        fetchGoogleBooks(book.isbn),
      ]);
      enriched = merge(ol, gb);

      if (useAI && AI_ENABLED) {
        const stillMissing = needed.filter((f) => {
          if (f === "cover")       return !enriched?.coverUrl;
          if (f === "description") return !enriched?.description;
          if (f === "publishYear") return !enriched?.publishYear;
          if (f === "pages")       return !enriched?.pages;
          if (f === "language")    return !enriched?.language;
          if (f === "author")      return !enriched?.authorName;
          if (f === "publisher")   return !enriched?.publisherName;
          return false;
        });

        if (stillMissing.length > 0) {
          const aiData = await fetchAI(
            { title: book.title, isbn: book.isbn, authorName: enriched?.authorName, publishYear: enriched?.publishYear },
            stillMissing,
            false, // not khmerMode
          );
          if (aiData) {
            enriched = {
              coverUrl:      enriched?.coverUrl      ?? null,
              description:   enriched?.description   ?? aiData.description   ?? null,
              publishYear:   enriched?.publishYear   ?? aiData.publishYear   ?? null,
              pages:         enriched?.pages         ?? null,
              language:      enriched?.language      ?? aiData.language      ?? null,
              authorName:    enriched?.authorName    ?? aiData.authorName    ?? null,
              publisherName: enriched?.publisherName ?? aiData.publisherName ?? null,
              source:        (enriched ? "merged+ai" : "ai") as EnrichedData["source"],
            };
          }
        }
      }
    }

    // ── eLibrary Cambodia cover fallback ────────────────────────────────────
    // If cover is still needed and no cover was found by ISBN sources, try
    // the eLibrary of Cambodia (title-based, works for Khmer books especially).
    if (needed.includes("cover") && !enriched?.coverUrl) {
      const elibUrl = await fetchElibraryCoversUrl(book.title, book.titleKm);
      if (elibUrl) {
        enriched = {
          ...(enriched ?? { source: "openlibrary" as const }),
          coverUrl: elibUrl,
          source:   (enriched ? `${enriched.source}+elibrary` : "elibrary") as EnrichedData["source"],
        };
      }
    }

    if (!enriched) return result;
    result.source = enriched.source;

    // Build DB update
    const update: Record<string, unknown> = {};
    const fieldsUpdated: string[] = [];

    if (needed.includes("cover") && enriched.coverUrl) {
      update.coverImage = enriched.coverUrl;
      fieldsUpdated.push("cover");
    }
    if (needed.includes("description") && enriched.description) {
      update.description = enriched.description.slice(0, 5000);
      fieldsUpdated.push("description");
    }
    if (needed.includes("publishYear") && enriched.publishYear) {
      update.publishYear = enriched.publishYear;
      fieldsUpdated.push("publishYear");
    }
    if (needed.includes("pages") && enriched.pages && enriched.pages > 0) {
      update.pages = enriched.pages;
      fieldsUpdated.push("pages");
    }
    if (needed.includes("language") && enriched.language) {
      update.language = enriched.language;
      fieldsUpdated.push("language");
    }
    if (needed.includes("author") && enriched.authorName) {
      update.authorId = await upsertAuthor(enriched.authorName);
      fieldsUpdated.push("author");
    }
    if (needed.includes("publisher") && enriched.publisherName) {
      update.publisherId = await upsertPublisher(enriched.publisherName);
      fieldsUpdated.push("publisher");
    }

    if (Object.keys(update).length > 0) {
      await prisma.book.update({ where: { id: book.id }, data: update });
      result.updated = true;
      result.fieldsUpdated = fieldsUpdated;
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : "Unknown error";
  }

  return result;
}

/* ── Route handler ──────────────────────────────────────────────────────────── */

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const fields:    EnrichField[] = Array.isArray(body.fields) ? body.fields : ["cover"];
  const overwrite: boolean       = body.overwrite === true;
  const useAI:     boolean       = body.useAI === true && AI_ENABLED;
  const limit:     number        = Math.min(parseInt(body.limit ?? "100", 10) || 100, 500);

  // Build where clause — if not overwrite, fetch only books missing at least one requested field
  const missingConditions = overwrite ? [] : fields.flatMap((f): object[] => {
    switch (f) {
      case "cover":       return [{ coverImage: null }];
      case "description": return [{ description: null }, { description: "" }];
      case "publishYear": return [{ publishYear: null }];
      case "pages":       return [{ pages: null }];
      case "language":    return [{ language: null }, { language: "" }];
      case "author":      return [{ authorId: null }];
      case "publisher":   return [{ publisherId: null }];
      default:            return [];
    }
  });

  // If only cover is requested, include books without ISBNs — eLibrary Cambodia
  // can find covers by title, so ISBN is not required for cover-only runs.
  const coverOnly = fields.every((f) => f === "cover");

  const where = {
    ...(coverOnly ? {} : { isbn: { not: null as null } }),
    ...(missingConditions.length > 0 ? { OR: missingConditions } : {}),
  };

  const books = await prisma.book.findMany({
    where,
    select: {
      id: true, title: true, titleKm: true, isbn: true,
      coverImage: true, description: true, publishYear: true,
      pages: true, language: true, authorId: true, publisherId: true,
    },
    take: limit,
    orderBy: { createdAt: "asc" },
  });

  // For non-cover-only runs, skip books with invalid ISBNs (APIs need valid ISBNs).
  // Cover-only runs include all books since eLibrary works by title.
  const validBooks = coverOnly
    ? books
    : books.filter((b) => b.isbn && isValidIsbn(b.isbn));

  // Process in concurrent batches of 5 with a 150ms delay between batches
  const CONCURRENCY = 5;
  const results: EnrichResult[] = [];

  for (let i = 0; i < validBooks.length; i += CONCURRENCY) {
    const batch = validBooks.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map((b) => processBook(b as Parameters<typeof processBook>[0], fields, overwrite, useAI))
    );
    results.push(...batchResults);
    if (i + CONCURRENCY < validBooks.length) {
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  const updated   = results.filter((r) => r.updated).length;
  const notFound  = results.filter((r) => !r.updated && !r.error).length;
  const errors    = results.filter((r) => !!r.error).length;

  return NextResponse.json({
    processed: results.length,
    updated,
    notFound,
    errors,
    results,
  });
}
