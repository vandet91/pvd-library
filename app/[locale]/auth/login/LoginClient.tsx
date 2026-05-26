"use client";

import AuthSplit   from "./themes/AuthSplit";
import AuthGlass   from "./themes/AuthGlass";
import AuthMinimal from "./themes/AuthMinimal";

/**
 * Thin client wrapper around the auth-style components.
 * The parent server page (page.tsx) reads DEFAULT_STAFF_AUTH_STYLE and
 * DEFAULT_STAFF_THEME from the DB and passes them here.
 *
 * Theme is already applied to <html data-theme=...> by the root layout
 * (which uses DEFAULT_STAFF_THEME for unauthenticated requests), so no
 * client-side override is needed.
 */
export default function LoginClient({
  authStyle,
}: {
  authStyle: string;
  theme:     string; // kept in props for future use; root layout handles the CSS
}) {
  if (authStyle === "glass")   return <AuthGlass />;
  if (authStyle === "minimal") return <AuthMinimal />;
  return <AuthSplit />;
}
