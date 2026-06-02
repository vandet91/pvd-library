import { NextRequest, NextResponse } from "next/server";
import { aiClient, AI_MODEL, AI_ENABLED } from "@/lib/ai-client";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

const VALID_FIELDS = ["description", "audienceLevel", "language", "category"] as const;
type EnrichField = typeof VALID_FIELDS[number];

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!AI_ENABLED) {
    return NextResponse.json({ error: "AI not configured" }, { status: 503 });
  }

  const { bookIds, fields }: { bookIds: string[]; fields: string[] } = await request.json();
  if (!Array.isArray(bookIds) || bookIds.length === 0) {
    return NextResponse.json({ error: "bookIds required" }, { status: 400 });
  }
  const validFields = (fields ?? []).filter((f): f is EnrichField => VALID_FIELDS.includes(f as EnrichField));
  if (validFields.length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  const results: { bookId: string; fields: Record<string, string> }[] = [];
  let enriched = 0;
  let errors   = 0;

  // Process in batches of 5
  for (let i = 0; i < bookIds.length; i += 5) {
    const batch = bookIds.slice(i, i + 5);
    await Promise.all(batch.map(async (bookId) => {
      try {
        const book = await prisma.book.findUnique({
          where: { id: bookId },
          select: { id: true, title: true, isbn: true, description: true, audienceLevel: true, language: true, categoryId: true },
        });
        if (!book) return;

        const prompt = `Book title: "${book.title}"${book.isbn ? `, ISBN: ${book.isbn}` : ""}.
Fields to fill (only fill if missing/unspecified): ${validFields.join(", ")}.
Current values: description="${book.description ?? ""}", audienceLevel="${book.audienceLevel}", language="${book.language ?? ""}", hasCategory=${!!book.categoryId}.
Respond ONLY with JSON: {"description":"...","audienceLevel":"CHILDREN|YOUTH|ADULTS|UNSPECIFIED","language":"en|fr|km|...","category":"category name or empty string"}. Only include fields you are confident about. Leave empty string if unsure.`;

        const completion = await aiClient.chat.completions.create({
          model: AI_MODEL,
          max_tokens: 400,
          messages: [
            { role: "system", content: "You are a library cataloging assistant. Return only valid JSON." },
            { role: "user", content: prompt },
          ],
        });

        const text  = completion.choices[0]?.message?.content ?? "";
        const match = text.match(/\{[\s\S]*\}/);
        if (!match) return;

        const suggested = JSON.parse(match[0]) as Record<string, string>;
        const update: Record<string, unknown> = {};
        const applied: Record<string, string> = {};

        if (validFields.includes("description") && suggested.description && !book.description) {
          update.description = suggested.description;
          applied.description = suggested.description;
        }
        if (validFields.includes("audienceLevel") && suggested.audienceLevel &&
          suggested.audienceLevel !== "UNSPECIFIED" && book.audienceLevel === "UNSPECIFIED") {
          const valid = ["CHILDREN", "YOUTH", "ADULTS", "UNSPECIFIED"];
          if (valid.includes(suggested.audienceLevel)) {
            update.audienceLevel = suggested.audienceLevel;
            applied.audienceLevel = suggested.audienceLevel;
          }
        }
        if (validFields.includes("language") && suggested.language && !book.language) {
          update.language = suggested.language;
          applied.language = suggested.language;
        }
        if (validFields.includes("category") && suggested.category && !book.categoryId) {
          // Find or create category
          let cat = await prisma.category.findFirst({
            where: { name: { equals: suggested.category, mode: "insensitive" } },
          });
          if (!cat) {
            cat = await prisma.category.create({ data: { name: suggested.category } });
          }
          update.categoryId = cat.id;
          applied.category = suggested.category;
        }

        if (Object.keys(update).length > 0) {
          await prisma.book.update({ where: { id: bookId }, data: update });
          enriched++;
        }

        results.push({ bookId, fields: applied });
      } catch {
        errors++;
      }
    }));
  }

  return NextResponse.json({ enriched, errors, results });
}
