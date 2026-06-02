import { NextRequest, NextResponse } from "next/server";
import { aiClient, AI_MODEL, AI_ENABLED } from "@/lib/ai-client";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!AI_ENABLED) {
    return NextResponse.json({ error: "AI not configured" }, { status: 503 });
  }

  const { title, subtitle, description, isbn, authorName } = await request.json();

  try {
    const completion = await aiClient.chat.completions.create({
      model: AI_MODEL,
      max_tokens: 300,
      messages: [
        {
          role: "system",
          content:
            "You are a librarian cataloging assistant. Given book metadata, suggest the most appropriate audience level and a category name. Respond ONLY with valid JSON matching this schema: {\"audienceLevel\":\"CHILDREN\"|\"YOUTH\"|\"ADULTS\"|\"UNSPECIFIED\",\"categoryName\":\"string\",\"reasoning\":\"string (1-2 sentences)\"}",
        },
        {
          role: "user",
          content: `Title: ${title}${subtitle ? `\nSubtitle: ${subtitle}` : ""}${description ? `\nDescription: ${description}` : ""}${isbn ? `\nISBN: ${isbn}` : ""}${authorName ? `\nAuthor: ${authorName}` : ""}`,
        },
      ],
    });

    const text = completion.choices[0]?.message?.content ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON in response");
    const parsed = JSON.parse(match[0]);

    return NextResponse.json(parsed);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "AI error" }, { status: 500 });
  }
}
