import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import SetHtmlAttributes from "@/components/SetHtmlAttributes";

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // Reject locales not registered in the routing table (404 rather than crash)
  if (!(routing.locales as readonly string[]).includes(locale)) {
    notFound();
  }

  const messages = await getMessages();

  return (
    <>
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
