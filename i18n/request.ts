import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE } from "@/lib/locales";

export default getRequestConfig(async ({ requestLocale }) => {
  // requestLocale is set by setRequestLocale(locale) called in app/[locale]/layout.tsx.
  // This is the correct next-intl App Router pattern — no middleware header needed.
  let locale = await requestLocale;

  if (!locale) locale = DEFAULT_LOCALE;

  // Load the messages file — fall back to English if missing or invalid.
  let messages: Record<string, unknown>;
  try {
    messages = (await import(`../messages/${locale}.json`)).default;
  } catch {
    locale   = DEFAULT_LOCALE;
    messages = (await import(`../messages/en.json`)).default;
  }

  return { locale, messages };
});
