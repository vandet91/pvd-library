import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { aiClient, AI_MODEL, AI_ENABLED } from "@/lib/ai-client";
import { localeName } from "../route";

const BATCH_SIZE = 30; // keys per AI request

/* ── POST /api/admin/translations/ai ───────────────────────────────────────── */
// Body: { locale: string, keys: string[], enValues: Record<string, string> }
// Returns: { translations: Record<string, string> }

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!AI_ENABLED)
    return NextResponse.json({ error: "AI is not configured" }, { status: 503 });

  const {
    locale,
    keys,
    enValues,
  }: {
    locale:   string;
    keys:     string[];
    enValues: Record<string, string>;
  } = await req.json();

  if (!locale || !Array.isArray(keys) || keys.length === 0)
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const targetName = localeName(locale);
  const allResults: Record<string, string> = {};

  // Process in batches to stay within token limits
  for (let i = 0; i < keys.length; i += BATCH_SIZE) {
    const batch    = keys.slice(i, i + BATCH_SIZE);
    const payload  = Object.fromEntries(batch.map((k) => [k, enValues[k] ?? ""]));

    const prompt = `You are a professional translator. Translate the following UI strings from English to ${targetName}.

Rules:
- Keep placeholders like {name}, {count}, {date} EXACTLY as-is — do not translate them.
- Keep punctuation style (e.g. "…" ellipsis, trailing period) consistent.
- Keep HTML tags like <strong>, <em> intact if present.
- For very short strings (buttons, labels), be concise and natural.
- If a string is already in ${targetName} or is a proper noun/code, keep it unchanged.
- Return ONLY a valid JSON object with the same keys, no markdown, no explanation.

Strings to translate:
${JSON.stringify(payload, null, 2)}

Return ONLY JSON:`;

    try {
      const response = await aiClient.chat.completions.create({
        model:       AI_MODEL,
        temperature: 0.2,
        max_tokens:  2000,
        messages:    [{ role: "user", content: prompt }],
      });

      const raw  = response.choices[0]?.message?.content?.trim() ?? "";
      const json = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
      const parsed: Record<string, string> = JSON.parse(json);

      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === "string" && batch.includes(k)) {
          allResults[k] = v;
        }
      }
    } catch {
      // If a batch fails, skip it — partial results are still useful
    }
  }

  return NextResponse.json({ translations: allResults });
}
