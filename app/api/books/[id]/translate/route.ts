import { NextRequest, NextResponse } from "next/server";
import { aiClient, AI_MODEL, AI_ENABLED } from "@/lib/ai-client";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!AI_ENABLED) {
    return NextResponse.json({ error: "AI not configured" }, { status: 503 });
  }

  const { id } = await params;
  const { field, targetLocale }: { field: "description" | "title"; targetLocale: "km" | "fr" } = await request.json();

  if (!["description", "title"].includes(field)) {
    return NextResponse.json({ error: "Invalid field" }, { status: 400 });
  }
  if (!["km", "fr"].includes(targetLocale)) {
    return NextResponse.json({ error: "Invalid targetLocale" }, { status: 400 });
  }

  const book = await prisma.book.findUnique({
    where: { id },
    select: { title: true, description: true },
  });
  if (!book) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  const sourceText = field === "title" ? book.title : (book.description ?? "");
  if (!sourceText) {
    return NextResponse.json({ error: "No source text to translate" }, { status: 400 });
  }

  const langInstructions: Record<string, string> = {
    km: "Translate to natural Khmer (ភាសាខ្មែរ). Use formal library/academic register.",
    fr: "Translate to formal French suitable for a library catalog.",
  };

  try {
    const completion = await aiClient.chat.completions.create({
      model: AI_MODEL,
      max_tokens: 800,
      messages: [
        {
          role: "system",
          content: `You are a professional translator for a library catalog. ${langInstructions[targetLocale]} Return ONLY the translated text with no explanation or commentary.`,
        },
        {
          role: "user",
          content: sourceText,
        },
      ],
    });

    const translated = completion.choices[0]?.message?.content?.trim() ?? "";
    return NextResponse.json({ translated });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "AI error" }, { status: 500 });
  }
}
