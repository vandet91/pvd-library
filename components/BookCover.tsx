"use client";

import { BookOpen } from "lucide-react";

export type BookCoverStyle = "spine" | "vignette" | "tilt" | "hardcover";

export type BookCoverFrame = "none" | "accent" | "glow" | "classic" | "shadow";

/**
 * Returns a React.CSSProperties object to apply as the `style` prop on the
 * card's image container (the overflow:hidden wrapper around <BookCover>).
 * Combines the frame ring/glow with a base depth shadow.
 */
export function coverFrameStyle(frame: BookCoverFrame): React.CSSProperties {
  const depth = "0 4px 16px rgba(0,0,0,0.13)";
  switch (frame) {
    case "accent":
      return { boxShadow: `0 0 0 2.5px var(--accent), ${depth}` };
    case "glow":
      return { boxShadow: `0 0 0 2px var(--accent), 0 0 18px 4px color-mix(in srgb, var(--accent) 40%, transparent), ${depth}` };
    case "classic":
      return { boxShadow: `0 0 0 1.5px rgba(255,255,255,0.85), 0 0 0 4px var(--accent), 0 0 0 5px rgba(255,255,255,0.3), ${depth}` };
    case "shadow":
      return { boxShadow: `5px 10px 28px rgba(0,0,0,0.45), 2px 4px 8px rgba(0,0,0,0.22)` };
    default:
      return {};
  }
}

const GRADIENTS: [string, string][] = [
  ["#3b4a6b", "#1e3a5f"], ["#7c3aed", "#4c1d95"],
  ["#064e3b", "#047857"], ["#dc2626", "#7f1d1d"],
  ["#d97706", "#78350f"], ["#0891b2", "#164e63"],
  ["#b45309", "#92400e"], ["#ec4899", "#9d174d"],
];

function gradForTitle(title: string): [string, string] {
  return GRADIENTS[(title.charCodeAt(0) ?? 0) % GRADIENTS.length];
}

/**
 * BookCover — drop-in cover renderer for all public catalog pages.
 *
 * Props:
 *   coverImage  – real image URL (renders as <img> when provided)
 *   title       – book/ebook title (used for initials + gradient seed)
 *   author      – optional author name shown in placeholder modes
 *   style       – "spine" | "vignette" | "tilt" | "hardcover"  (default "spine")
 *   gradFrom/To – override the auto gradient (useful for ebook-type colours)
 *   className   – extra classes forwarded to the root element
 *
 * Designed to fill its parent completely (w-full h-full).
 * Works inside overflow:hidden parent containers.
 */
export function BookCover({
  coverImage,
  title,
  author,
  style = "spine",
  gradFrom: gFromProp,
  gradTo:   gToProp,
  className = "",
}: {
  coverImage?: string | null;
  title: string;
  author?: string | null;
  style?: BookCoverStyle;
  gradFrom?: string;
  gradTo?: string;
  className?: string;
}) {
  const [gFromAuto, gToAuto] = gradForTitle(title);
  const gFrom = gFromProp ?? gFromAuto;
  const gTo   = gToProp   ?? gToAuto;
  const initials = title.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");

  /* ── Placeholder inner ───────────────────────────────────────────────── */
  const Placeholder = ({ bgStyle }: { bgStyle?: React.CSSProperties }) => (
    <div
      style={{
        width: "100%", height: "100%",
        background: `linear-gradient(135deg, ${gFrom}, ${gTo})`,
        display: "flex", flexDirection: "column",
        alignItems: "flex-start", justifyContent: "flex-start",
        padding: "14px 10px 36px 12px",
        ...bgStyle,
      }}
    >
      {/* Icon row */}
      <BookOpen style={{ width: 24, height: 24, color: "rgba(255,255,255,.35)", flexShrink: 0, marginBottom: 8 }} />
      {/* Title — flows naturally below icon */}
      <span style={{
        color: "rgba(255,255,255,.95)", fontSize: 12, fontWeight: 700,
        lineHeight: 1.45, textAlign: "left",
        overflow: "hidden", display: "-webkit-box",
        WebkitLineClamp: 5, WebkitBoxOrient: "vertical" as const,
      }}>
        {title}
      </span>
      {/* Author — directly below title */}
      {author && (
        <span style={{
          color: "rgba(255,255,255,.55)", fontSize: 9.5, lineHeight: 1.3,
          textAlign: "left", marginTop: 5,
          overflow: "hidden", display: "-webkit-box",
          WebkitLineClamp: 1, WebkitBoxOrient: "vertical" as const,
        }}>
          {author}
        </span>
      )}
    </div>
  );

  /* ── Image ───────────────────────────────────────────────────────────── */
  const Img = () => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={coverImage!} alt={title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
  );

  /* ════════════════════════════════════════════════════════════════════════
     TILT + SHINE
     Adds a perspective rotateY at rest; flattens on hover.
     Works inside overflow:hidden — inner div is scale(0.95) so it never clips.
  ════════════════════════════════════════════════════════════════════════ */
  if (style === "tilt") {
    return (
      <div
        className={`w-full h-full ${className}`}
        style={{ perspective: "600px" }}
      >
        <div
          style={{
            width: "100%", height: "100%",
            transform: "rotateY(-12deg) rotateX(1.5deg) scale(0.95)",
            transformOrigin: "center center",
            transition: "transform .3s ease",
            position: "relative",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLDivElement).style.transform = "rotateY(-2deg) rotateX(0) scale(1)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLDivElement).style.transform = "rotateY(-12deg) rotateX(1.5deg) scale(0.95)";
          }}
        >
          {coverImage ? <Img /> : <Placeholder />}

          {/* Gloss shine overlay */}
          <div style={{
            position: "absolute", inset: 0, pointerEvents: "none", zIndex: 2,
            background: "linear-gradient(110deg, rgba(255,255,255,.2) 0%, transparent 44%)",
          }} />
          {/* Left spine shadow */}
          <div style={{
            position: "absolute", left: 0, top: 0, bottom: 0, width: 7,
            background: "linear-gradient(to right, rgba(0,0,0,.35), transparent)",
            pointerEvents: "none", zIndex: 3,
          }} />
        </div>
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════════════════════
     VIGNETTE + GRAIN
     Darkens cover edges with a radial gradient + subtle SVG noise.
  ════════════════════════════════════════════════════════════════════════ */
  if (style === "vignette") {
    return (
      <div className={`w-full h-full relative ${className}`}>
        {coverImage ? <Img /> : <Placeholder />}

        {/* Vignette */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: "radial-gradient(ellipse at 50% 50%, transparent 28%, rgba(0,0,0,.64) 100%)",
        }} />
        {/* Film grain */}
        <div style={{
          position: "absolute", inset: 0, opacity: .07, pointerEvents: "none",
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }} />
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════════════════════
     HARDCOVER BINDING
     Spine stripe, cloth texture, corner fold, book-icon emblem.
     Real cover images just get the spine shadow overlay.
  ════════════════════════════════════════════════════════════════════════ */
  if (style === "hardcover") {
    if (coverImage) {
      return (
        <div className={`w-full h-full relative ${className}`}>
          <Img />
          {/* Spine overlay */}
          <div style={{
            position: "absolute", left: 0, top: 0, bottom: 0, width: 8,
            background: "linear-gradient(to right, rgba(0,0,0,.42), transparent)",
            pointerEvents: "none",
          }} />
        </div>
      );
    }

    return (
      <div
        className={`w-full h-full relative ${className}`}
        style={{ background: `linear-gradient(160deg, ${gFrom}, ${gTo})` }}
      >
        {/* Spine stripe */}
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 10, background: "rgba(0,0,0,.26)", zIndex: 2 }} />
        {/* Cloth texture lines */}
        <div style={{
          position: "absolute", inset: 0,
          background: "repeating-linear-gradient(155deg, rgba(255,255,255,.04) 0, rgba(255,255,255,.04) 1px, transparent 1px, transparent 7px)",
        }} />
        {/* Corner fold */}
        <div style={{
          position: "absolute", top: 0, right: 0, width: 14, height: 14,
          background: "linear-gradient(135deg, rgba(255,255,255,.22) 50%, transparent 50%)",
        }} />
        {/* Title — top-left aligned, consistent with Placeholder */}
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "flex-start", justifyContent: "flex-start", padding: "14px 6px 36px 16px", zIndex: 3 }}>
          {/* Decorative top rule */}
          <div style={{ width: "55%", height: 1, background: "rgba(255,255,255,.3)", marginBottom: 8, flexShrink: 0 }} />
          <div style={{
            fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.95)", lineHeight: 1.45, textAlign: "left",
            overflow: "hidden", display: "-webkit-box",
            WebkitLineClamp: 6, WebkitBoxOrient: "vertical" as const,
          }}>
            {title}
          </div>
          {/* Decorative bottom rule */}
          <div style={{ width: "35%", height: 1, background: "rgba(255,255,255,.18)", marginTop: 6, flexShrink: 0 }} />
        </div>
        {/* Left spine dark edge */}
        <div style={{ position: "absolute", left: 10, top: 0, bottom: 0, width: 4, background: "linear-gradient(to right, rgba(0,0,0,.2), transparent)", zIndex: 4, pointerEvents: "none" }} />
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════════════════════
     SPINE SHADOW (default)
     Left dark-edge gradient + right paper-strip.
  ════════════════════════════════════════════════════════════════════════ */
  return (
    <div className={`w-full h-full relative ${className}`}>
      {coverImage ? <Img /> : <Placeholder />}

      {/* Left spine shadow */}
      <div style={{
        position: "absolute", left: 0, top: 0, bottom: 0, width: 7,
        background: "linear-gradient(to right, rgba(0,0,0,.38), transparent)",
        pointerEvents: "none",
      }} />
      {/* Right page-stack strip */}
      <div style={{
        position: "absolute", right: 0, top: 0, bottom: 0, width: 5,
        background: "repeating-linear-gradient(to bottom, #e8dcc8 0, #e8dcc8 1px, #f5ead5 1px, #f5ead5 3px)",
        opacity: .65, pointerEvents: "none",
      }} />
    </div>
  );
}
