import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import fs from "fs";
import path from "path";

/* ── File helpers ───────────────────────────────────────────────────────────── */

const MESSAGES_DIR = path.join(process.cwd(), "messages");

export function readLocale(locale: string): Record<string, unknown> {
  const file = path.join(MESSAGES_DIR, `${locale}.json`);
  if (!fs.existsSync(file)) return {};
  try { return JSON.parse(fs.readFileSync(file, "utf-8")); } catch { return {}; }
}

export function writeLocale(locale: string, data: Record<string, unknown>): void {
  const file = path.join(MESSAGES_DIR, `${locale}.json`);
  fs.mkdirSync(MESSAGES_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

/** Recursively flatten nested JSON into dot-notation keys */
export function flatten(obj: Record<string, unknown>, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v))
      Object.assign(out, flatten(v as Record<string, unknown>, key));
    else
      out[key] = String(v ?? "");
  }
  return out;
}

/** Set a value on a nested object by dot-path, creating missing levels */
export function setDeep(obj: Record<string, unknown>, dotPath: string, value: string): void {
  const parts = dotPath.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof cur[parts[i]] !== "object" || cur[parts[i]] === null)
      cur[parts[i]] = {};
    cur = cur[parts[i]] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

/** Available locales = all *.json files in messages/ */
export function listLocales(): string[] {
  if (!fs.existsSync(MESSAGES_DIR)) return ["en"];
  return fs
    .readdirSync(MESSAGES_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(".json", ""))
    .sort((a, b) => (a === "en" ? -1 : b === "en" ? 1 : a.localeCompare(b)));
}

/** Locale display names */
const LOCALE_NAMES: Record<string, string> = {
  en: "English", km: "ខ្មែរ (Khmer)", fr: "Français", zh: "中文",
  ja: "日本語", ko: "한국어", th: "ภาษาไทย", vi: "Tiếng Việt",
  ar: "العربية", es: "Español", de: "Deutsch", pt: "Português",
  ru: "Русский", id: "Bahasa Indonesia", ms: "Bahasa Melayu",
};

export function localeName(code: string): string {
  return LOCALE_NAMES[code] ?? code.toUpperCase();
}

/* ── GET /api/admin/translations ────────────────────────────────────────────── */
// ?locale=km&namespace=common&search=&filter=all|missing|translated&page=1&limit=25

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp        = new URL(req.url).searchParams;
  const locale    = sp.get("locale")    ?? "km";
  const namespace = sp.get("namespace") ?? "";
  const search    = (sp.get("search")   ?? "").toLowerCase().trim();
  const filter    = sp.get("filter")    ?? "all";  // all | missing | translated
  const page      = Math.max(1, parseInt(sp.get("page")  ?? "1",  10) || 1);
  const limit     = Math.min(   parseInt(sp.get("limit") ?? "50", 10) || 50, 200);

  const enData     = readLocale("en");
  const targetData = readLocale(locale);
  const enFlat     = flatten(enData);
  const targetFlat = flatten(targetData);

  /* ── Namespace stats ── */
  const nsMap: Record<string, { total: number; missing: number }> = {};
  for (const key of Object.keys(enFlat)) {
    const ns = key.split(".")[0];
    if (!nsMap[ns]) nsMap[ns] = { total: 0, missing: 0 };
    nsMap[ns].total++;
    if (!targetFlat[key] || targetFlat[key] === enFlat[key]) nsMap[ns].missing++;
  }

  /* ── Filter keys ── */
  let keys = Object.keys(enFlat);

  if (namespace) keys = keys.filter((k) => k.split(".")[0] === namespace);

  if (search) keys = keys.filter((k) =>
    k.toLowerCase().includes(search) ||
    enFlat[k].toLowerCase().includes(search) ||
    (targetFlat[k] ?? "").toLowerCase().includes(search)
  );

  if (filter === "missing")    keys = keys.filter((k) => !targetFlat[k] || targetFlat[k] === enFlat[k]);
  if (filter === "translated") keys = keys.filter((k) => !!targetFlat[k] && targetFlat[k] !== enFlat[k]);

  /* ── Paginate ── */
  const total = keys.length;
  const paged = keys.slice((page - 1) * limit, page * limit);

  const items = paged.map((key) => ({
    key,
    en:         enFlat[key] ?? "",
    value:      targetFlat[key] ?? "",
    missing:    !targetFlat[key] || targetFlat[key] === enFlat[key],
    namespace:  key.split(".")[0],
  }));

  return NextResponse.json({
    locales:    listLocales().map((c) => ({ code: c, name: localeName(c) })),
    namespaces: nsMap,
    total,
    pages:      Math.ceil(total / limit) || 1,
    items,
  });
}

/* ── PUT /api/admin/translations ────────────────────────────────────────────── */
// Body: { locale: string, changes: Record<string, string> }

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { locale, changes }: { locale: string; changes: Record<string, string> } = await req.json();

  if (!locale || !/^[a-z]{2,5}(-[A-Z]{2})?$/.test(locale))
    return NextResponse.json({ error: "Invalid locale code" }, { status: 400 });

  if (locale === "en")
    return NextResponse.json({ error: "Cannot edit the source (en) locale" }, { status: 403 });

  const data = readLocale(locale);
  let count = 0;

  for (const [key, value] of Object.entries(changes)) {
    if (typeof key === "string" && typeof value === "string") {
      setDeep(data, key, value);
      count++;
    }
  }

  writeLocale(locale, data);
  return NextResponse.json({ saved: count });
}
