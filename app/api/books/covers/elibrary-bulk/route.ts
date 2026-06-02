import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";

const BASE    = "https://www.elibraryofcambodia.org";
const DEFAULT = "/wp-content/themes/elibraryofcambodia/assets/images/default-book.jpeg";
const TIMEOUT = 10_000;
const DELAY   = 800; // ms between requests — respectful rate limit

export interface BulkCoverResult {
  id:       string;
  title:    string;
  query:    string;
  coverUrl: string | null;
  updated:  boolean;
  error?:   string;
}

/* ── GET: count books without covers ────────────────────────────────────── */
export async function GET() {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [total, withCover] = await Promise.all([
    prisma.book.count(),
    prisma.book.count({ where: { coverImage: { not: null } } }),
  ]);

  return NextResponse.json({ total, withCover, missing: total - withCover });
}

/* ── POST: process one batch ────────────────────────────────────────────── */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body   = await req.json().catch(() => ({})) as { limit?: number; offset?: number; overwrite?: boolean };
  const limit  = Math.min(body.limit  ?? 30, 50);
  const offset = body.offset  ?? 0;
  const overwrite = body.overwrite === true;

  /* Fetch books without covers (or all if overwrite) */
  const books = await prisma.book.findMany({
    where: overwrite ? {} : { coverImage: null },
    select: { id: true, title: true, titleKm: true, language: true },
    orderBy: { createdAt: "asc" },
    skip:  offset,
    take:  limit,
  });

  const results: BulkCoverResult[] = [];

  for (const book of books) {
    // Build the best search query: prefer Khmer title, fall back to English
    const query = (book.titleKm ?? book.title).trim();

    try {
      const coverUrl = await searchElibraryFirstCover(query);

      if (coverUrl) {
        await prisma.book.update({
          where: { id: book.id },
          data:  { coverImage: coverUrl },
        });
        results.push({ id: book.id, title: book.title, query, coverUrl, updated: true });
      } else {
        results.push({ id: book.id, title: book.title, query, coverUrl: null, updated: false });
      }
    } catch (e) {
      results.push({
        id: book.id, title: book.title, query,
        coverUrl: null, updated: false,
        error: e instanceof Error ? e.message : "error",
      });
    }

    // Rate-limit — be respectful to eLibrary server
    await sleep(DELAY);
  }

  const updated = results.filter((r) => r.updated).length;
  return NextResponse.json({
    processed: results.length,
    updated,
    notFound:  results.filter((r) => !r.updated && !r.error).length,
    errors:    results.filter((r) => !!r.error).length,
    results,
    hasMore:   books.length === limit,
  });
}

/* ── Fetch first cover image for a title query ──────────────────────────── */
async function searchElibraryFirstCover(query: string): Promise<string | null> {
  const url = `${BASE}/?s=${encodeURIComponent(query)}&post_type=book-covers`;

  const res = await fetch(url, {
    signal:  AbortSignal.timeout(TIMEOUT),
    headers: { "User-Agent": "PVD-Library/1.0 (bulk-cover-fetch)" },
  });
  if (!res.ok) return null;

  const html = await res.text();
  return extractFirstCover(html);
}

/* ── Parse the first usable cover from HTML ─────────────────────────────── */
function extractFirstCover(html: string): string | null {
  const articleRe = /<article[\s\S]*?<\/article>/gi;
  let m: RegExpExecArray | null;

  while ((m = articleRe.exec(html)) !== null) {
    const block = m[0];

    const imgTag = /<img[^>]+>/i.exec(block)?.[0] ?? "";
    const dataSrc = /data-src="([^"]+)"/.exec(imgTag)?.[1];
    const src     = /(?<!\w)src="([^"]+)"/.exec(imgTag)?.[1];
    const coverUrl = dataSrc ?? src ?? "";

    if (!coverUrl) continue;
    if (coverUrl.includes("default-book")) continue;
    if (coverUrl.includes(DEFAULT)) continue;
    if (!coverUrl.includes("wp-content/uploads")) continue;

    return coverUrl;
  }
  return null;
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
