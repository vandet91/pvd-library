"use client";

import { createContext, useContext } from "react";
import { type LocaleEntry, buildLocaleEntry } from "@/lib/locale-meta";

export type { LocaleEntry };

/**
 * Holds the list of enabled locales resolved at request time (from DB +
 * messages/ directory). Populated in RootLayout → Providers.
 *
 * Uses the runtime LocaleEntry type (not the compiled ALL_LOCALES tuple)
 * so locales added via the Translations admin tool appear immediately
 * without a server restart.
 */
const EnabledLocalesContext = createContext<LocaleEntry[]>([
  buildLocaleEntry("en"),
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
