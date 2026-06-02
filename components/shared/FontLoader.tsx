"use client";

import { useEffect } from "react";

export interface CustomFont { name: string; url: string; }

interface Props {
  font:        string;
  customFonts?: CustomFont[];
}

export default function FontLoader({ font, customFonts = [] }: Props) {
  useEffect(() => {
    // Inject @font-face for each custom uploaded font
    const styleId = "opac-custom-font-faces";
    const existing = document.getElementById(styleId);
    if (existing) existing.remove();

    if (customFonts.length > 0) {
      const faces = customFonts.map((cf) => {
        const fmt = cf.url.endsWith(".woff2") ? "woff2"
                  : cf.url.endsWith(".woff")  ? "woff"
                  : cf.url.endsWith(".otf")   ? "opentype"
                  : "truetype";
        return `@font-face {
  font-family: "${cf.name}";
  src: url("${cf.url}") format("${fmt}");
  font-display: swap;
}`;
      }).join("\n");

      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = faces;
      document.head.appendChild(style);
    }
  }, [customFonts]);

  useEffect(() => {
    if (!font || font === "default") return;

    // If it's a custom uploaded font, @font-face is already injected above — no Google Fonts needed
    const isCustom = customFonts.some((cf) => cf.name === font);
    if (isCustom) return;

    // Otherwise load from Google Fonts
    const id = "opac-google-font-link";
    const existing = document.getElementById(id);
    if (existing) existing.remove();

    const link = document.createElement("link");
    link.id   = id;
    link.rel  = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font)}:wght@400;500;600;700&display=swap`;
    document.head.appendChild(link);
  }, [font, customFonts]);

  if (!font || font === "default") return null;

  return (
    <style>{`.opac-font-root,.opac-font-root *{font-family:"${font}",system-ui,sans-serif!important}`}</style>
  );
}
