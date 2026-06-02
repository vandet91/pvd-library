import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";

export interface DupAuthor {
  id:        string;
  name:      string;
  bookCount: number;
  coAuthorCount: number;
  ebookCount: number;
  createdAt: string;
}

export interface DupGroup {
  key:     string;   // normalised name
  authors: DupAuthor[];
}

// ── GET — find duplicate author groups ───────────────────────────────────
export async function GET() {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const authors = await prisma.author.findMany({
    select: {
      id: true, name: true, createdAt: true,
      _count: { select: { books: true, coAuthoredBooks: true, ebooks: true } },
    },
    orderBy: { name: "asc" },
  });

  const byName = new Map<string, typeof authors>();
  for (const a of authors) {
    // Normalise: lowercase, trim, collapse spaces
    const key = a.name.toLowerCase().trim().replace(/\s+/g, " ");
    const list = byName.get(key) ?? [];
    list.push(a);
    byName.set(key, list);
  }

  const groups: DupGroup[] = [];
  for (const [key, list] of byName) {
    if (list.length < 2) continue;
    groups.push({
      key,
      authors: list.map((a) => ({
        id:           a.id,
        name:         a.name,
        bookCount:    a._count.books,
        coAuthorCount: a._count.coAuthoredBooks,
        ebookCount:   a._count.ebooks,
        createdAt:    a.createdAt.toISOString(),
      })),
    });
  }

  groups.sort((a, b) => b.authors.length - a.authors.length);

  const totalDuplicates = groups.reduce((s, g) => s + g.authors.length - 1, 0);
  return NextResponse.json({ groups, totalDuplicates, totalGroups: groups.length });
}

// ── POST — merge duplicate authors into the kept one ─────────────────────
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { action, keepId, deleteIds } = await req.json() as {
    action:     "merge" | "merge-all-empty";
    keepId?:    string;
    deleteIds?: string[];
  };

  // ── merge: re-point all books/ebooks from deleteIds → keepId, then delete
  if (action === "merge" && keepId && Array.isArray(deleteIds) && deleteIds.length > 0) {
    let merged = 0; const errors: string[] = [];

    for (const dupId of deleteIds) {
      if (dupId === keepId) continue;
      try {
        await prisma.$transaction(async (tx) => {
          // Re-point primary author on books
          await tx.book.updateMany({
            where:  { authorId: dupId },
            data:   { authorId: keepId },
          });
          // Re-point primary author on ebooks
          await tx.ebook.updateMany({
            where:  { authorId: dupId },
            data:   { authorId: keepId },
          });
          // Re-point co-author links — connect keepId, disconnect dupId
          const coBooks = await tx.book.findMany({
            where:  { coAuthors: { some: { id: dupId } } },
            select: { id: true, coAuthors: { select: { id: true } } },
          });
          for (const book of coBooks) {
            const alreadyHasKeep = book.coAuthors.some((a) => a.id === keepId);
            await tx.book.update({
              where: { id: book.id },
              data: {
                coAuthors: {
                  disconnect: { id: dupId },
                  ...(alreadyHasKeep ? {} : { connect: { id: keepId } }),
                },
              },
            });
          }
          // Delete the duplicate
          await tx.author.delete({ where: { id: dupId } });
        });
        merged++;
      } catch (e) {
        errors.push(`${dupId}: ${e instanceof Error ? e.message : "error"}`);
      }
    }
    return NextResponse.json({ merged, errors });
  }

  // ── merge-all-empty: auto-merge every group where duplicates have 0 books
  if (action === "merge-all-empty") {
    const res  = await GET();
    const { groups } = await res.json() as { groups: DupGroup[] };
    let merged = 0; let skipped = 0;

    for (const group of groups) {
      const keepId = pickKeep(group.authors);
      const toDelete = group.authors
        .filter((a) => a.id !== keepId && a.bookCount === 0 && a.coAuthorCount === 0 && a.ebookCount === 0)
        .map((a) => a.id);

      if (toDelete.length === 0) { skipped += group.authors.length - 1; continue; }

      for (const dupId of toDelete) {
        try {
          await prisma.author.delete({ where: { id: dupId } });
          merged++;
        } catch { skipped++; }
      }
    }
    return NextResponse.json({ merged, skipped });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

// ── Helper — pick the author to keep ─────────────────────────────────────
function pickKeep(authors: DupAuthor[]): string {
  return [...authors].sort((a, b) => {
    const as = a.bookCount + a.coAuthorCount + a.ebookCount;
    const bs = b.bookCount + b.coAuthorCount + b.ebookCount;
    if (bs !== as) return bs - as;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  })[0].id;
}
