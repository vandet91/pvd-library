import { prisma } from "@/lib/prisma";
import { DEFAULT_LOCALE } from "@/lib/locales";
import { buildLocaleEntry, type LocaleEntry } from "@/lib/locale-meta";
import fs from "fs";
import path from "path";

const MESSAGES_DIR = path.join(process.cwd(), "messages");

/** Returns true if a messages file exists for this locale code. */
function hasMessagesFile(code: string): boolean {
  return fs.existsSync(path.join(MESSAGES_DIR, `${code}.json`));
}

/**
 * Reads enabled locale codes from the DB settings, then resolves each one
 * dynamically against the messages/ directory.
 *
 * — English (DEFAULT_LOCALE) is always included.
 * — A locale is included only if its messages/{code}.json file exists.
 * — Works with any locale added via the Translations admin tool without a restart.
 */
export async function getEnabledLocales(): Promise<LocaleEntry[]> {
  // Default: all locales that have a messages file
  function allFromDisk(): string[] {
    try {
      return fs.readdirSync(MESSAGES_DIR)
        .filter((f) => f.endsWith(".json"))
        .map((f) => f.replace(".json", ""))
        .filter((c) => /^[a-z]{2,5}(-[A-Z]{2})?$/.test(c));
    } catch { return [DEFAULT_LOCALE]; }
  }

  let codes: string[] = allFromDisk();

  try {
    const row = await prisma.settings.findUnique({
      where: { key: "ENABLED_LOCALES" },
    });

    if (row?.value) {
      const parsed: unknown = JSON.parse(row.value);
      if (Array.isArray(parsed) && parsed.length > 0) {
        codes = (parsed as unknown[]).filter((c): c is string => typeof c === "string");
      }
    }
    // If no DB row, fall through to allFromDisk() default above
  } catch {
    /* DB not reachable — use all message files as fallback */
  }

  // Always ensure the default locale is present and first
  if (!codes.includes(DEFAULT_LOCALE)) codes.unshift(DEFAULT_LOCALE);

  // Deduplicate, then filter to locales that actually have a messages file
  const seen = new Set<string>();
  const valid: LocaleEntry[] = [];

  for (const code of codes) {
    if (seen.has(code)) continue;
    seen.add(code);
    if (hasMessagesFile(code)) {
      valid.push(buildLocaleEntry(code));
    }
  }

  // Always keep English even if its file is somehow missing
  if (!valid.find((l) => l.code === DEFAULT_LOCALE)) {
    valid.unshift(buildLocaleEntry(DEFAULT_LOCALE));
  }

  return valid;
}
