/**
 * Central locale registry — the single source of truth for all supported
 * languages in the library system.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  HOW TO ADD A NEW LANGUAGE
 * ═══════════════════════════════════════════════════════════════════
 *
 *  1. Add an entry to ALL_LOCALES below with the locale code, labels,
 *     and flag emoji.
 *
 *  2. Create `messages/{code}.json`. You can copy `messages/en.json`
 *     as a starting point and translate the strings. Any key that is
 *     NOT yet translated in the new file will automatically fall back
 *     to English at runtime — so a partial translation is fine.
 *     (If the file is missing entirely, the app will serve English.)
 *
 *  3. Enable the locale in Admin → Settings → Languages.
 *
 *  4. Restart the dev server (or redeploy) so next-intl picks up the
 *     new entry in routing.ts.
 *
 *  That's all. No other files need to change.
 *
 * ═══════════════════════════════════════════════════════════════════
 */

export const ALL_LOCALES = [
  {
    code:        "en",
    label:       "English",
    nativeLabel: "English",
    flag:        "🇺🇸",
    rtl:         false,
  },
  {
    code:        "km",
    label:       "Khmer",
    nativeLabel: "ខ្មែរ",
    flag:        "🇰🇭",
    rtl:         false,
  },

  // ── Add new languages here ───────────────────────────────────────
  // Example — French:
  // {
  //   code:        "fr",
  //   label:       "French",
  //   nativeLabel: "Français",
  //   flag:        "🇫🇷",
  //   rtl:         false,
  // },
  // ────────────────────────────────────────────────────────────────
] as const;

/** Union of all locale code strings, e.g. "en" | "km" */
export type LocaleCode = (typeof ALL_LOCALES)[number]["code"];

/** Locale codes as a non-empty tuple (required by next-intl defineRouting) */
export const LOCALE_CODES = ALL_LOCALES.map((l) => l.code) as [LocaleCode, ...LocaleCode[]];

/** The locale used as fallback when a translation is missing. */
export const DEFAULT_LOCALE: LocaleCode = "en";
