"use client";

import { useEffect } from "react";

export interface CustomFont { name: string; url: string; }

/**
 * Unicode ranges per script.
 * Latin covers Basic Latin + Latin Extended so EN fonts apply to all ASCII/European text.
 * Khmer covers the two Khmer Unicode blocks.
 */
const UNICODE_RANGES: Record<string, string> = {
  latin:  "U+0000-00FF, U+0100-024F, U+0250-02AF, U+1E00-1EFF, U+2000-206F, U+2074, U+20AC, U+2122, U+2212, U+2215",
  khmer:  "U+1780-17FF, U+19E0-19FF, U+200C, U+25CC",
  thai:   "U+0E00-0E7F",
  arabic: "U+0600-06FF, U+0750-077F, U+08A0-08FF, U+FB50-FDFF, U+FE70-FEFF",
};

/** Fonts that are designed for Khmer script */
const KHMER_FONT_NAMES = new Set([
  "noto sans khmer", "kantumruy pro", "kantumruy",
  "ang daunsok", "kh siemreap", "khmer chantha",
  // legacy / other common Khmer fonts kept for backward compatibility
  "battambang", "hanuman", "moul", "dangrek",
  "koulen", "metal", "siemreap", "bayon", "chenla", "freehand",
  "kdam thmor", "krasar", "nokora", "odor mean chey", "suwannaphum",
  "khmer", "content", "fasthand",
]);

export type FontMap = {
  /** Font for Latin/English text */
  en?: string;
  /** Font for Khmer text */
  km?: string;
  /** Catch-all single font (legacy — applied to all text) */
  default?: string;
};

interface Props {
  /** New per-locale font map */
  fonts?: FontMap;
  /** Legacy single font (still supported) */
  font?: string;
  customFonts?: CustomFont[];
}

export default function FontLoader({ fonts, font, customFonts = [] }: Props) {

  /* ── Inject @font-face for uploaded custom fonts ── */
  useEffect(() => {
    const styleId = "opac-custom-font-faces";
    document.getElementById(styleId)?.remove();
    if (!customFonts.length) return;

    const faces = customFonts.map((cf) => {
      const fmt = cf.url.endsWith(".woff2") ? "woff2"
                : cf.url.endsWith(".woff")  ? "woff"
                : cf.url.endsWith(".otf")   ? "opentype"
                : "truetype";
      return `@font-face { font-family: "${cf.name}"; src: url("${cf.url}") format("${fmt}"); font-display: swap; }`;
    }).join("\n");

    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = faces;
    document.head.appendChild(style);
  }, [customFonts]);

  /* Google Fonts are loaded server-side via <link> tags in the page.tsx server components.
     No client-side injection needed — removing it eliminates the FOUT flash. */

  /* ── Build CSS ── */
  const rules: string[] = [];

  if (fonts) {
    // Per-locale font mode
    const enFont = fonts.en && fonts.en !== "default" ? fonts.en : null;
    const kmFont = fonts.km && fonts.km !== "default" ? fonts.km : null;

    if (enFont) {
      rules.push(`
@font-face {
  font-family: "opac-font-en";
  src: local("${enFont}");
  unicode-range: ${UNICODE_RANGES.latin};
  font-display: swap;
}
.opac-font-root, .opac-font-root * { font-family: "opac-font-en", "${enFont}", system-ui, sans-serif; }`);
    }

    if (kmFont) {
      rules.push(`
@font-face {
  font-family: "opac-font-km";
  src: local("${kmFont}");
  unicode-range: ${UNICODE_RANGES.khmer};
  font-display: swap;
}
.opac-font-root, .opac-font-root * { font-family: "opac-font-km", "${kmFont}", ${enFont ? `"opac-font-en", "${enFont}",` : ""} system-ui, sans-serif; }`);
    }

  } else if (font && font !== "default") {
    // Legacy single-font mode
    const isKhmer = KHMER_FONT_NAMES.has(font.toLowerCase().trim());
    if (isKhmer) {
      rules.push(`
@font-face {
  font-family: "opac-khmer-restricted";
  src: local("${font}");
  unicode-range: ${UNICODE_RANGES.khmer};
  font-display: swap;
}
.opac-font-root, .opac-font-root * { font-family: "opac-khmer-restricted", "${font}", system-ui, sans-serif; }`);
    } else {
      rules.push(`.opac-font-root,.opac-font-root *{font-family:"${font}",system-ui,sans-serif!important}`);
    }
  }

  if (!rules.length) return null;

  return <style>{rules.join("\n")}</style>;
}
