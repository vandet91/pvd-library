import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";

export interface CoverAuditItem {
  id:         string;
  title:      string;
  coverImage: string;
  status:     "ok" | "not_image" | "broken" | "timeout";
  contentType: string | null;
  reason:     string;
}

/**
 * Check a single URL — returns whether it is a real image.
 * Uses HEAD first, falls back to a GET with Range header to keep bandwidth low.
 */
async function checkUrl(url: string): Promise<{ ok: boolean; contentType: string | null; reason: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);

  try {
    // Try HEAD first
    let res = await fetch(url, {
      method:  "HEAD",
      signal:  controller.signal,
      headers: { "User-Agent": "PVD-Library/1.0 (cover-audit)" },
      redirect: "follow",
    });

    // Some servers block HEAD — fall back to a minimal GET
    if (res.status === 405 || res.status === 403) {
      res = await fetch(url, {
        method:  "GET",
        signal:  controller.signal,
        headers: {
          "User-Agent": "PVD-Library/1.0 (cover-audit)",
          "Range":      "bytes=0-511",  // only fetch first 512 bytes
        },
        redirect: "follow",
      });
    }

    clearTimeout(timer);

    if (!res.ok && res.status !== 206) {
      return { ok: false, contentType: null, reason: `HTTP ${res.status}` };
    }

    const ct = res.headers.get("content-type") ?? "";

    // Must be an image content-type
    if (!ct.startsWith("image/")) {
      return {
        ok:          false,
        contentType: ct || null,
        reason:      ct ? `Not an image (${ct.split(";")[0].trim()})` : "No content-type header",
      };
    }

    // OpenLibrary returns a tiny 1×1 GIF when no cover exists
    const cl = res.headers.get("content-length");
    if (cl && parseInt(cl, 10) < 500 && ct.includes("gif")) {
      return { ok: false, contentType: ct, reason: "Placeholder image (too small)" };
    }

    return { ok: true, contentType: ct, reason: "OK" };
  } catch (err) {
    clearTimeout(timer);
    const isTimeout = (err as Error)?.name === "AbortError";
    return {
      ok:          false,
      contentType: null,
      reason:      isTimeout ? "Request timed out" : `Network error: ${(err as Error).message}`,
    };
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body  = await req.json().catch(() => ({}));
  const limit = Math.min(parseInt(body.limit ?? "200", 10) || 200, 1000);

  // Fetch books that have a cover URL
  const books = await prisma.book.findMany({
    where:  { coverImage: { not: null } },
    select: { id: true, title: true, coverImage: true },
    take:   limit,
    orderBy: { updatedAt: "desc" },
  });

  const results: CoverAuditItem[] = [];
  const CONCURRENCY = 8;

  for (let i = 0; i < books.length; i += CONCURRENCY) {
    const batch = books.slice(i, i + CONCURRENCY);
    const checked = await Promise.all(
      batch.map(async (book) => {
        const { ok, contentType, reason } = await checkUrl(book.coverImage!);
        let status: CoverAuditItem["status"] = "ok";
        if (!ok) {
          if (reason.includes("timed out"))   status = "timeout";
          else if (reason.startsWith("HTTP")) status = "broken";
          else                                status = "not_image";
        }
        return { id: book.id, title: book.title, coverImage: book.coverImage!, status, contentType, reason };
      })
    );
    results.push(...checked);
  }

  return NextResponse.json({
    total:    books.length,
    ok:       results.filter((r) => r.status === "ok").length,
    invalid:  results.filter((r) => r.status !== "ok").length,
    results,
  });
}
