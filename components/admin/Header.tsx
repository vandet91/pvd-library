"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { signOut } from "next-auth/react";
import Link from "next/link";
import {
  Bell, Globe, ChevronDown, User, Settings, LogOut,
  AlertTriangle, Clock, CheckCircle2, Loader2, Inbox, CalendarClock,
  KeyRound, Eye, EyeOff, CheckCircle,
} from "lucide-react";
import { useTheme, type ThemeName } from "@/components/ThemeProvider";
import { useEnabledLocales } from "@/context/enabled-locales";

interface HeaderProps {
  title:       string;
  adminName?:  string;
  adminEmail?: string;
  role?:       string;
}

const ROLE_LABEL: Record<string, string> = {
  ADMIN:     "Administrator",
  LIBRARIAN: "Librarian",
  STAFF:     "Staff",
  MEMBER:    "Member",
};

/* ── types ─────────────────────────────────────────────────────────────── */
interface Notification {
  id:        string;
  type:      "overdue" | "reservation" | "return" | "request" | "expiry";
  title:     string;
  message:   string;
  href:      string;
  createdAt: string;
}

interface NotifResponse {
  notifications: Notification[];
  counts: { overdue: number; reservations: number; requests: number; expiring: number; total: number };
}

/* ── helpers ────────────────────────────────────────────────────────────── */
function useOutsideClick(ref: { current: HTMLElement | null }, cb: () => void) {
  const cbRef = useRef(cb);
  cbRef.current = cb;                // always fresh, never stale
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) cbRef.current();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ref]);                         // effect only re-runs if the dom ref changes
}

const notifIcon: Record<Notification["type"], React.ReactNode> = {
  overdue:     <AlertTriangle  className="w-4 h-4 text-red-500"    />,
  reservation: <Clock          className="w-4 h-4 text-amber-500"  />,
  return:      <CheckCircle2   className="w-4 h-4 text-green-500"  />,
  request:     <Inbox          className="w-4 h-4 text-pink-500"   />,
  expiry:      <CalendarClock  className="w-4 h-4 text-orange-500" />,
};

const notifBg: Record<Notification["type"], string> = {
  overdue:     "bg-red-50",
  reservation: "bg-amber-50",
  return:      "bg-green-50",
  request:     "bg-pink-50",
  expiry:      "bg-orange-50",
};

/* ══════════════════════════════════════════════════════════════════════════
   HEADER
══════════════════════════════════════════════════════════════════════════ */
export default function Header({ title, adminName = "Admin", adminEmail = "", role = "STAFF" }: HeaderProps) {
  const locale = useLocale();
  const th     = useTranslations("header");

  /* ── language dropdown ── */
  const enabledLocales = useEnabledLocales();
  const currentLocaleEntry = enabledLocales.find((l) => l.code === locale) ?? enabledLocales[0];

  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);
  useOutsideClick(langRef, () => setLangOpen(false));

  const [switching, setSwitching] = useState(false);
  function switchLocale(next: string) {
    if (next === locale) { setLangOpen(false); return; }
    setSwitching(true);
    // Hard redirect so the address bar always reflects the new locale.
    // Locale is always the first path segment: /en/... or /km/...
    const segments = window.location.pathname.split("/");
    segments[1] = next;
    window.location.href = segments.join("/");
  }

  /* ── notification dropdown ── */
  const [bellOpen,  setBellOpen]  = useState(false);
  const [notifs,    setNotifs]    = useState<NotifResponse | null>(null);
  const [notifLoad, setNotifLoad] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  useOutsideClick(bellRef, () => setBellOpen(false));

  const loadNotifs = useCallback(async () => {
    setNotifLoad(true);
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) setNotifs(await res.json());
    } catch {
      // Non-critical — notifications fail silently
    } finally {
      setNotifLoad(false);
    }
  }, []);

  useEffect(() => { loadNotifs(); }, [loadNotifs]);

  /* ── user dropdown ── */
  const [userOpen, setUserOpen] = useState(false);
  const userRef = useRef<HTMLDivElement>(null);
  useOutsideClick(userRef, () => {
    setUserOpen(false);
    setPwOpen(false);
  });

  /* ── change-password panel (non-admin) ── */
  const [pwOpen,    setPwOpen]    = useState(false);
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew,     setPwNew]     = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwShowC,   setPwShowC]   = useState(false);
  const [pwShowN,   setPwShowN]   = useState(false);
  const [pwError,   setPwError]   = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError(null);
    if (pwNew !== pwConfirm) { setPwError(th("passwordMismatch")); return; }
    setPwLoading(true);
    try {
      const res = await fetch("/api/users/me/password", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ currentPassword: pwCurrent, newPassword: pwNew }),
      });
      const data = await res.json();
      if (!res.ok) { setPwError(data.error ?? th("passwordChangeFailed")); return; }
      setPwSuccess(true);
      setPwCurrent(""); setPwNew(""); setPwConfirm("");
      setTimeout(() => { setPwSuccess(false); setPwOpen(false); setUserOpen(false); }, 2000);
    } catch {
      setPwError(th("networkError"));
    } finally {
      setPwLoading(false);
    }
  }

  const { theme, setTheme } = useTheme();

  const initials = adminName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const THEME_SWATCHES: { id: ThemeName; color: string; label: string }[] = [
    { id: "ocean",     color: "#1d4ed8", label: "Ocean"     },
    { id: "midnight",  color: "#7c3aed", label: "Midnight"  },
    { id: "emerald",   color: "#059669", label: "Emerald"   },
    { id: "academic",  color: "#0f766e", label: "Academic"  },
    { id: "parchment", color: "#b45309", label: "Parchment" },
    { id: "slate",     color: "#0284c7", label: "Slate"     },
    { id: "terminal",  color: "#22c55e", label: "Terminal"  },
  ];

  /* ── render ── */
  return (
    <header
      className="admin-header h-16 border-b px-6 flex items-center justify-between z-30 relative"
      style={{ backgroundColor: "var(--header-bg)", borderColor: "var(--header-border)" }}
    >
      {/* left */}
      <h1 className="admin-header-title text-xl font-semibold text-gray-800 truncate">{title}</h1>

      {/* right controls */}
      <div className="flex items-center gap-2">

        {/* ── language toggle — hidden when only 1 locale is enabled ── */}
        {enabledLocales.length > 1 && (
          <div ref={langRef} className="relative">
            <button
              onClick={() => setLangOpen((o) => !o)}
              className="admin-header-btn flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600
                         hover:bg-gray-100 transition-colors border border-gray-200"
            >
              {switching
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Globe   className="w-3.5 h-3.5" />
              }
              <span>{currentLocaleEntry.nativeLabel}</span>
              <ChevronDown className={`w-3 h-3 transition-transform ${langOpen ? "rotate-180" : ""}`} />
            </button>

            {langOpen && (
              <div className="admin-header-panel absolute right-0 top-full mt-1.5 w-40 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden z-50">
                {enabledLocales.map(({ code, nativeLabel }) => (
                  <button
                    key={code}
                    onClick={() => switchLocale(code)}
                    className={`w-full flex items-center justify-between px-4 py-2.5 text-sm transition-colors
                      ${locale === code
                        ? "bg-indigo-50 text-indigo-700 font-semibold"
                        : "text-gray-700 hover:bg-gray-50"}`}
                  >
                    <span>{nativeLabel}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-mono uppercase
                      ${locale === code ? "bg-indigo-100 text-indigo-600" : "bg-gray-100 text-gray-500"}`}>
                      {code}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── notification bell ─────────────────────────────────────── */}
        <div ref={bellRef} className="relative">
          <button
            onClick={() => { setBellOpen((o) => !o); if (!bellOpen) loadNotifs(); }}
            className="admin-header-btn relative p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <Bell className="w-5 h-5" />
            {(notifs?.counts.total ?? 0) > 0 && (
              <span className="absolute top-1 right-1 min-w-[16px] h-4 px-0.5 bg-red-500 text-white text-[10px]
                               font-bold rounded-full flex items-center justify-center">
                {notifs!.counts.total > 9 ? "9+" : notifs!.counts.total}
              </span>
            )}
          </button>

          {bellOpen && (
            <div className="admin-header-panel absolute right-0 top-full mt-1.5 w-80 bg-white rounded-xl shadow-lg border border-gray-100 z-50 overflow-hidden">
              {/* header bar */}
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-800">{th("notifications")}</span>
                <div className="flex items-center gap-1.5 text-xs text-gray-500 flex-wrap">
                  {(notifs?.counts.overdue ?? 0) > 0 && (
                    <span className="px-1.5 py-0.5 bg-red-100 text-red-600 rounded-full font-medium">
                      {th("overdueCount", { count: notifs!.counts.overdue })}
                    </span>
                  )}
                  {(notifs?.counts.reservations ?? 0) > 0 && (
                    <span className="px-1.5 py-0.5 bg-amber-100 text-amber-600 rounded-full font-medium">
                      {th("reservationsCount", { count: notifs!.counts.reservations })}
                    </span>
                  )}
                  {(notifs?.counts.requests ?? 0) > 0 && (
                    <span className="px-1.5 py-0.5 bg-pink-100 text-pink-600 rounded-full font-medium">
                      {th("requestsCount", { count: notifs!.counts.requests })}
                    </span>
                  )}
                </div>
              </div>

              {/* list */}
              <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
                {notifLoad && (
                  <div className="flex items-center justify-center py-8 text-gray-400">
                    <Loader2 className="w-5 h-5 animate-spin" />
                  </div>
                )}
                {!notifLoad && (!notifs || notifs.notifications.length === 0) && (
                  <div className="py-10 text-center text-sm text-gray-400">
                    {th("allCaughtUp")}
                  </div>
                )}
                {!notifLoad && notifs?.notifications.map((n) => (
                  <Link
                    key={n.id}
                    href={`/${locale}/admin/${n.href}`}
                    onClick={() => setBellOpen(false)}
                    className={`flex gap-3 px-4 py-3 hover:bg-gray-50 transition-colors ${notifBg[n.type]}/30`}
                  >
                    <div className="mt-0.5 shrink-0">{notifIcon[n.type]}</div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{n.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{n.message}</p>
                    </div>
                  </Link>
                ))}
              </div>

              {/* footer */}
              <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50/50">
                <Link
                  href={`/${locale}/admin/circulation`}
                  onClick={() => setBellOpen(false)}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  {th("viewAllActivity")}
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* ── user menu ─────────────────────────────────────────────── */}
        <div ref={userRef} className="relative">
          <button
            onClick={() => { setUserOpen((o) => !o); setPwOpen(false); }}
            className="admin-header-btn flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shrink-0">
              <span className="text-white text-xs font-bold">{initials}</span>
            </div>
            <div className="hidden sm:block text-left">
              <p className="admin-header-user-name text-sm font-semibold text-gray-800 leading-none">{adminName}</p>
              <p className="admin-header-user-sub text-xs text-gray-400 mt-0.5 leading-none">{ROLE_LABEL[role] ?? role}</p>
            </div>
            <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${userOpen ? "rotate-180" : ""}`} />
          </button>

          {userOpen && (
            <div className="admin-header-panel absolute right-0 top-full mt-1.5 w-64 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden z-50">
              {/* identity */}
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50">
                <p className="text-sm font-semibold text-gray-800 truncate">{adminName}</p>
                {adminEmail && (
                  <p className="text-xs text-gray-400 truncate mt-0.5">{adminEmail}</p>
                )}
              </div>

              {/* ── per-user theme switcher ─────────────────────────── */}
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-500 mb-2">{th("myTheme")}</p>
                <div className="flex items-center gap-2.5">
                  {THEME_SWATCHES.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setTheme(s.id)}
                      title={s.label}
                      className={`w-7 h-7 rounded-full transition-all ${
                        theme === s.id
                          ? "ring-2 ring-offset-2 ring-indigo-400 scale-110"
                          : "opacity-60 hover:opacity-100 hover:scale-105"
                      }`}
                      style={{ background: s.color }}
                    />
                  ))}
                </div>
              </div>

              {/* links — ADMIN sees Users & Settings; others get Change Password */}
              <div className="py-1">
                {role === "ADMIN" ? (
                  <>
                    <Link
                      href={`/${locale}/admin/users`}
                      onClick={() => setUserOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <User className="w-4 h-4 text-gray-400" />
                      {th("usersPermissions")}
                    </Link>
                    <Link
                      href={`/${locale}/admin/settings`}
                      onClick={() => setUserOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <Settings className="w-4 h-4 text-gray-400" />
                      {th("settings")}
                    </Link>
                  </>
                ) : (
                  <button
                    onClick={() => { setPwOpen((o) => !o); setPwError(null); setPwSuccess(false); }}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <KeyRound className="w-4 h-4 text-gray-400" />
                    {th("changePassword")}
                    <ChevronDown className={`w-3 h-3 text-gray-400 ml-auto transition-transform ${pwOpen ? "rotate-180" : ""}`} />
                  </button>
                )}
              </div>

              {/* change-password inline form (non-admin only) */}
              {role !== "ADMIN" && pwOpen && (
                <div className="px-4 pb-3 border-t border-gray-100 pt-3">
                  {pwSuccess ? (
                    <div className="flex items-center gap-2 text-sm text-green-600 py-2">
                      <CheckCircle className="w-4 h-4 shrink-0" />
                      {th("passwordChanged")}
                    </div>
                  ) : (
                    <form onSubmit={handleChangePassword} className="space-y-2.5">
                      {/* current password */}
                      <div className="relative">
                        <input
                          type={pwShowC ? "text" : "password"}
                          value={pwCurrent}
                          onChange={(e) => setPwCurrent(e.target.value)}
                          required
                          autoComplete="current-password"
                          placeholder={th("currentPassword")}
                          className="w-full pr-9 pl-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent"
                        />
                        <button type="button" tabIndex={-1}
                          onClick={() => setPwShowC((v) => !v)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                          {pwShowC ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      {/* new password */}
                      <div className="relative">
                        <input
                          type={pwShowN ? "text" : "password"}
                          value={pwNew}
                          onChange={(e) => setPwNew(e.target.value)}
                          required minLength={8}
                          autoComplete="new-password"
                          placeholder={th("newPassword")}
                          className="w-full pr-9 pl-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent"
                        />
                        <button type="button" tabIndex={-1}
                          onClick={() => setPwShowN((v) => !v)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                          {pwShowN ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      {/* confirm */}
                      <input
                        type="password"
                        value={pwConfirm}
                        onChange={(e) => setPwConfirm(e.target.value)}
                        required minLength={8}
                        autoComplete="new-password"
                        placeholder={th("confirmPassword")}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent"
                      />
                      {pwError && (
                        <p className="text-xs text-red-600 bg-red-50 px-2.5 py-1.5 rounded-lg">{pwError}</p>
                      )}
                      <button
                        type="submit"
                        disabled={pwLoading}
                        className="w-full py-2 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-60"
                        style={{ background: "var(--accent)" }}
                      >
                        {pwLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : th("updatePassword")}
                      </button>
                    </form>
                  )}
                </div>
              )}

              {/* sign out */}
              <div className="border-t border-gray-100 py-1">
                <button
                  onClick={() => signOut({ callbackUrl: `/${locale}/auth/login` })}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  {th("signOut")}
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </header>
  );
}
