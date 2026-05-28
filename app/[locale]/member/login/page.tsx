"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { BookOpen, Eye, EyeOff, Loader2, LogIn, Search, UserPlus } from "lucide-react";
import { useMemberLoginForm } from "./useMemberLoginForm";
import { useLibraryName } from "@/context/library-name";
import LanguageToggle from "@/components/shared/LanguageToggle";

export default function MemberLoginPage() {
  const locale      = useLocale();
  const libraryName = useLibraryName();
  const t           = useTranslations("memberPortal");

  const [canRegister, setCanRegister] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => setCanRegister(d.MEMBER_SELF_REGISTER === "true"))
      .catch(() => {});
  }, []);

  const {
    identifier, setIdentifier,
    password,   setPassword,
    showPassword, setShowPassword,
    error, loading,
    handleSubmit,
  } = useMemberLoginForm();

  return (
    <div className="min-h-screen bg-blue-950 flex flex-col">

      {/* Top bar */}
      <div className="flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-white/15 rounded-xl flex items-center justify-center">
            <BookOpen className="w-4 h-4 text-white" />
          </div>
          <span className="text-white font-semibold text-sm">{libraryName}</span>
        </div>

        <div className="flex items-center gap-3">
          <LanguageToggle variant="dark" />
          <Link
            href={`/${locale}/discover`}
            className="flex items-center gap-1.5 text-blue-200 hover:text-white text-xs font-medium transition-colors"
          >
            <Search className="w-3.5 h-3.5" />
            {t("browseCatalogue")}
          </Link>
        </div>
      </div>

      {/* Center card */}
      <div className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-[380px]">

          {/* Icon + heading */}
          <div className="mb-8 text-center">
            <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-5 ring-1 ring-white/20">
              <BookOpen className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">{t("loginTitle")}</h1>
            <p className="text-blue-300 text-sm mt-1.5">{t("loginSubtitle")}</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">

            <div className="space-y-1.5">
              <label htmlFor="member-identifier" className="block text-xs font-semibold text-blue-300 uppercase tracking-wider">
                {t("emailOrMemberId")}
              </label>
              <input
                id="member-identifier"
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                autoComplete="username"
                placeholder={t("emailOrMemberIdPlaceholder")}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-sm text-white placeholder-blue-400 focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-white/40 transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="member-password" className="block text-xs font-semibold text-blue-300 uppercase tracking-wider">
                {t("password")}
              </label>
              <div className="relative">
                <input
                  id="member-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full px-4 py-3 pr-11 bg-white/10 border border-white/20 rounded-xl text-sm text-white placeholder-blue-400 focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-white/40 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-blue-300 hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-300 bg-red-500/20 border border-red-500/30 px-4 py-2.5 rounded-xl">
                {error}
              </p>
            )}

            <div className="pt-1">
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-white text-blue-950 font-semibold text-sm hover:bg-blue-50 transition-all active:scale-[0.99] disabled:opacity-60 shadow-lg"
              >
                {loading
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <LogIn className="w-4 h-4" />}
                {loading ? t("signingIn") : t("signIn")}
              </button>
            </div>
          </form>

          {/* Divider + links */}
          <div className="mt-8 pt-6 border-t border-white/10 text-center space-y-3">
            {canRegister && (
              <Link
                href={`/${locale}/member/register`}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-white/20 text-white text-sm font-medium hover:bg-white/10 transition-colors"
              >
                <UserPlus className="w-4 h-4" />
                {t("createNewAccount")}
              </Link>
            )}
            <p className="text-blue-400 text-xs">
              {t("libraryStaff")}{" "}
              <Link
                href={`/${locale}/auth/login`}
                className="text-white font-semibold hover:underline"
              >
                {t("staffPortalLink")}
              </Link>
            </p>
            <p className="text-blue-500 text-xs">
              <Link
                href={`/${locale}/discover`}
                className="hover:text-blue-300 transition-colors"
              >
                {t("browseCatalogueLink")}
              </Link>
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-8 py-4 text-center">
        <p className="text-[11px] text-blue-500">
          © {new Date().getFullYear()} {libraryName} Management System
        </p>
      </div>
    </div>
  );
}
