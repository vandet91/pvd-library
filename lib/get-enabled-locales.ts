import { prisma } from "@/lib/prisma";
import { LOCALE_CODES, DEFAULT_LOCALE } from "@/lib/locales";

/**
 * Reads the ENABLED_LOCALES setting from the database and returns a filtered
 * list of locale codes that are both recognised (in ALL_LOCALES) and enabled.
 *
 * English (DEFAULT_LOCALE) is always included — it is the fallback language
 * and cannot be disabled.
 *
 * Falls back to all known locales if the setting has never been saved.
 */
export async function getEnabledLocales(): Promise<string[]> {
  try {
    const row = await prisma.settings.findUnique({
      where: { key: "ENABLED_LOCALES" },
    });

    if (row?.value) {
      const parsed: unknown = JSON.parse(row.value);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const valid = (parsed as unknown[])
          .filter((c): c is string => LOCALE_CODES.includes(c as LocaleCode))
          .filter((c, i, a) => a.indexOf(c) === i); // deduplicate

        // Always keep the default locale even if accidentally omitted
        if (!valid.includes(DEFAULT_LOCALE)) valid.unshift(DEFAULT_LOCALE);
        return valid;
      }
    }
  } catch {
    /* DB not reachable or invalid JSON — fall through to default */
  }

  // Default: all locales enabled
  return [...LOCALE_CODES];
}

// Needed for the type guard inside the function above
type LocaleCode = (typeof LOCALE_CODES)[number];
