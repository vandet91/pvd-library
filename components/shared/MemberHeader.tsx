"use client";

/**
 * Reusable top-right auth widget for public patron pages (Discover, E-Library, Basket).
 * - Not logged in  →  "Sign In" button
 * - Logged in MEMBER  →  My Loans  My Basket  My Requests  user chip  Sign Out
 * - Logged in staff  →  "Admin" link  user chip  Sign Out
 */

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { LogIn, LogOut, ShoppingCart, Settings, User, BookOpen, Inbox } from "lucide-react";
import LanguageToggle from "@/components/shared/LanguageToggle";

interface Props {
  /** basket count badge — only shown when logged in as MEMBER */
  basketCount?: number;
  /** dark = white text on blue/dark bg; light = coloured text on white */
  theme?: "dark" | "light";
}

export default function MemberHeader({ basketCount = 0, theme = "dark" }: Props) {
  const t = useTranslations("opac");
  const { data: session, status } = useSession();
  const locale  = useLocale();
  const loading = status === "loading";

  const role    = (session?.user as { role?: string })?.role;
  const isStaff = role && role !== "MEMBER";

  const ghost = theme === "dark"
    ? "text-white/70 hover:text-white hover:bg-white/10"
    : "text-gray-600 hover:text-gray-900 hover:bg-gray-100";

  return (
    <div className="flex items-center gap-1">
      <LanguageToggle />

      {loading ? null : session ? (
        <>
          {/* Member-only nav links */}
          {!isStaff && (
            <>
              <Link href={`/${locale}/loans`}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${ghost}`}>
                <BookOpen className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t("myLoans")}</span>
              </Link>

              <Link href={`/${locale}/basket`}
                className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${ghost}`}>
                <ShoppingCart className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t("basket")}</span>
                {basketCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-white text-blue-900 text-[10px] font-bold rounded-full flex items-center justify-center shadow">
                    {basketCount > 9 ? "9+" : basketCount}
                  </span>
                )}
              </Link>

              <Link href={`/${locale}/requests`}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${ghost}`}>
                <Inbox className="w-3.5 h-3.5" />
                <span className="hidden md:inline">{t("myRequests")}</span>
              </Link>
            </>
          )}

          {/* Staff → Admin panel link */}
          {isStaff && (
            <Link href={`/${locale}/admin`}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${ghost}`}>
              <Settings className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t("admin")}</span>
            </Link>
          )}

          {/* Divider */}
          <div className={`w-px h-5 mx-1 ${theme === "dark" ? "bg-white/20" : "bg-gray-200"}`} />

          {/* User chip */}
          <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium ${
            theme === "dark" ? "bg-white/15 text-white" : "bg-gray-100 text-gray-700"
          }`}>
            <User className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="max-w-[90px] truncate hidden sm:block">
              {session.user?.name ?? session.user?.email}
            </span>
          </div>

          {/* Sign out */}
          <button
            onClick={() => signOut({
              callbackUrl: isStaff
                ? `/${locale}/auth/login`
                : `/${locale}/discover`,
            })}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${ghost}`}
            title={t("signOut")}
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t("signOut")}</span>
          </button>
        </>
      ) : (
        /* Not logged in — go to member portal */
        <Link
          href={`/${locale}/member/login`}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            theme === "dark"
              ? "bg-white text-blue-900 hover:bg-blue-50"
              : "bg-blue-900 text-white hover:bg-blue-800"
          }`}
        >
          <LogIn className="w-3.5 h-3.5" />
          {t("signIn")}
        </Link>
      )}
    </div>
  );
}
