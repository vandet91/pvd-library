import { defineRouting } from "next-intl/routing";
import { LOCALE_CODES, DEFAULT_LOCALE } from "@/lib/locales";

/**
 * next-intl routing configuration.
 *
 * LOCALE_CODES is derived from lib/locales.ts — that file is the one place
 * you edit when adding a new language.
 */
export const routing = defineRouting({
  locales:       LOCALE_CODES,
  defaultLocale: DEFAULT_LOCALE,
});
