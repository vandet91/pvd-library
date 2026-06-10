"use client";

import { BookOpen, Eye, EyeOff, User, BookMarked, Library, Users, Mail, Loader2, MailCheck, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useLocale } from "next-intl";
import LanguageToggle from "@/components/shared/LanguageToggle";
import { useLoginForm } from "../useLoginForm";
import { useAuthMethod } from "../useAuthMethod";
import { useLibraryName } from "@/context/library-name";
import { useLibraryLogo } from "@/context/library-logo";

/* ── Google "G" icon ─────────────────────────────────────────── */
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

export default function AuthSplit() {
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

  const features = [
    { icon: Library,    text: t("featureCirculation") },
    { icon: BookMarked, text: t("featureCatalog") },
    { icon: Users,      text: t("featureMember") },
  ];

  return (
    <div className="min-h-screen flex">
      {/* ── Left panel ─────────────────────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-[45%] flex-col justify-between p-12 relative overflow-hidden"
        style={{ background: "linear-gradient(145deg, var(--login-from) 0%, var(--login-mid) 50%, var(--login-to) 100%)" }}
      >
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full opacity-10 bg-white" />
        <div className="absolute -bottom-20 -right-20 w-80 h-80 rounded-full opacity-10 bg-white" />

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-11 h-11 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center border border-white/30 overflow-hidden">
              {libraryLogo
                ? <img src={libraryLogo} alt={libraryName} className="w-full h-full object-contain p-1" />
                : <BookOpen className="w-6 h-6 text-white" />}
            </div>
            <span className="text-white font-bold text-xl tracking-tight">{libraryName}</span>
          </div>
          <p className="text-white/60 text-sm ml-14">{t("leftPanelSubtitle")}</p>
        </div>

        <div className="relative z-10 space-y-8">
          <blockquote className="text-white">
            <p className="text-3xl font-light leading-snug">
              &ldquo;{t("libraryQuote")}&rdquo;
            </p>
            <footer className="mt-4 text-white/50 text-sm">{t("libraryQuoteAuthor")}</footer>
          </blockquote>
          <ul className="space-y-3">
            {features.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-white/80 text-sm">
                <div className="w-7 h-7 rounded-lg bg-white/15 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-3.5 h-3.5 text-white" />
                </div>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative z-10 flex gap-2">
          {[0, 1, 2].map((i) => (
            <span key={i} className={`h-1.5 rounded-full ${i === 0 ? "w-6 bg-white" : "w-1.5 bg-white/40"}`} />
          ))}
        </div>
      </div>

      {/* ── Right panel ────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col">
        <div className="flex items-center justify-between px-8 pt-6">
          <div className="flex items-center gap-2 lg:hidden">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden" style={{ background: libraryLogo ? "transparent" : "var(--accent)" }}>
              {libraryLogo
                ? <img src={libraryLogo} alt={libraryName} className="w-full h-full object-contain" />
                : <BookOpen className="w-4 h-4 text-white" />}
            </div>
            <span className="font-bold text-gray-800">{libraryName}</span>
          </div>
          <div className="hidden lg:block" />
          <LanguageToggle variant="light" />
        </div>

        <div className="flex-1 flex items-center justify-center px-8 py-12">
          <div className="w-full max-w-sm">
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-gray-900 mb-1">{t("welcome")}</h1>
              <p className="text-gray-500 text-sm">{t("loginSubtitle")}</p>
            </div>

            {/* ── Method tabs ───────────────────────────────── */}
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
            <div className="min-h-[276px]">

            {/* ── Password method ─────────────────────────── */}
            {am.method === "password" && (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label htmlFor="split-identifier" className="block text-sm font-medium text-gray-700 mb-1.5">{t("emailOrMemberId")}</label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      id="split-identifier"
                      type="text" value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      required autoComplete="username"
                      placeholder="admin@library.com · MEM-2024-001"
                      className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:border-transparent transition"
                      style={{ "--tw-ring-color": "var(--accent)" } as React.CSSProperties}
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="split-password" className="block text-sm font-medium text-gray-700 mb-1.5">{t("password")}</label>
                  <div className="relative">
                    <input
                      id="split-password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required autoComplete="current-password"
                      placeholder="••••••••"
                      className="w-full px-4 py-3 pr-11 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:border-transparent transition"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                {(error || am.urlError === "MemberAccount") && (
                  am.urlError === "MemberAccount" ? (
                    <div className="bg-amber-50 text-amber-700 text-sm px-4 py-3 rounded-xl border border-amber-200">
                      {t("staffOnlyError")}{" "}
                      <Link href={`/${locale}/member/login`} className="font-semibold underline">
                        {t("memberPortalCta")}
                      </Link>
                    </div>
                  ) : (
                    <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl border border-red-100">{error}</div>
                  )
                )}
                <button type="submit" disabled={loading}
                  className="w-full py-3 rounded-xl font-semibold text-sm transition-all focus:outline-none disabled:opacity-60 shadow-sm hover:shadow-md active:scale-[0.99]"
                  style={{ background: "var(--accent)", color: "var(--accent-fg)" }}>
                  {loading ? t("loggingIn") ?? "Signing in…" : t("login")}
                </button>
                <p className="text-center text-xs text-gray-400">{t("staffHint")}</p>
              </form>
            )}

            {/* ── Google method ────────────────────────────── */}
            {am.method === "google" && (
              <div className="space-y-5">
                <p className="text-sm text-gray-500 text-center">
                  {t("googleDesc")}<br />
                  <span className="text-xs text-gray-400">{t("googleStaffOnly")}</span>
                </p>
                {(am.googleError || am.urlError) && (
                  <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl border border-red-100">
                    {am.urlError === "MethodNotAllowed"
                      ? t("googleMethodNotAllowed")
                      : am.urlError === "AccessDenied"
                      ? t("googleAccessDenied")
                      : am.urlError === "OAuthAccountNotLinked"
                      ? t("googleAccountLinked")
                      : am.urlError === "Configuration"
                      ? t("googleNotConfigured")
                      : am.googleError || t("googleFailed")}
                  </div>
                )}
                <button
                  type="button"
                  onClick={am.startGoogle}
                  disabled={am.googleLoading}
                  className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl border-2 border-gray-200 bg-white text-gray-700 font-semibold text-sm hover:border-gray-300 hover:shadow-md transition-all focus:outline-none disabled:opacity-60"
                >
                  {am.googleLoading
                    ? <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                    : <GoogleIcon />}
                  {am.googleLoading ? t("redirecting") : t("continueWithGoogle")}
                </button>
              </div>
            )}

            {/* ── Magic Link method ─────────────────────────── */}
            {am.method === "magic" && (
              <div className="space-y-5">
                {!am.magicSent ? (
                  <>
                    <p className="text-sm text-gray-500 text-center">
                      {t("magicDesc")}
                    </p>
                    <form onSubmit={am.sendMagicLink} className="space-y-4">
                      <div>
                        <label htmlFor="split-magic-email" className="block text-sm font-medium text-gray-700 mb-1.5">{t("staffEmail")}</label>
                        <div className="relative">
                          <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                          <input
                            id="split-magic-email"
                            type="email" value={am.magicEmail}
                            onChange={(e) => am.setMagicEmail(e.target.value)}
                            required autoComplete="email"
                            placeholder="admin@library.com"
                            className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:border-transparent transition"
                            style={{ "--tw-ring-color": "var(--accent)" } as React.CSSProperties}
                          />
                        </div>
                      </div>
                      {am.magicError && (
                        <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl border border-red-100">{am.magicError}</div>
                      )}
                      <button type="submit" disabled={am.magicLoading}
                        className="w-full py-3 rounded-xl font-semibold text-sm transition-all focus:outline-none disabled:opacity-60 shadow-sm hover:shadow-md active:scale-[0.99]"
                        style={{ background: "var(--accent)", color: "var(--accent-fg)" }}>
                        {am.magicLoading
                          ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> {t("sending")}</span>
                          : t("sendMagicLink")}
                      </button>
                    </form>
                  </>
                ) : (
                  <div className="text-center py-4 space-y-4">
                    <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto"
                         style={{ background: "rgba(29,78,216,.12)" }}>
                      <MailCheck className="w-8 h-8" style={{ color: "var(--accent)" }} />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 mb-1">{t("checkInbox")}</p>
                      <p className="text-sm text-gray-500">{t("magicSentTo", { email: am.magicEmail })}</p>
                    </div>
                    <button type="button" onClick={am.resetMagic}
                      className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors focus:outline-none">
                      <ArrowLeft className="w-3.5 h-3.5" /> {t("useDifferentEmail")}
                    </button>
                  </div>
                )}
              </div>
            )}

            </div>{/* end min-h wrapper */}

            {/* Member portal link */}
            <p className="mt-8 pt-6 border-t border-gray-100 text-center text-xs text-gray-400">
              {t("memberQuestion")}{" "}
              <Link href={`/${locale}/member/login`} className="text-indigo-600 font-semibold hover:underline">
                {t("memberPortalBtn")}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
