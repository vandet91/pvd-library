"use client";

import { useLocale } from "next-intl";
import { useEnabledLocales } from "@/context/enabled-locales";

interface Props {
  /**
   * "dark"  — white text/pill on a coloured/dark background (default).
   *           Used on auth glass page, member page dark headers, etc.
   * "light" — dark text/pill on a white/light background.
   *           Used on auth split & minimal right panels, white top bars.
   */
  variant?: "dark" | "light";
}

export default function LanguageToggle({ variant = "dark" }: Props) {
  const locale = useLocale();

  // Only render buttons for locales the admin has enabled
  const enabledLocales = useEnabledLocales();

  function switchLocale(next: string) {
    // Hard redirect so the address bar always reflects the new locale.
    // Locale is always the first path segment: /en/... or /km/...
    const segments = window.location.pathname.split("/");
    segments[1] = next;
    window.location.href = segments.join("/");
  }

  // If only one locale is enabled, hide the toggle entirely — no point showing it
  if (enabledLocales.length <= 1) return null;

  const isDark = variant === "dark";

  const wrapperCls = isDark
    ? "bg-white/10 border border-white/20"
    : "bg-gray-100 border border-gray-200";

  const activeCls = isDark
    ? "bg-white text-blue-900 shadow-sm"
    : "bg-white text-gray-900 shadow-sm border border-gray-200";

  const inactiveCls = isDark
    ? "text-white/70 hover:bg-white/15 hover:text-white"
    : "text-gray-500 hover:bg-gray-200 hover:text-gray-800";

  return (
    <div className={`flex items-center gap-0.5 rounded-lg p-0.5 ${wrapperCls}`}>
      {enabledLocales.map(({ code, nativeLabel }) => (
        <button
          key={code}
          onClick={() => switchLocale(code)}
          disabled={locale === code}
          className={`px-3 py-1 rounded-md text-sm font-medium transition-all duration-150 disabled:cursor-default
            ${locale === code ? activeCls : inactiveCls}`}
        >
          {nativeLabel}
        </button>
      ))}
    </div>
  );
}
