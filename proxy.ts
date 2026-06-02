/**
 * Next.js 16 proxy — locale prefix enforcement + header injection.
 *
 * Sets X-NEXT-INTL-LOCALE as a request header so:
 *   • app/layout.tsx can set <html lang=""> correctly on the server (no flash)
 *
 * The actual content locale is resolved via setRequestLocale(locale) called
 * in app/[locale]/layout.tsx — so i18n/request.ts doesn't depend on this header.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import fs   from "fs";
import path from "path";

const DEFAULT_LOCALE = "en";

function buildLocaleSet(): Set<string> {
  try {
    return new Set(
      fs.readdirSync(path.join(process.cwd(), "messages"))
        .filter((f) => f.endsWith(".json"))
        .map((f)    => f.replace(".json", ""))
        .filter((c) => /^[a-z]{2,5}(-[A-Z]{2})?$/.test(c))
    );
  } catch {
    return new Set([DEFAULT_LOCALE, "km"]);
  }
}

const LOCALES = buildLocaleSet();

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api")   ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const firstSeg = pathname.split("/")[1] ?? "";

  if (LOCALES.has(firstSeg)) {
    // Valid locale — forward as request header for app/layout.tsx lang attr
    const reqHeaders = new Headers(request.headers);
    reqHeaders.set("X-NEXT-INTL-LOCALE", firstSeg);
    return NextResponse.next({ request: { headers: reqHeaders } });
  }

  // No locale prefix — redirect to default
  const url = request.nextUrl.clone();
  url.pathname = `/${DEFAULT_LOCALE}${pathname}`;
  return NextResponse.redirect(url, 308);
}

export default proxy;

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\.ico|.*\..*).*)",
    "/",
  ],
};
