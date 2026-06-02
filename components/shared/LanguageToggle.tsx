"use client";

import { useLocale } from "next-intl";
import { useEnabledLocales } from "@/context/enabled-locales";
import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";

interface Props {
  variant?: "dark" | "light";
}

export default function LanguageToggle({ variant = "dark" }: Props) {
  const locale = useLocale();
  const enabledLocales = useEnabledLocales();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (enabledLocales.length <= 1) return null;

  const isDark = variant === "dark";

  function switchLocale(next: string) {
    const segments = window.location.pathname.split("/");
    segments[1] = next;
    window.location.href = segments.join("/");
  }

  const current = enabledLocales.find((l) => l.code === locale);

  // ── Pill toggle for 2 locales ──────────────────────────────────────────────
  if (enabledLocales.length === 2) {
    const wrapperCls = isDark ? "bg-white/10 border border-white/20" : "bg-gray-100 border border-gray-200";
    const activeCls  = isDark ? "bg-white text-blue-900 shadow-sm"   : "bg-white text-gray-900 shadow-sm border border-gray-200";
    const inactiveCls = isDark ? "text-white/70 hover:bg-white/15 hover:text-white" : "text-gray-500 hover:bg-gray-200 hover:text-gray-800";

    return (
      <div className={`flex items-center gap-0.5 rounded-lg p-0.5 ${wrapperCls}`}>
        {enabledLocales.map(({ code, nativeLabel }) => (
          <button
            key={code}
            onClick={() => switchLocale(code)}
            disabled={locale === code}
            className={`px-3 py-1 rounded-md text-sm font-medium transition-all duration-150 disabled:cursor-default
              ${locale === code ? activeCls : inactiveCls}`}
          >
            {nativeLabel}
          </button>
        ))}
      </div>
    );
  }

  // ── Dropdown for 3+ locales ────────────────────────────────────────────────
  const triggerCls = isDark
    ? "bg-white/10 border border-white/20 text-white hover:bg-white/20"
    : "bg-gray-100 border border-gray-200 text-gray-700 hover:bg-gray-200";

  const menuCls = isDark
    ? "bg-gray-900 border border-white/10 text-white"
    : "bg-white border border-gray-200 text-gray-700";

  const itemActiveCls = isDark ? "bg-white/10 text-white font-semibold" : "bg-gray-100 text-gray-900 font-semibold";
  const itemCls       = isDark ? "hover:bg-white/10 text-white/70"       : "hover:bg-gray-50 text-gray-600";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${triggerCls}`}
      >
        {current?.nativeLabel ?? locale.toUpperCase()}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className={`absolute right-0 mt-1.5 min-w-[120px] rounded-xl shadow-lg py-1 z-50 ${menuCls}`}>
          {enabledLocales.map(({ code, nativeLabel }) => (
            <button
              key={code}
              onClick={() => { switchLocale(code); setOpen(false); }}
              className={`w-full text-left px-4 py-2 text-sm transition-colors
                ${locale === code ? itemActiveCls : itemCls}`}
            >
              {nativeLabel}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
