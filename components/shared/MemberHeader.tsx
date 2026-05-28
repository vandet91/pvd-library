"use client";

/**
 * Reusable top-right auth widget for public patron pages (Discover, E-Library, etc.).
 * - Not logged in  →  "Sign In" button
 * - Logged in MEMBER  →  language toggle + avatar chip → dropdown (My Loans, Basket,
 *                        Requests, Fines, Account, Sign Out)
 * - Logged in STAFF   →  language toggle + "Admin" link + Sign Out
 */

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState, useRef, useEffect } from "react";
import {
  LogIn, LogOut, ShoppingCart, Settings, User,
  BookOpen, Inbox, Banknote, ChevronDown, Send, ShoppingBag,
} from "lucide-react";
import LanguageToggle from "@/components/shared/LanguageToggle";

interface Props {
  /** basket count badge — only shown when logged in as MEMBER */
  basketCount?: number;
  /** dark = white text on coloured bg; light = coloured text on white */
  theme?: "dark" | "light";
}

export default function MemberHeader({ basketCount = 0, theme = "dark" }: Props) {
  const t      = useTranslations("opac");
  const { data: session, status } = useSession();
  const locale  = useLocale();
  const loading = status === "loading";

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const role    = (session?.user as { role?: string })?.role;
  const isStaff = role && role !== "MEMBER";
  const userName = session?.user?.name ?? session?.user?.email ?? "";

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const ghostCls = theme === "dark"
    ? "text-white/70 hover:text-white hover:bg-white/10"
    : "text-gray-600 hover:text-gray-900 hover:bg-gray-100";

  const chipCls = theme === "dark"
    ? "bg-white/15 text-white hover:bg-white/25"
    : "bg-gray-100 text-gray-700 hover:bg-gray-200";

  return (
    <div className="flex items-center gap-1.5">
      <LanguageToggle />

      {loading ? null : session ? (
        <>
          {/* ── STAFF ── */}
          {isStaff && (
            <>
              <Link
                href={`/${locale}/admin`}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${ghostCls}`}
              >
                <Settings className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t("admin")}</span>
              </Link>
              <button
                onClick={() => signOut({ callbackUrl: `/${locale}/auth/login` })}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${ghostCls}`}
                title={t("signOut")}
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t("signOut")}</span>
              </button>
            </>
          )}

          {/* ── MEMBER — avatar chip + dropdown ── */}
          {!isStaff && (
            <div ref={ref} className="relative">
              <button
                onClick={() => setOpen((v) => !v)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${chipCls}`}
              >
                <User className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="max-w-[90px] truncate hidden sm:block">{userName}</span>
                {/* basket badge on the chip */}
                {basketCount > 0 && (
                  <span className="w-4 h-4 bg-amber-400 text-gray-900 text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                    {basketCount > 9 ? "9+" : basketCount}
                  </span>
                )}
                <ChevronDown className={`w-3 h-3 opacity-60 transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
              </button>

              {open && (
                <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden z-50">
                  {/* Name header */}
                  <div className="px-3.5 py-3 border-b border-gray-100 bg-gray-50">
                    <p className="text-xs font-semibold text-gray-900 truncate">{userName}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">Member account</p>
                  </div>

                  {/* Nav links */}
                  <div className="py-1">
                    {([
                      { href: `/${locale}/loans`,    Icon: BookOpen,     label: t("myLoans"),    badge: 0 },
                      { href: `/${locale}/basket`,   Icon: ShoppingCart, label: t("basket"),     badge: basketCount },
                      { href: `/${locale}/requests`, Icon: Inbox,        label: t("myRequests"), badge: 0 },
                      { href: `/${locale}/fines`,    Icon: Banknote,     label: t("myFines"),    badge: 0 },
                      { href: `/${locale}/shop`,     Icon: ShoppingBag,  label: t("shop"),       badge: 0 },
                      { href: `/${locale}/account`,  Icon: Send,         label: "Account",       badge: 0 },
                    ] as const).map(({ href, Icon, label, badge }) => (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        <Icon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <span className="flex-1">{label}</span>
                        {badge > 0 && (
                          <span className="w-5 h-5 bg-amber-400 text-gray-900 text-[10px] font-bold rounded-full flex items-center justify-center">
                            {badge > 9 ? "9+" : badge}
                          </span>
                        )}
                      </Link>
                    ))}
                  </div>

                  {/* Sign out */}
                  <div className="border-t border-gray-100 py-1">
                    <button
                      onClick={() => { setOpen(false); signOut({ callbackUrl: `/${locale}/discover` }); }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <LogOut className="w-4 h-4 flex-shrink-0" />
                      {t("signOut")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        /* Not logged in */
        <Link
          href={`/${locale}/member/login`}
          className={`flex items-center gap-1.5 px-2.5 sm:px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            theme === "dark"
              ? "bg-white text-blue-900 hover:bg-blue-50"
              : "bg-blue-900 text-white hover:bg-blue-800"
          }`}
        >
          <LogIn className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{t("signIn")}</span>
        </Link>
      )}
    </div>
  );
}
