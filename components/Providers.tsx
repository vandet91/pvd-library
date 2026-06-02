"use client";

import { SessionProvider } from "next-auth/react";
import type { Session } from "next-auth";
import ThemeProvider, { type ThemeName, type AuthStyleName } from "@/components/ThemeProvider";
import { LibraryNameProvider } from "@/context/library-name";
import { LibraryLogoProvider } from "@/context/library-logo";
import { EnabledLocalesProvider, type LocaleEntry } from "@/context/enabled-locales";

export default function Providers({
  children,
  session,
  libraryName,
  libraryLogo,
  enabledLocales,
  serverTheme,
  serverAuthStyle,
}: {
  children:         React.ReactNode;
  session:          Session | null;
  libraryName:      string;
  libraryLogo:      string;
  enabledLocales:   LocaleEntry[];
  serverTheme?:     ThemeName | null;
  serverAuthStyle?: AuthStyleName | null;
}) {
  return (
    <SessionProvider session={session}>
      <LibraryNameProvider name={libraryName}>
        <LibraryLogoProvider url={libraryLogo}>
          <EnabledLocalesProvider locales={enabledLocales}>
            <ThemeProvider serverTheme={serverTheme} serverAuthStyle={serverAuthStyle}>
              {children}
            </ThemeProvider>
          </EnabledLocalesProvider>
        </LibraryLogoProvider>
      </LibraryNameProvider>
    </SessionProvider>
  );
}
