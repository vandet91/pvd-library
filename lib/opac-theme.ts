/**
 * OPAC (public catalog) theme tokens.
 * Three fully distinct looks for the Discover and E-Library pages.
 * All class strings must be complete so Tailwind JIT includes them.
 */

export type OpacThemeKey = "royal" | "forest" | "sunset";

export interface OpacTheme {
  // ── Navigation bar ──────────────────────────────────────────────────────
  navBg:       string;   // full backdrop class e.g. "bg-[#0f1e4a]/95"
  navBrandBg:  string;   // icon square background
  navBrandIcon:string;   // icon color
  navActiveTab:string;   // active page tab classes

  // ── Hero section ────────────────────────────────────────────────────────
  heroBg:      string;   // full gradient background class string
  heroGlow1:   string;   // blob 1 color
  heroGlow2:   string;   // blob 2 color

  // ── Buttons & interactive ────────────────────────────────────────────────
  btnPrimary:  string;   // bg + hover (no text colour — always white)
  filterActive:string;   // active filter pill bg (text is always white)
  ratingBtn:   string;   // rating submit/update button
  ctaBg:       string;   // "Request a book" CTA strip

  // ── Section heading icons ────────────────────────────────────────────────
  sectionIcon: string;

  // ── Preview swatches (for admin picker) ─────────────────────────────────
  previewNav:  string;   // solid bg swatch
  previewHero: string;   // gradient swatch
  accentHex:   string;   // hex for the checkmark circle
}

export const OPAC_THEMES: Record<OpacThemeKey, OpacTheme> = {

  /* ── Royal Blue (default) ─────────────────────────────────────────────── */
  royal: {
    navBg:       "bg-[#0f1e4a]/95",
    navBrandBg:  "bg-indigo-500/30",
    navBrandIcon:"text-indigo-300",
    navActiveTab:"bg-indigo-500/25 ring-1 ring-indigo-400/30",

    heroBg:      "bg-gradient-to-br from-blue-900 via-indigo-900 to-indigo-800",
    heroGlow1:   "bg-indigo-500/10",
    heroGlow2:   "bg-blue-400/10",

    btnPrimary:  "bg-blue-900 hover:bg-blue-800",
    filterActive:"bg-blue-900",
    ratingBtn:   "bg-blue-900 hover:bg-blue-800",
    ctaBg:       "bg-gradient-to-r from-blue-900 to-indigo-800",

    sectionIcon: "text-blue-600",

    previewNav:  "bg-[#0f1e4a]",
    previewHero: "bg-gradient-to-br from-blue-900 via-indigo-900 to-indigo-800",
    accentHex:   "#4338ca",
  },

  /* ── Forest Green ─────────────────────────────────────────────────────── */
  forest: {
    navBg:       "bg-[#052e16]/95",
    navBrandBg:  "bg-emerald-500/30",
    navBrandIcon:"text-emerald-300",
    navActiveTab:"bg-emerald-500/25 ring-1 ring-emerald-400/30",

    heroBg:      "bg-gradient-to-br from-green-900 via-emerald-900 to-teal-800",
    heroGlow1:   "bg-emerald-500/10",
    heroGlow2:   "bg-teal-400/10",

    btnPrimary:  "bg-emerald-800 hover:bg-emerald-700",
    filterActive:"bg-emerald-800",
    ratingBtn:   "bg-emerald-800 hover:bg-emerald-700",
    ctaBg:       "bg-gradient-to-r from-emerald-900 to-teal-800",

    sectionIcon: "text-emerald-600",

    previewNav:  "bg-[#052e16]",
    previewHero: "bg-gradient-to-br from-green-900 via-emerald-900 to-teal-800",
    accentHex:   "#059669",
  },

  /* ── Sunset (Rose / Violet) ───────────────────────────────────────────── */
  sunset: {
    navBg:       "bg-[#2d0f2e]/95",
    navBrandBg:  "bg-rose-500/30",
    navBrandIcon:"text-rose-300",
    navActiveTab:"bg-rose-500/25 ring-1 ring-rose-400/30",

    heroBg:      "bg-gradient-to-br from-rose-900 via-purple-900 to-violet-800",
    heroGlow1:   "bg-rose-500/10",
    heroGlow2:   "bg-violet-400/10",

    btnPrimary:  "bg-rose-800 hover:bg-rose-700",
    filterActive:"bg-rose-800",
    ratingBtn:   "bg-rose-800 hover:bg-rose-700",
    ctaBg:       "bg-gradient-to-r from-rose-900 to-violet-800",

    sectionIcon: "text-rose-500",

    previewNav:  "bg-[#2d0f2e]",
    previewHero: "bg-gradient-to-br from-rose-900 via-purple-900 to-violet-800",
    accentHex:   "#be185d",
  },
};

export function getOpacTheme(key?: string | null): OpacTheme {
  return OPAC_THEMES[(key as OpacThemeKey) ?? "royal"] ?? OPAC_THEMES.royal;
}
