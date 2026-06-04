/**
 * Builds a Google Fonts CSS2 URL for one or more font families.
 * Returns null if no real fonts are requested (all "default" or empty).
 */
export function buildGoogleFontsUrl(fonts: (string | undefined)[]): string | null {
  const families = fonts
    .filter((f): f is string => !!f && f !== "default")
    .map((f) => `family=${encodeURIComponent(f)}:wght@400;500;600;700`)
    .filter((v, i, a) => a.indexOf(v) === i); // deduplicate

  if (!families.length) return null;
  return `https://fonts.googleapis.com/css2?${families.join("&")}&display=swap`;
}
