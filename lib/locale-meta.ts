/**
 * Runtime locale metadata map — used when a locale is enabled via the admin
 * Translations tool but is not yet compiled into ALL_LOCALES.
 *
 * This is intentionally a plain Record (not `as const`) so it can be extended
 * at runtime without a restart.
 */
export interface LocaleEntry {
  code:        string;
  label:       string;
  nativeLabel: string;
  flag:        string;
  rtl:         boolean;
}

export const LOCALE_META: Record<string, Omit<LocaleEntry, "code">> = {
  en: { label: "English",      nativeLabel: "English",          flag: "🇺🇸", rtl: false },
  km: { label: "Khmer",        nativeLabel: "ខ្មែរ",             flag: "🇰🇭", rtl: false },
  fr: { label: "French",       nativeLabel: "Français",          flag: "🇫🇷", rtl: false },
  de: { label: "German",       nativeLabel: "Deutsch",           flag: "🇩🇪", rtl: false },
  es: { label: "Spanish",      nativeLabel: "Español",           flag: "🇪🇸", rtl: false },
  pt: { label: "Portuguese",   nativeLabel: "Português",         flag: "🇵🇹", rtl: false },
  zh: { label: "Chinese",      nativeLabel: "中文",               flag: "🇨🇳", rtl: false },
  ja: { label: "Japanese",     nativeLabel: "日本語",             flag: "🇯🇵", rtl: false },
  ko: { label: "Korean",       nativeLabel: "한국어",             flag: "🇰🇷", rtl: false },
  th: { label: "Thai",         nativeLabel: "ภาษาไทย",           flag: "🇹🇭", rtl: false },
  vi: { label: "Vietnamese",   nativeLabel: "Tiếng Việt",        flag: "🇻🇳", rtl: false },
  id: { label: "Indonesian",   nativeLabel: "Bahasa Indonesia",  flag: "🇮🇩", rtl: false },
  ms: { label: "Malay",        nativeLabel: "Bahasa Melayu",     flag: "🇲🇾", rtl: false },
  ar: { label: "Arabic",       nativeLabel: "العربية",            flag: "🇸🇦", rtl: true  },
  ru: { label: "Russian",      nativeLabel: "Русский",           flag: "🇷🇺", rtl: false },
  it: { label: "Italian",      nativeLabel: "Italiano",          flag: "🇮🇹", rtl: false },
  nl: { label: "Dutch",        nativeLabel: "Nederlands",        flag: "🇳🇱", rtl: false },
  pl: { label: "Polish",       nativeLabel: "Polski",            flag: "🇵🇱", rtl: false },
  tr: { label: "Turkish",      nativeLabel: "Türkçe",            flag: "🇹🇷", rtl: false },
  hi: { label: "Hindi",        nativeLabel: "हिन्दी",            flag: "🇮🇳", rtl: false },
  bn: { label: "Bengali",      nativeLabel: "বাংলা",             flag: "🇧🇩", rtl: false },
  my: { label: "Burmese",      nativeLabel: "မြန်မာဘာသာ",         flag: "🇲🇲", rtl: false },
  lo: { label: "Lao",          nativeLabel: "ລາວ",               flag: "🇱🇦", rtl: false },
};

/** Build a full LocaleEntry for any locale code, using LOCALE_META with a generic fallback. */
export function buildLocaleEntry(code: string): LocaleEntry {
  const meta = LOCALE_META[code];
  return {
    code,
    label:       meta?.label       ?? code.toUpperCase(),
    nativeLabel: meta?.nativeLabel ?? code.toUpperCase(),
    flag:        meta?.flag        ?? "🌐",
    rtl:         meta?.rtl         ?? false,
  };
}
