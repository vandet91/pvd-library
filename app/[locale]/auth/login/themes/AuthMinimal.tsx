"use client";

import { BookOpen, Eye, EyeOff, Mail, Loader2, MailCheck, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useLocale } from "next-intl";
import LanguageToggle from "@/components/shared/LanguageToggle";
import { useLoginForm } from "../useLoginForm";
import { useAuthMethod } from "../useAuthMethod";
import { useLibraryName } from "@/context/library-name";
import { useLibraryLogo } from "@/context/library-logo";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

export default function AuthMinimal() {
  const locale = useLocale();
  const libraryName = useLibraryName();
  const libraryLogo = useLibraryLogo();
  const {
    identifier, setIdentifier,
    password, setPassword,
    showPassword, setShowPassword,
    error, loading, handleSubmit, t,
  } = useLoginForm();

  const am = useAuthMethod();

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center overflow-hidden"
               style={{ background: libraryLogo ? "transparent" : "var(--accent)" }}>
            {libraryLogo
              ? <img src={libraryLogo} alt={libraryName} className="w-full h-full object-contain" />
              : <BookOpen className="w-3.5 h-3.5 text-white" />}
          </div>
          <span className="text-sm font-semibold text-gray-800">{libraryName}</span>
        </div>
        <LanguageToggle variant="light" />
      </div>

      {/* Center */}
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-[360px]">

          {/* Icon + heading */}
          <div className="mb-8 text-center">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-sm overflow-hidden"
                 style={{ background: libraryLogo ? "transparent" : "var(--login-from)" }}>
              {libraryLogo
                ? <img src={libraryLogo} alt={libraryName} className="w-full h-full object-contain p-1" />
                : <BookOpen className="w-7 h-7 text-white" />}
            </div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{t("login")}</h1>
            <p className="text-gray-400 text-sm mt-1.5">{t("loginSubtitle")}</p>
          </div>

          {/* ── Method tabs ─────────────────────────────────── */}
          <div className="flex gap-1 p-1 bg-gray-100 rounded-xl mb-7">
            {([ ["password" as const, t("methodPassword")], ["google" as const, t("methodGoogle")], ["magic" as const, t("methodMagic")] ]).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => am.setMethod(key as "password" | "google" | "magic")}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all focus:outline-none ${
                  am.method === key
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* ── Method content — min-h keeps card height stable across tabs ── */}
          <div className="min-h-[260px]">

          {/* ── Password method ───────────────────────────── */}
          {am.method === "password" && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <label htmlFor="minimal-identifier" className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {t("emailOrMemberId")}
                </label>
                <input
                  id="minimal-identifier"
                  type="text" value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required autoComplete="username"
                  placeholder="admin@library.com"
                  className="w-full px-0 py-2.5 border-0 border-b-2 border-gray-200 text-sm text-gray-900 placeholder-gray-300 focus:outline-none transition-colors bg-transparent"
                  onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
                  onBlur={(e)  => (e.target.style.borderColor = "#e5e7eb")}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="minimal-password" className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {t("password")}
                </label>
                <div className="relative">
                  <input
                    id="minimal-password"
                    type={showPassword ? "text" : "password"}
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    required autoComplete="current-password" placeholder="••••••••"
                    className="w-full px-0 py-2.5 pr-8 border-0 border-b-2 border-gray-200 text-sm text-gray-900 placeholder-gray-300 focus:outline-none transition-colors bg-transparent"
                    onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
                    onBlur={(e)  => (e.target.style.borderColor = "#e5e7eb")}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition-colors focus:outline-none">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {(error || am.urlError === "MemberAccount") && (
                <div className="pt-1 space-y-1">
                  {am.urlError === "MemberAccount" ? (
                    <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                      {t("staffOnlyError")}{" "}
                      <Link href={`/${locale}/member/login`} className="font-semibold underline">
                        {t("memberPortalCta")}
                      </Link>
                    </p>
                  ) : (
                    <p className="text-xs text-red-500">{error}</p>
                  )}
                </div>
              )}
              <div className="pt-4">
                <button type="submit" disabled={loading}
                  className="w-full py-3 rounded-xl font-semibold text-sm transition-all focus:outline-none hover:opacity-90 active:scale-[0.99] disabled:opacity-50 shadow-sm"
                  style={{ background: "var(--accent)", color: "var(--accent-fg)" }}>
                  {loading ? t("loggingIn") ?? "Signing in…" : t("login")}
                </button>
              </div>
              <p className="text-center text-xs text-gray-300 pt-1">
                {t("staffHint")}
              </p>
            </form>
          )}

          {/* ── Google method ──────────────────────────────── */}
          {am.method === "google" && (
            <div className="space-y-5 pt-2">
              <p className="text-sm text-gray-400 text-center">
                {t("googleDesc")}<br />
                <span className="text-xs">{t("googleStaffOnly")}</span>
              </p>
              {(am.googleError || am.urlError) && (
                <p className="text-xs text-red-500 text-center">
                  {am.urlError === "MethodNotAllowed"
                    ? t("googleMethodNotAllowed")
                    : am.urlError === "AccessDenied"
                    ? t("googleAccessDenied")
                    : am.urlError === "OAuthAccountNotLinked"
                    ? t("googleAccountLinked")
                    : am.urlError === "Configuration"
                    ? t("googleNotConfigured")
                    : am.googleError || t("googleFailed")}
                </p>
              )}
              <button type="button" onClick={am.startGoogle} disabled={am.googleLoading}
                className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl border-2 border-gray-200 bg-white text-gray-700 font-semibold text-sm hover:border-gray-300 hover:shadow-md transition-all focus:outline-none disabled:opacity-60">
                {am.googleLoading ? <Loader2 className="w-5 h-5 animate-spin text-gray-400" /> : <GoogleIcon />}
                {am.googleLoading ? t("redirecting") : t("continueWithGoogle")}
              </button>
            </div>
          )}

          {/* ── Magic Link method ──────────────────────────── */}
          {am.method === "magic" && (
            <div className="space-y-5 pt-2">
              {!am.magicSent ? (
                <>
                  <p className="text-sm text-gray-400 text-center">
                    {t("magicDesc")}
                  </p>
                  <form onSubmit={am.sendMagicLink} className="space-y-4">
                    <div className="space-y-1">
                      <label htmlFor="minimal-magic-email" className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        {t("staffEmail")}
                      </label>
                      <div className="relative">
                        <input
                          id="minimal-magic-email"
                          type="email" value={am.magicEmail}
                          onChange={(e) => am.setMagicEmail(e.target.value)}
                          required autoComplete="email" placeholder="admin@library.com"
                          className="w-full px-0 py-2.5 border-0 border-b-2 border-gray-200 text-sm text-gray-900 placeholder-gray-300 focus:outline-none transition-colors bg-transparent"
                          onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
                          onBlur={(e)  => (e.target.style.borderColor = "#e5e7eb")}
                        />
                        <Mail className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                      </div>
                    </div>
                    {am.magicError && <p className="text-xs text-red-500">{am.magicError}</p>}
                    <div className="pt-3">
                      <button type="submit" disabled={am.magicLoading}
                        className="w-full py-3 rounded-xl font-semibold text-sm transition-all focus:outline-none hover:opacity-90 active:scale-[0.99] disabled:opacity-50 shadow-sm"
                        style={{ background: "var(--accent)", color: "var(--accent-fg)" }}>
                        {am.magicLoading
                          ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> {t("sending")}</span>
                          : t("sendMagicLink")}
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                <div className="text-center space-y-4 py-4">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto shadow-sm"
                       style={{ background: "rgba(29,78,216,.08)" }}>
                    <MailCheck className="w-8 h-8" style={{ color: "var(--accent)" }} />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 mb-1">{t("checkInbox")}</p>
                    <p className="text-sm text-gray-400">
                      {t("magicSentTo", { email: am.magicEmail })}
                    </p>
                  </div>
                  <button type="button" onClick={am.resetMagic}
                    className="inline-flex items-center gap-1.5 text-xs text-gray-300 hover:text-gray-500 transition-colors focus:outline-none">
                    <ArrowLeft className="w-3 h-3" /> {t("useDifferentEmail")}
                  </button>
                </div>
              )}
            </div>
          )}

          </div>{/* end min-h wrapper */}
        </div>
      </div>

      {/* Footer */}
      <div className="px-8 py-4 border-t border-gray-50 flex items-center justify-between">
        <p className="text-[11px] text-gray-300">© {new Date().getFullYear()} {libraryName} Management System</p>
        <Link
          href={`/${locale}/member/login`}
          className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
        >
          {t("memberQuestion")} {t("memberPortalCtaShort")}
        </Link>
      </div>
    </div>
  );
}
