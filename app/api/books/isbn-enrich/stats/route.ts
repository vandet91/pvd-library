import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { AI_ENABLED, AI_MODEL } from "@/lib/ai-client";

export async function GET() {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const base = { isbn: { not: null as null } };

  const [
    totalWithIsbn,
    missingCover,
    missingDescription,
    missingYear,
    missingPages,
    missingLanguage,
    missingAuthor,
    missingPublisher,
    totalBooks,
  ] = await Promise.all([
    prisma.book.count({ where: base }),
    prisma.book.count({ where: { ...base, coverImage: null } }),
    prisma.book.count({ where: { ...base, OR: [{ description: null }, { description: "" }] } }),
    prisma.book.count({ where: { ...base, publishYear: null } }),
    prisma.book.count({ where: { ...base, pages: null } }),
    prisma.book.count({ where: { ...base, OR: [{ language: null }, { language: "" }] } }),
    prisma.book.count({ where: { ...base, authorId: null } }),
    prisma.book.count({ where: { ...base, publisherId: null } }),
    prisma.book.count(),
  ]);

  return NextResponse.json({
    totalBooks,
    totalWithIsbn,
    missingCover,
    missingDescription,
    missingYear,
    missingPages,
    missingLanguage,
    missingAuthor,
    missingPublisher,
    aiAvailable: AI_ENABLED,
    aiModel:     AI_ENABLED ? AI_MODEL : null,
  });
}
