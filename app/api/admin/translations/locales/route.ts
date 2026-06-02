import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { listLocales, readLocale, writeLocale, localeName, flatten, setDeep } from "../route";

/* ── GET /api/admin/translations/locales ── */

export async function GET() {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const enFlat = flatten(readLocale("en"));
  const total  = Object.keys(enFlat).length;

  const locales = listLocales().map((code) => {
    const targetFlat = flatten(readLocale(code));
    const translated = Object.keys(enFlat).filter(
      (k) => targetFlat[k] && targetFlat[k] !== enFlat[k]
    ).length;
    return {
      code,
      name:        localeName(code),
      total,
      translated,
      missing:     total - translated,
      pct:         Math.round((translated / total) * 100),
      isSource:    code === "en",
    };
  });

  return NextResponse.json({ locales });
}

/* ── POST /api/admin/translations/locales ── */
// Body: { code: string, name?: string }  — creates a new empty locale file

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { code } = await req.json().catch(() => ({}));
  if (!code || !/^[a-z]{2,5}(-[A-Z]{2})?$/.test(code))
    return NextResponse.json({ error: "Invalid locale code (e.g. fr, zh, pt-BR)" }, { status: 400 });

  if (listLocales().includes(code))
    return NextResponse.json({ error: `Locale "${code}" already exists` }, { status: 409 });

  // Create skeleton — same structure as en but all values empty
  const enData = readLocale("en");
  const enFlat = flatten(enData);
  const skeleton: Record<string, unknown> = {};
  for (const key of Object.keys(enFlat)) setDeep(skeleton, key, "");
  writeLocale(code, skeleton);

  return NextResponse.json({ created: code, name: localeName(code) }, { status: 201 });
}

/* ── DELETE /api/admin/translations/locales ── */
// Body: { code: string }  — deletes a locale file (cannot delete "en")

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { code } = await req.json().catch(() => ({}));
  if (code === "en")
    return NextResponse.json({ error: "Cannot delete the source locale" }, { status: 403 });

  const fs   = await import("fs");
  const path = await import("path");
  const file = path.join(process.cwd(), "messages", `${code}.json`);
  if (!fs.existsSync(file))
    return NextResponse.json({ error: "Locale not found" }, { status: 404 });

  fs.unlinkSync(file);
  return NextResponse.json({ deleted: code });
}
