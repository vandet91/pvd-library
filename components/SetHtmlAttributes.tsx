"use client";

import { useEffect } from "react";

/**
 * Sets locale-specific attributes on <html> and <body> after hydration.
 * Required because Next.js 16 mandates html/body live in the root layout,
 * but locale-specific classes (font-khmer, lang attr) are only known in the
 * locale layout. suppressHydrationWarning on root's html/body + this component
 * handles the mismatch cleanly.
 */
export default function SetHtmlAttributes({ locale }: { locale: string }) {
  useEffect(() => {
    document.documentElement.lang = locale;
    if (locale === "km") {
      document.body.classList.add("font-khmer");
      document.body.classList.remove("font-sans");
    } else {
      document.body.classList.add("font-sans");
      document.body.classList.remove("font-khmer");
    }
  }, [locale]);

  return null;
}
