import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";

export interface ElibraryResult {
  title:    string;
  coverUrl: string;
  pageUrl:  string;
}

const BASE      = "https://www.elibraryofcambodia.org";
const DEFAULT   = `${BASE}/wp-content/themes/elibraryofcambodia/assets/images/default-book.jpeg`;
const TIMEOUT   = 10_000;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ results: [] });

  const searchUrl = `${BASE}/?s=${encodeURIComponent(q)}&post_type=book-covers`;

  let html: string;
  try {
    const res = await fetch(searchUrl, {
      signal:  AbortSignal.timeout(TIMEOUT),
      headers: { "User-Agent": "PVD-Library/1.0 (cover-search)" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (e) {
    return NextResponse.json({ error: String(e), results: [] }, { status: 502 });
  }

  const results = parseResults(html);
  return NextResponse.json({ results, query: q });
}

// ── HTML parser ────────────────────────────────────────────────────────────────
// Extracts article cards from the WordPress search results page.
// Each card looks like:
//   <article ...>
//     <a href="PAGE_URL"><img src="COVER_URL" ... alt="TITLE" /></a>
//     ...
//   </article>

function parseResults(html: string): ElibraryResult[] {
  const results: ElibraryResult[] = [];
  const seen = new Set<string>();

  // Match each article block
  const articleRe = /<article[\s\S]*?<\/article>/gi;
  let articleMatch: RegExpExecArray | null;

  while ((articleMatch = articleRe.exec(html)) !== null) {
    const block = articleMatch[0];

    // Extract page URL from first <a href="...">
    const hrefMatch = /href="(https?:\/\/www\.elibraryofcambodia\.org\/[^"]+)"/.exec(block);
    const pageUrl   = hrefMatch?.[1] ?? "";

    // Extract cover image — prefer data-src (lazy-load) then src
    const imgMatch  = /<img[^>]+>/i.exec(block);
    let coverUrl    = "";
    if (imgMatch) {
      const imgTag   = imgMatch[0];
      const dataSrc  = /data-src="([^"]+)"/.exec(imgTag)?.[1];
      const src      = /(?<!\w)src="([^"]+)"/.exec(imgTag)?.[1];
      coverUrl       = dataSrc ?? src ?? "";
    }

    // Skip placeholder / default cover
    if (!coverUrl || coverUrl.includes("default-book") || coverUrl === DEFAULT) continue;
    if (!coverUrl.includes("wp-content/uploads")) continue;

    // Extract title from alt attribute or <h2>/<h3>
    const altMatch   = /alt="([^"]*)"/.exec(block);
    const headMatch  = /<h[23][^>]*>\s*(?:<[^>]+>)*\s*([^<]+)/.exec(block);
    const title      = altMatch?.[1]?.trim() || headMatch?.[1]?.trim() || "Unknown";

    if (seen.has(coverUrl)) continue;
    seen.add(coverUrl);

    results.push({ title, coverUrl, pageUrl });
  }

  return results.slice(0, 20); // cap at 20 results
}
