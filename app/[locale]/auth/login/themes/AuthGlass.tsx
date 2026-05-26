"use client";

import { BookOpen, Eye, EyeOff, User, Mail, Loader2, MailCheck, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useLocale } from "next-intl";
import LanguageToggle from "@/components/shared/LanguageToggle";
import { useLoginForm } from "../useLoginForm";
import { useAuthMethod } from "../useAuthMethod";
import { useLibraryName } from "@/context/library-name";

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

const glassInput = {
  background: "rgba(255,255,255,0.12)",
  border:     "1px solid rgba(255,255,255,0.20)",
};

export default function AuthGlass() {
  const locale = useLocale();
  const libraryName = useLibraryName();
  const {
    identifier, setIdentifier,
    password, setPassword,
    showPassword, setShowPassword,
    error, loading, handleSubmit, t,
  } = useLoginForm();

  const am = useAuthMethod();

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{ background: "linear-gradient(135deg, var(--login-from) 0%, var(--login-mid) 50%, var(--login-to) 100%)" }}
    >
      <div className="absolute top-5 right-5 z-20"><LanguageToggle /></div>

      {/* Blobs */}
      <div className="absolute w-[600px] h-[600px] rounded-full opacity-20 blur-3xl animate-pulse"
           style={{ background: "var(--login-to)", top: "-15%", left: "-10%" }} />
      <div className="absolute w-[500px] h-[500px] rounded-full opacity-20 blur-3xl animate-pulse"
           style={{ background: "var(--login-from)", bottom: "-10%", right: "-5%", animationDelay: "1s" }} />

      {/* Glass card */}
      <div
        className="relative z-10 w-full max-w-md rounded-3xl p-8 shadow-2xl border"
        style={{ background: "rgba(255,255,255,0.10)", backdropFilter: "blur(28px) saturate(180%)",
                 WebkitBackdropFilter: "blur(28px) saturate(180%)", borderColor: "rgba(255,255,255,0.25)" }}
      >
        {/* Brand */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 shadow-lg border"
               style={{ background: "rgba(255,255,255,.20)", borderColor: "rgba(255,255,255,.35)" }}>
            <BookOpen className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">{libraryName}</h1>
          <p className="text-white/60 text-sm mt-1">{t("loginSubtitle")}</p>
        </div>

        {/* ── Method tabs ───────────────────────────────────── */}
        <div className="flex gap-1 p-1 rounded-xl mb-6 border border-white/15"
             style={{ background: "rgba(255,255,255,0.08)" }}>
          {([ ["password" as const, t("methodPassword")], ["google" as const, t("methodGoogle")], ["magic" as const, t("methodMagic")] ]).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => am.setMethod(key as "password" | "google" | "magic")}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all focus:outline-none ${
                am.method === key
                  ? "bg-white/20 text-white shadow-sm"
                  : "text-white/50 hover:text-white/80"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Method content — min-h keeps card height stable across tabs ── */}
        <div className="min-h-[264px]">

        {/* ── Password method ─────────────────────────────── */}
        {am.method === "password" && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="glass-identifier" className="block text-sm font-medium text-white/80 mb-1.5">{t("emailOrMemberId")}</label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" />
                <input id="glass-identifier" type="text" value={identifier} onChange={(e) => setIdentifier(e.target.value)}
                  required autoComplete="username" placeholder="admin@library.com"
                  className="w-full pl-10 pr-4 py-3 rounded-xl text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/40 transition"
                  style={glassInput} />
              </div>
            </div>
            <div>
              <label htmlFor="glass-password" className="block text-sm font-medium text-white/80 mb-1.5">{t("password")}</label>
              <div className="relative">
                <input id="glass-password" type={showPassword ? "text" : "password"} value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required autoComplete="current-password" placeholder="••••••••"
                  className="w-full px-4 py-3 pr-11 rounded-xl text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/40 transition"
                  style={glassInput} />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/50 hover:text-white/80 transition-colors focus:outline-none">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            {(error || am.urlError === "MemberAccount") && (
              am.urlError === "MemberAccount" ? (
                <div className="text-sm px-4 py-3 rounded-xl border"
                     style={{ background: "rgba(245,158,11,0.20)", borderColor: "rgba(245,158,11,0.40)", color: "#fde68a" }}>
                  {t("staffOnlyError")}{" "}
                  <Link href={`/${locale}/member/login`} className="font-semibold underline">
                    {t("memberPortalCtaShort")}
                  </Link>
                </div>
              ) : (
                <div className="text-sm px-4 py-3 rounded-xl border"
                     style={{ background: "rgba(239,68,68,0.20)", borderColor: "rgba(239,68,68,0.40)", color: "#fca5a5" }}>
                  {error}
                </div>
              )
            )}
            <button type="submit" disabled={loading}
              className="w-full py-3 rounded-xl font-semibold text-sm text-white transition-all focus:outline-none hover:shadow-xl active:scale-[0.99] disabled:opacity-60 mt-2"
              style={{ background: "rgba(255,255,255,0.25)", border: "1px solid rgba(255,255,255,0.40)" }}>
              {loading ? t("loggingIn") ?? "Signing in…" : t("login")}
            </button>
            <p className="text-center text-xs text-white/40">{t("staffHint")}</p>
          </form>
        )}

        {/* ── Google method ─────────────────────────────────── */}
        {am.method === "google" && (
          <div className="space-y-5">
            <p className="text-sm text-white/60 text-center">
              {t("googleDesc")}<br />
              <span className="text-xs text-white/40">{t("googleStaffOnly")}</span>
            </p>
            {(am.googleError || am.urlError) && (
              <div className="text-sm px-4 py-3 rounded-xl border"
                   style={{ background: "rgba(239,68,68,.20)", borderColor: "rgba(239,68,68,.40)", color: "#fca5a5" }}>
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
            <button type="button" onClick={am.startGoogle} disabled={am.googleLoading}
              className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl font-semibold text-sm bg-white text-gray-700 hover:bg-gray-50 transition-all focus:outline-none shadow-lg disabled:opacity-60">
              {am.googleLoading ? <Loader2 className="w-5 h-5 animate-spin text-gray-400" /> : <GoogleIcon />}
              {am.googleLoading ? t("redirecting") : t("continueWithGoogle")}
            </button>
          </div>
        )}

        {/* ── Magic Link method ──────────────────────────────── */}
        {am.method === "magic" && (
          <div className="space-y-5">
            {!am.magicSent ? (
              <>
                <p className="text-sm text-white/60 text-center">
                  {t("magicDesc")}
                </p>
                <form onSubmit={am.sendMagicLink} className="space-y-4">
                  <div>
                    <label htmlFor="glass-magic-email" className="block text-sm font-medium text-white/80 mb-1.5">{t("staffEmail")}</label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" />
                      <input id="glass-magic-email" type="email" value={am.magicEmail}
                        onChange={(e) => am.setMagicEmail(e.target.value)}
                        required autoComplete="email" placeholder="admin@library.com"
                        className="w-full pl-10 pr-4 py-3 rounded-xl text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/40 transition"
                        style={glassInput} />
                    </div>
                  </div>
                  {am.magicError && (
                    <div className="text-sm px-4 py-3 rounded-xl border"
                         style={{ background: "rgba(239,68,68,.20)", borderColor: "rgba(239,68,68,.40)", color: "#fca5a5" }}>
                      {am.magicError}
                    </div>
                  )}
                  <button type="submit" disabled={am.magicLoading}
                    className="w-full py-3 rounded-xl font-semibold text-sm text-white transition-all focus:outline-none hover:shadow-xl active:scale-[0.99] disabled:opacity-60"
                    style={{ background: "rgba(255,255,255,0.25)", border: "1px solid rgba(255,255,255,0.40)" }}>
                    {am.magicLoading
                      ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> {t("sending")}</span>
                      : t("sendMagicLink")}
                  </button>
                </form>
              </>
            ) : (
              <div className="text-center py-4 space-y-4">
                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto border border-white/20"
                     style={{ background: "rgba(255,255,255,.15)" }}>
                  <MailCheck className="w-8 h-8 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-white mb-1">{t("checkInbox")}</p>
                  <p className="text-sm text-white/60">{t("magicSentTo", { email: am.magicEmail })}</p>
                </div>
                <button type="button" onClick={am.resetMagic}
                  className="inline-flex items-center gap-1.5 text-sm text-white/40 hover:text-white/70 transition-colors focus:outline-none">
                  <ArrowLeft className="w-3.5 h-3.5" /> {t("useDifferentEmail")}
                </button>
              </div>
            )}
          </div>

        )}

        </div>{/* end min-h wrapper */}

        {/* Member portal link */}
        <p className="mt-6 text-center text-xs text-white/40">
          {t("memberQuestion")}{" "}
          <Link href={`/${locale}/member/login`} className="text-white/70 font-semibold hover:text-white transition-colors">
            {t("memberPortalBtn")}
          </Link>
        </p>
      </div>
    </div>
  );
}
