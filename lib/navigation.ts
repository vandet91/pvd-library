/**
 * Locale-aware navigation helpers powered by next-intl.
 *
 * Import `useRouter` and `usePathname` from HERE (not from "next/navigation")
 * whenever you need to switch locales. These wrappers understand the locale
 * prefix so you can call:
 *
 *   router.replace(pathname, { locale: "km" })
 *
 * …and next-intl will build the correct URL automatically.
 *
 * `usePathname()` returns the path WITHOUT the locale prefix, e.g.
 *   /km/admin/settings  →  /admin/settings
 */
import { createNavigation } from "next-intl/navigation";
import { routing } from "@/i18n/routing";

export const { Link, redirect, usePathname, useRouter } =
  createNavigation(routing);
