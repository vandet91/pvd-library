"use client";

import { useState } from "react";
import { Star } from "lucide-react";

/* ── Display (read-only) ─────────────────────────────────────────────────── */
export function StarDisplay({
  avg,
  count,
  size = "sm",
  showCount = true,
}: {
  avg: number | null;
  count: number;
  size?: "xs" | "sm" | "md";
  showCount?: boolean;
}) {
  if (!avg && count === 0) return null;

  const iconSize = size === "xs" ? "w-3 h-3" : size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4";
  const textSize = size === "xs" ? "text-[10px]" : size === "sm" ? "text-xs" : "text-sm";
  const gap      = size === "xs" ? "gap-0.5" : "gap-1";

  const filled = avg ?? 0;

  return (
    <span className={`inline-flex items-center ${gap}`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.max(0, Math.min(1, filled - (i - 1)));
        return (
          <span key={i} className="relative inline-block">
            {/* grey base */}
            <Star className={`${iconSize} text-gray-200 fill-gray-200`} />
            {/* gold overlay clipped to fill% */}
            {fill > 0 && (
              <span
                className="absolute inset-0 overflow-hidden"
                style={{ width: `${fill * 100}%` }}
              >
                <Star className={`${iconSize} text-amber-400 fill-amber-400`} />
              </span>
            )}
          </span>
        );
      })}
      {avg !== null && (
        <span className={`${textSize} font-semibold text-amber-500 leading-none`}>{avg.toFixed(1)}</span>
      )}
      {showCount && count > 0 && (
        <span className={`${textSize} text-gray-400 leading-none`}>({count})</span>
      )}
    </span>
  );
}

/* ── Input (interactive) ─────────────────────────────────────────────────── */
export function StarInput({
  value,
  onChange,
  size = "md",
  disabled = false,
}: {
  value: number;           // 0 = none selected
  onChange: (score: number) => void;
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
}) {
  const [hover, setHover] = useState(0);

  const iconSize =
    size === "sm" ? "w-5 h-5" :
    size === "lg" ? "w-9 h-9" :
                    "w-7 h-7";

  return (
    <span
      className="inline-flex gap-1"
      onMouseLeave={() => setHover(0)}
    >
      {[1, 2, 3, 4, 5].map((i) => {
        const active = (hover || value) >= i;
        return (
          <button
            key={i}
            type="button"
            disabled={disabled}
            onClick={() => onChange(i)}
            onMouseEnter={() => !disabled && setHover(i)}
            className={`transition-transform ${disabled ? "cursor-default" : "hover:scale-110 cursor-pointer"}`}
            aria-label={`${i} star${i !== 1 ? "s" : ""}`}
          >
            <Star
              className={`${iconSize} transition-colors ${
                active
                  ? "text-amber-400 fill-amber-400"
                  : "text-gray-300 fill-gray-100"
              }`}
            />
          </button>
        );
      })}
    </span>
  );
}
