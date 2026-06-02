import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { stripIsbn, formatIsbn } from "@/lib/isbn-format";

/**
 * An ISBN is "clean" only when:
 *   1. Digit count is exactly 10 or 13 after stripping, AND
 *   2. The stored value matches what our formatter would produce
 *      (i.e. hyphens are in the right places).
 *
 * This catches both truly invalid codes AND wrong-hyphenation values
 * like "978-99963-0176--6" that have the right digit count but bad dashes.
 */
function isClean(isbn: string | null): boolean {
  if (!isbn) return true;
  const stripped = stripIsbn(isbn);
  if (stripped.length !== 10 && stripped.length !== 13) return false;
  return formatIsbn(stripped) === isbn;
}

function suggested(isbn: string | null): string | null {
  if (!isbn) return null;
  const stripped = stripIsbn(isbn);
  if (stripped.length !== 10 && stripped.length !== 13) return null;
  const fmt = formatIsbn(stripped);
  return fmt !== isbn ? fmt : null;
}

// ── GET — scan and return stats + book list ──────────────────────────────
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const mode  = req.nextUrl.searchParams.get("mode") ?? "issues"; // "issues" | "all"
  const page  = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") ?? "1") || 1);
  const limit = 50;

  const all = await prisma.book.findMany({
    where:   { isbn: { not: null } },
    select:  { id: true, title: true, isbn: true, author: { select: { name: true } } },
    orderBy: { title: "asc" },
  });

  const totalWithIsbn = all.length;
  const issueBooks    = all.filter((b) => !isClean(b.isbn));
  const issueCount    = issueBooks.length;

  const source = mode === "all" ? all : issueBooks;
  const total  = source.length;
  const paged  = source.slice((page - 1) * limit, page * limit);

  return NextResponse.json({
    totalWithIsbn,
    issueCount,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    books: paged.map((b) => {
      const stripped = stripIsbn(b.isbn ?? "");
      const validLen = stripped.length === 10 || stripped.length === 13;
      return {
        id:          b.id,
        title:       b.title,
        author:      b.author?.name ?? null,
        isbn:        b.isbn,
        isValidLen:  validLen,
        isClean:     isClean(b.isbn),
        suggestion:  suggested(b.isbn),
      };
    }),
  });
}

// ── POST — fix actions ────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    action:  "fix-all" | "clear-invalid" | "clear" | "update";
    bookId?: string;
    isbn?:   string;
  };

  switch (body.action) {

    // Fix ALL issues: format valid-length ISBNs, clear truly invalid ones
    case "fix-all": {
      const books = await prisma.book.findMany({
        where:  { isbn: { not: null } },
        select: { id: true, isbn: true },
      });
      let fixed = 0;
      let cleared = 0;
      for (const b of books) {
        if (isClean(b.isbn)) continue;
        const stripped = stripIsbn(b.isbn ?? "");
        const validLen = stripped.length === 10 || stripped.length === 13;
        if (validLen) {
          // Fix hyphenation
          const fmt = formatIsbn(stripped);
          try {
            const conflict = await prisma.book.findFirst({ where: { isbn: fmt, id: { not: b.id } }, select: { id: true } });
            if (!conflict) { await prisma.book.update({ where: { id: b.id }, data: { isbn: fmt } }); fixed++; }
          } catch { /* skip */ }
        } else {
          // Invalid digit count — clear it
          await prisma.book.update({ where: { id: b.id }, data: { isbn: null } });
          cleared++;
        }
      }
      return NextResponse.json({ fixed, cleared, total: fixed + cleared });
    }

    // Clear only the truly invalid ISBNs (wrong digit count)
    case "clear-invalid": {
      const books = await prisma.book.findMany({ where: { isbn: { not: null } }, select: { id: true, isbn: true } });
      let cleared = 0;
      for (const b of books) {
        const stripped = stripIsbn(b.isbn ?? "");
        if (stripped.length !== 10 && stripped.length !== 13) {
          await prisma.book.update({ where: { id: b.id }, data: { isbn: null } });
          cleared++;
        }
      }
      return NextResponse.json({ cleared });
    }

    // Clear one book's ISBN
    case "clear": {
      if (!body.bookId) return NextResponse.json({ error: "bookId required" }, { status: 400 });
      await prisma.book.update({ where: { id: body.bookId }, data: { isbn: null } });
      return NextResponse.json({ ok: true });
    }

    // Update one book's ISBN
    case "update": {
      if (!body.bookId) return NextResponse.json({ error: "bookId required" }, { status: 400 });
      const raw     = (body.isbn ?? "").trim();
      const stripped = stripIsbn(raw);
      const validLen = stripped.length === 10 || stripped.length === 13;

      if (raw && !validLen)
        return NextResponse.json({ error: "ISBN must be 10 or 13 digits" }, { status: 400 });

      const isbn = validLen ? formatIsbn(stripped) : null;

      if (isbn) {
        const dup = await prisma.book.findFirst({ where: { isbn, id: { not: body.bookId } }, select: { id: true, title: true } });
        if (dup) return NextResponse.json({ error: `Already used by "${dup.title}"` }, { status: 409 });
      }

      await prisma.book.update({ where: { id: body.bookId }, data: { isbn } });
      return NextResponse.json({ ok: true, isbn });
    }

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
