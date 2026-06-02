import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import SetHtmlAttributes from "@/components/SetHtmlAttributes";
import { prisma } from "@/lib/prisma";
import { getOpacTheme } from "@/lib/opac-theme";
import fs   from "fs";
import path from "path";

function hasMessagesFile(code: string): boolean {
  return fs.existsSync(path.join(process.cwd(), "messages", `${code}.json`));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // Reject locales that have no messages file (covers both built-in and dynamic)
  if (!hasMessagesFile(locale)) {
    notFound();
  }

  // Tell next-intl which locale to use for this request.
  // This is the correct App Router pattern — sets the locale in React's cache
  // so getMessages() and all useTranslations() hooks use the right language.
  setRequestLocale(locale);

  const [messages, themeSetting] = await Promise.all([
    getMessages(),
    prisma.settings.findUnique({ where: { key: "OPAC_THEME" } }).catch(() => null),
  ]);

  const theme = getOpacTheme(themeSetting?.value);

  return (
    <>
      {/*
       * Inject OPAC theme CSS variables once, at the layout level, so every
       * page that mounts/unmounts its own nav gets the right colour on first
       * paint — no flash on page-switch or hard-refresh.
       */}
      <style dangerouslySetInnerHTML={{
        __html: `:root{--m-nav-bg:${theme.navCss};--m-hero-bg:${theme.heroCss}}`
      }} />
      {/*
       * SetHtmlAttributes updates lang + font class on the client whenever the
       * locale changes (e.g. the user switches language without a full reload).
       * The initial server-side lang attr is set by the root layout via the
       * X-NEXT-INTL-LOCALE header injected by the next-intl proxy middleware.
       */}
      <SetHtmlAttributes locale={locale} />
      <NextIntlClientProvider messages={messages}>
        {children}
      </NextIntlClientProvider>
    </>
  );
}
