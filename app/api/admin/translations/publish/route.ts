import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { LOCALE_META } from "@/lib/locale-meta";
import fs from "fs";
import path from "path";

/* ── Read locales.ts and check if a code is already registered ──────────────── */

const LOCALES_FILE = path.join(process.cwd(), "lib", "locales.ts");

function isRegistered(code: string): boolean {
  const content = fs.readFileSync(LOCALES_FILE, "utf-8");
  return new RegExp(`code:\\s*["']${code}["']`).test(content);
}

/**
 * Insert a new locale entry into lib/locales.ts before the
 * "Add new languages here" comment section.
 */
function registerLocale(code: string): boolean {
  try {
    const content  = fs.readFileSync(LOCALES_FILE, "utf-8");
    if (new RegExp(`code:\\s*["']${code}["']`).test(content)) return false; // already there

    const meta = LOCALE_META[code] ?? {
      label:       code.toUpperCase(),
      nativeLabel: code.toUpperCase(),
      flag:        "🌐",
      rtl:         false,
    };

    const entry = `  {
    code:        "${code}",
    label:       "${meta.label}",
    nativeLabel: "${meta.nativeLabel}",
    flag:        "${meta.flag}",
    rtl:         ${meta.rtl},
  },\n\n`;

    // Insert just before the "── Add new languages here" comment
    const marker = "  // ── Add new languages here";
    const updated = content.includes(marker)
      ? content.replace(marker, entry + marker)
      : content.replace("] as const;", entry + "] as const;");

    fs.writeFileSync(LOCALES_FILE, updated, "utf-8");
    return true;
  } catch {
    return false;
  }
}

/* ── POST /api/admin/translations/publish ───────────────────────────────────── */
// Body: { locale: string, enabled: boolean }

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { locale, enabled }: { locale: string; enabled: boolean } = await req.json();

  if (!locale || !/^[a-z]{2,5}(-[A-Z]{2})?$/.test(locale))
    return NextResponse.json({ error: "Invalid locale code" }, { status: 400 });

  if (locale === "en")
    return NextResponse.json({ error: "English is always enabled" }, { status: 400 });

  /* ── 1. Update ENABLED_LOCALES in DB ── */
  const row = await prisma.settings.findUnique({ where: { key: "ENABLED_LOCALES" } });

  // Default: all locales that have a messages file (never drop existing ones)
  let current: string[] = ["en"];
  if (row?.value) {
    try { current = JSON.parse(row.value); } catch { /* ignore */ }
  } else {
    // No DB row yet — seed from messages/ directory
    try {
      const messagesDir = path.join(process.cwd(), "messages");
      current = fs.readdirSync(messagesDir)
        .filter((f) => f.endsWith(".json"))
        .map((f) => f.replace(".json", ""))
        .filter((c) => /^[a-z]{2,5}(-[A-Z]{2})?$/.test(c));
    } catch { /* ignore */ }
  }

  const updated = enabled
    ? [...new Set([...current, locale])]
    : current.filter((c) => c !== locale);

  await prisma.settings.upsert({
    where:  { key: "ENABLED_LOCALES" },
    update: { value: JSON.stringify(updated) },
    create: { key: "ENABLED_LOCALES", value: JSON.stringify(updated) },
  });

  /* ── 2. Register in lib/locales.ts if needed ── */
  let restartRequired = false;
  if (enabled && !isRegistered(locale)) {
    const registered = registerLocale(locale);
    restartRequired  = registered; // new entry added → restart needed
  }

  return NextResponse.json({
    locale,
    enabled,
    enabledLocales:  updated,
    restartRequired,
  });
}
