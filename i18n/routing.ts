import { defineRouting } from "next-intl/routing";
import { LOCALE_CODES, DEFAULT_LOCALE } from "@/lib/locales";

/**
 * Static routing config for next-intl navigation helpers (Link, useRouter, etc.).
 * The proxy.ts reads locales dynamically from messages/ at runtime for
 * actual routing — this config is only used for type-safe client-side navigation.
 */
export const routing = defineRouting({
  locales:       LOCALE_CODES,
  defaultLocale: DEFAULT_LOCALE,
});
