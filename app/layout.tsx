import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Noto_Sans_Khmer } from "next/font/google";
import { cookies, headers } from "next/headers";
import Providers from "@/components/Providers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEnabledLocales } from "@/lib/get-enabled-locales";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const notoKhmer = Noto_Sans_Khmer({
  subsets: ["khmer"],
  variable: "--font-khmer",
  weight: "variable", // variable font — one file covers all weights; preload covers everything
  display: "block",
  preload: true,
});

export const metadata: Metadata = {
  title: "PVD Library",
  description: "Library Management System",
};

const VALID_THEMES = ["ocean", "midnight", "emerald", "academic", "parchment", "slate", "terminal"] as const;
type ThemeName = typeof VALID_THEMES[number];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Prefer the user's DB-stored theme (in JWT) over the cookie fallback.
  // This means a logged-in user always gets the correct theme on SSR
  // with zero client-side flash, even if their cookie is stale.
  // Fetch session first — needed for theme resolution below.
  const session = await auth();

  const cookieStore = await cookies();
  const rawCookie   = cookieStore.get("pvd-theme")?.value ?? "";
  const cookieTheme = (VALID_THEMES.includes(rawCookie as ThemeName) ? rawCookie : "") as ThemeName | "";
  const userTheme   = session?.user?.theme as ThemeName | null | undefined;

  let theme: ThemeName;
  if (userTheme && VALID_THEMES.includes(userTheme)) {
    // Logged-in user with a personal theme stored in DB
    theme = userTheme;
  } else if (session && cookieTheme) {
    // Logged-in user with no DB theme yet — use their cookie
    theme = cookieTheme;
  } else {
    // Unauthenticated (login page, etc.) — use library's configured login theme
    const row = await prisma.settings.findUnique({ where: { key: "DEFAULT_STAFF_THEME" } });
    const raw = row?.value ?? "ocean";
    theme = (VALID_THEMES.includes(raw as ThemeName) ? raw : "ocean") as ThemeName;
  }

  // Locale for the <html lang=""> attribute — set by proxy.ts as a request header.
  const headersList = await headers();
  const locale      = headersList.get("X-NEXT-INTL-LOCALE") ?? "en";

  // Fetch library name + logo from DB so they're available to all client components
  // without any additional client-side fetch.
  const [libNameRow, libLogoRow] = await Promise.all([
    prisma.settings.findUnique({ where: { key: "LIBRARY_NAME" } }),
    prisma.settings.findUnique({ where: { key: "LIBRARY_LOGO" } }),
  ]);
  const libraryName = libNameRow?.value ?? "PVD Library";
  const libraryLogo = libLogoRow?.value ?? "";

  // Fetch the enabled-locales list so LanguageToggle only shows active locales.
  const enabledLocales = await getEnabledLocales();

  return (
    <html
      lang={locale}
      data-theme={theme}
      className={`${geist.variable} ${notoKhmer.variable} h-full`}
      suppressHydrationWarning
    >
      <body className={`min-h-full antialiased ${locale === "km" ? "font-khmer" : "font-sans"}`} suppressHydrationWarning>
        <Providers
          session={session}
          libraryName={libraryName}
          libraryLogo={libraryLogo}
          enabledLocales={enabledLocales}
          serverTheme={theme}
          serverAuthStyle={(session?.user?.authStyle ?? null) as import("@/components/ThemeProvider").AuthStyleName | null}
        >
          {children}
        </Providers>
      </body>
    </html>
  );
}
