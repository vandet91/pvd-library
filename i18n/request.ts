import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";
import { getEnabledLocales } from "@/lib/get-enabled-locales";

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  // 1. Must be a locale that next-intl recognises in its routing table
  if (!locale || !routing.locales.includes(locale as (typeof routing.locales)[number])) {
    locale = routing.defaultLocale;
  }

  // 2. Must be enabled by the library admin (Settings → Languages).
  //    Disabled locales fall back to English so content is still readable.
  const enabled = await getEnabledLocales();
  if (!enabled.includes(locale)) {
    locale = routing.defaultLocale;
  }

  // 3. Try to load the locale's message file.
  //    If it doesn't exist yet (e.g. a newly registered locale without a
  //    translation file), fall back to English so the app keeps working.
  let messages: Record<string, unknown>;
  try {
    messages = (await import(`../messages/${locale}.json`)).default;
  } catch {
    locale = routing.defaultLocale;
    messages = (await import(`../messages/en.json`)).default;
  }

  return { locale, messages };
});
