"use client";

import { createContext, useContext } from "react";
import { ALL_LOCALES } from "@/lib/locales";

type LocaleEntry = (typeof ALL_LOCALES)[number];

/**
 * Holds the list of enabled locales fetched server-side (from Settings →
 * ENABLED_LOCALES). Populated once in RootLayout → Providers and available
 * to every client component (LanguageToggle, etc.).
 */
const EnabledLocalesContext = createContext<LocaleEntry[]>([
  ...ALL_LOCALES,
]);

export function EnabledLocalesProvider({
  locales,
  children,
}: {
  locales: LocaleEntry[];
  children: React.ReactNode;
}) {
  return (
    <EnabledLocalesContext.Provider value={locales}>
      {children}
    </EnabledLocalesContext.Provider>
  );
}

/** Returns the currently-enabled locales as full locale-entry objects. */
export function useEnabledLocales(): LocaleEntry[] {
  return useContext(EnabledLocalesContext);
}
