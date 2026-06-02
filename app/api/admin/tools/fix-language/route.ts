import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";

/**
 * POST /api/admin/tools/fix-language
 *
 * During PMB import, `index_l` (Dewey call number) was mistakenly stored in
 * the `language` field. This tool moves those values to `location` and resets
 * `language` to null so it falls back to the schema default.
 *
 * A value is treated as a call number (not a language code) when it is longer
 * than 5 characters — real ISO language codes are 2–3 chars (en, km, fr, …).
 */
export async function POST() {
  const session = await auth();
  if (!session || !can(session.user?.role, "ADMIN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const updated = await prisma.$executeRawUnsafe(`
    UPDATE "Book"
    SET
      location = CASE WHEN location IS NULL OR location = '' THEN language ELSE location END,
      language = 'km'
    WHERE language IS NOT NULL
      AND LENGTH(language) > 5
  `);

  return NextResponse.json({ fixed: updated });
}
