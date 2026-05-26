"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Save,
  Settings,
  BookOpen,
  DollarSign,
  RefreshCw,
  Building2,
  Mail,
  Phone,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Users,
  Palette,
  Monitor,
  Bell,
  Globe,
  Info,
  Lock,
  ImagePlus,
  Trash2,
} from "lucide-react";
import { useLibraryLogo } from "@/context/library-logo";
import { ALL_LOCALES, DEFAULT_LOCALE } from "@/lib/locales";
import { useTranslations } from "next-intl";

interface SettingsData {
  DEFAULT_LOAN_DAYS:                string;
  FINE_PER_DAY:                     string;
  MAX_RENEWALS:                     string;
  MAX_LOANS_PER_MEMBER:             string;
  RESERVATION_EXPIRE_DAYS:          string;
  MAX_RESERVATION_QUEUE_MULTIPLIER: string;
  DEFAULT_REPLACEMENT_COST:         string;
  NOTIFICATIONS_ENABLED:            string;
  DUE_SOON_DAYS:                    string;
  LIBRARY_NAME:                     string;
  LIBRARY_EMAIL:                    string;
  LIBRARY_PHONE:                    string;
  DEFAULT_STAFF_THEME:              string;
  DEFAULT_STAFF_AUTH_STYLE:         string;
  DEFAULT_STAFF_AUTH_METHODS:       string;
  ENABLED_LOCALES:                  string;
}

const DEFAULT: SettingsData = {
  DEFAULT_LOAN_DAYS:                "14",
  FINE_PER_DAY:                     "0.50",
  MAX_RENEWALS:                     "2",
  MAX_LOANS_PER_MEMBER:             "3",
  RESERVATION_EXPIRE_DAYS:          "7",
  MAX_RESERVATION_QUEUE_MULTIPLIER: "3",
  DEFAULT_REPLACEMENT_COST:         "20.00",
  NOTIFICATIONS_ENABLED:            "true",
  DUE_SOON_DAYS:                    "3",
  LIBRARY_NAME:                     "PVD Library",
  LIBRARY_EMAIL:                    "",
  LIBRARY_PHONE:                    "",
  DEFAULT_STAFF_THEME:              "ocean",
  DEFAULT_STAFF_AUTH_STYLE:         "split",
  DEFAULT_STAFF_AUTH_METHODS:       '["password","google","magic"]',
  ENABLED_LOCALES:                  JSON.stringify(ALL_LOCALES.map(l => l.code)),
};

type Status = "idle" | "loading" | "saving" | "saved" | "error";

/* ── Appearance data ───────────────────────────────────────────────────── */
const THEMES = [
  {
    id:      "ocean",
    nameKey: "themeOceanName",
    descKey: "themeOceanDesc",
    sidebar: "#1e3a5f",
    pageBg:  "#f9fafb",
    header:  "#ffffff",
    border:  "#e5e7eb",
    accent:  "#1d4ed8",
  },
  {
    id:      "midnight",
    nameKey: "themeMidnightName",
    descKey: "themeMidnightDesc",
    sidebar: "#0c0a1e",
    pageBg:  "#0a0816",
    header:  "#13111f",
    border:  "#2d2550",
    accent:  "#7c3aed",
  },
  {
    id:      "emerald",
    nameKey: "themeEmeraldName",
    descKey: "themeEmeraldDesc",
    sidebar: "#064e3b",
    pageBg:  "#f0fdf4",
    header:  "#ffffff",
    border:  "#bbf7d0",
    accent:  "#059669",
  },
];

const AUTH_STYLES = [
  {
    id:      "split",
    nameKey: "authSplitName",
    descKey: "authSplitDesc",
    preview: (
      <div className="flex h-full">
        <div className="w-2/5 bg-blue-900 h-full" />
        <div className="flex-1 bg-white flex items-center justify-center p-2">
          <div className="w-full space-y-1">
            <div className="h-1.5 bg-gray-200 rounded w-3/4" />
            <div className="h-1.5 bg-gray-200 rounded w-full" />
            <div className="h-2.5 bg-blue-700 rounded w-full mt-2" />
          </div>
        </div>
      </div>
    ),
  },
  {
    id:      "glass",
    nameKey: "authGlassName",
    descKey: "authGlassDesc",
    preview: (
      <div className="relative h-full bg-gradient-to-br from-blue-900 via-indigo-800 to-blue-700 flex items-center justify-center">
        <div className="w-3/4 h-8 rounded-lg border border-white/30"
             style={{ background: "rgba(255,255,255,0.15)", backdropFilter: "blur(8px)" }} />
      </div>
    ),
  },
  {
    id:      "minimal",
    nameKey: "authMinimalName",
    descKey: "authMinimalDesc",
    preview: (
      <div className="h-full bg-white flex flex-col">
        <div className="h-2 bg-gray-100 border-b border-gray-100" />
        <div className="flex-1 flex items-center justify-center p-2">
          <div className="w-full space-y-1">
            <div className="h-0.5 bg-gray-200 rounded w-full" />
            <div className="h-0.5 bg-gray-200 rounded w-full mt-2" />
            <div className="h-2 bg-gray-800 rounded w-full mt-2" />
          </div>
        </div>
      </div>
    ),
  },
];

export default function SettingsPage() {
  const t      = useTranslations("settings");
  const router = useRouter();

  const [data,   setData]   = useState<SettingsData>(DEFAULT);
  const [status, setStatus] = useState<Status>("loading");
  const [error,  setError]  = useState("");

  /* ── Logo state ── */
  const contextLogo   = useLibraryLogo();                    // latest value from context
  const [logoUrl,     setLogoUrl]     = useState(contextLogo);
  const [logoStatus,  setLogoStatus]  = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [logoMsg,     setLogoMsg]     = useState("");
  const fileInputRef  = useRef<HTMLInputElement>(null);

  // Keep local logo state in sync whenever context refreshes (after router.refresh())
  useEffect(() => { setLogoUrl(contextLogo); }, [contextLogo]);

  async function handleLogoFile(file: File) {
    setLogoStatus("uploading");
    setLogoMsg("");
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch("/api/settings/logo", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) { setLogoStatus("error"); setLogoMsg(json.error ?? t("logoUploadError")); return; }
      setLogoUrl(json.url);
      setLogoStatus("success");
      setLogoMsg(t("logoUploadSuccess"));
      router.refresh();
      setTimeout(() => setLogoStatus("idle"), 3000);
    } catch {
      setLogoStatus("error");
      setLogoMsg(t("logoUploadError"));
    }
  }

  async function handleLogoRemove() {
    setLogoStatus("uploading");
    setLogoMsg("");
    try {
      await fetch("/api/settings/logo", { method: "DELETE" });
      setLogoUrl("");
      setLogoStatus("success");
      setLogoMsg(t("logoRemoveSuccess"));
      router.refresh();
      setTimeout(() => setLogoStatus("idle"), 3000);
    } catch {
      setLogoStatus("error");
      setLogoMsg(t("logoUploadError"));
    }
  }

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await fetch("/api/settings");
      if (!res.ok) throw new Error("Failed to load");
      const json = await res.json();
      setData((prev) => ({ ...prev, ...json }));
      setStatus("idle");
    } catch {
      setStatus("error");
      setError(t("loadError"));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setStatus("saving");
    setError("");
    try {
      const res = await fetch("/api/settings", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Save failed");
      setStatus("saved");
      // Re-run server components so EnabledLocalesProvider gets fresh data
      // (e.g. language toggles update immediately in the header dropdown)
      router.refresh();
      setTimeout(() => setStatus("idle"), 2500);
    } catch {
      setStatus("error");
      setError(t("saveError"));
    }
  };

  const set = (key: keyof SettingsData, value: string) =>
    setData((prev) => ({ ...prev, [key]: value }));

  const staffMethods: string[] = (() => {
    try {
      const a = JSON.parse(data.DEFAULT_STAFF_AUTH_METHODS);
      return Array.isArray(a) ? a : ["password", "google", "magic"];
    } catch { return ["password", "google", "magic"]; }
  })();

  const enabledLocalesList: string[] = (() => {
    try {
      const a = JSON.parse(data.ENABLED_LOCALES);
      return Array.isArray(a) ? a : ALL_LOCALES.map(l => l.code);
    } catch { return ALL_LOCALES.map(l => l.code); }
  })();

  function toggleLocale(code: string, on: boolean) {
    const next = on
      ? [...enabledLocalesList, code]
      : enabledLocalesList.filter((c) => c !== code);
    // Never allow removing the default locale
    if (!next.includes(DEFAULT_LOCALE)) return;
    set("ENABLED_LOCALES", JSON.stringify(next));
  }

  const busy = status === "loading" || status === "saving";

  /* ------------------------------------------------------------------ */
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-50">
            <Settings className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
            <p className="text-sm text-gray-500">{t("subtitle")}</p>
          </div>
        </div>

        <button
          onClick={save}
          disabled={busy}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium
                     hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {status === "saving" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {status === "saving" ? t("saving") : t("saveChanges")}
        </button>
      </div>

      {/* Feedback banners */}
      {status === "saved" && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 text-green-700 text-sm border border-green-200">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {t("savedSuccess")}
        </div>
      )}
      {status === "error" && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* ── Login Page & Account Defaults ────────────────────────────── */}
      <Section title={t("sectionStaffDefaults")} icon={<Palette className="w-4 h-4 text-indigo-500" />}>
        <p className="text-xs text-gray-400 -mt-2">{t("staffDefaultsNote")}</p>

        {/* Login Theme */}
        <div className="space-y-3">
          <p className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
            <Monitor className="w-4 h-4 text-gray-400" />
            {t("defaultThemeLabel")}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {THEMES.map((thm) => (
              <button
                key={thm.id}
                type="button"
                onClick={() => set("DEFAULT_STAFF_THEME", thm.id)}
                disabled={busy}
                className={`relative rounded-xl border-2 p-4 text-left transition-all focus:outline-none hover:shadow-md disabled:opacity-60
                  ${data.DEFAULT_STAFF_THEME === thm.id
                    ? "border-indigo-500 shadow-md ring-2 ring-indigo-100"
                    : "border-gray-100 hover:border-gray-200"}`}
              >
                <div className="flex gap-1.5 mb-3 items-stretch h-10 rounded-lg overflow-hidden">
                  <div className="w-8 rounded-md flex-shrink-0" style={{ background: thm.sidebar }} />
                  <div className="flex-1 rounded-md" style={{ background: thm.pageBg }}>
                    <div className="h-2.5 m-1.5 rounded-sm" style={{ background: thm.header, border: `1px solid ${thm.border}` }} />
                  </div>
                </div>
                <p className="font-semibold text-gray-800 text-sm">{t(thm.nameKey as Parameters<typeof t>[0])}</p>
                <p className="text-xs text-gray-400 mt-0.5">{t(thm.descKey as Parameters<typeof t>[0])}</p>
                {data.DEFAULT_STAFF_THEME === thm.id && (
                  <span className="absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px]"
                    style={{ background: thm.accent }}>✓</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Login Page Style */}
        <div className="space-y-3">
          <p className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
            <Monitor className="w-4 h-4 text-gray-400" />
            {t("defaultAuthStyleLabel")}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {AUTH_STYLES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => set("DEFAULT_STAFF_AUTH_STYLE", s.id)}
                disabled={busy}
                className={`relative rounded-xl border-2 p-4 text-left transition-all focus:outline-none hover:shadow-md disabled:opacity-60
                  ${data.DEFAULT_STAFF_AUTH_STYLE === s.id
                    ? "border-indigo-500 shadow-md ring-2 ring-indigo-100"
                    : "border-gray-100 hover:border-gray-200"}`}
              >
                <div className="h-12 rounded-lg overflow-hidden mb-3 bg-gray-100">
                  {s.preview}
                </div>
                <p className="font-semibold text-gray-800 text-sm">{t(s.nameKey as Parameters<typeof t>[0])}</p>
                <p className="text-xs text-gray-400 mt-0.5">{t(s.descKey as Parameters<typeof t>[0])}</p>
                {data.DEFAULT_STAFF_AUTH_STYLE === s.id && (
                  <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center text-white text-[10px]">✓</span>
                )}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400">{t("loginStyleNote")}</p>
        </div>

        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
            <Users className="w-4 h-4 text-gray-400" />
            {t("defaultAuthMethodsLabel")}
          </p>
          <div className="flex flex-wrap gap-3">
            {(["password", "google", "magic"] as const).map((method) => (
              <label key={method}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-100 hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={staffMethods.includes(method)}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...staffMethods, method]
                      : staffMethods.filter((m) => m !== method);
                    if (next.length > 0) set("DEFAULT_STAFF_AUTH_METHODS", JSON.stringify(next));
                  }}
                  disabled={busy}
                  className="w-4 h-4 rounded accent-indigo-600"
                />
                <span className="text-sm text-gray-700">
                  {method === "password"
                    ? t("authMethodPassword")
                    : method === "google"
                    ? t("authMethodGoogle")
                    : t("authMethodMagic")}
                </span>
              </label>
            ))}
          </div>
          <p className="text-xs text-gray-400">{t("defaultAuthMethodsHint")}</p>
        </div>
      </Section>

      {/* ── Loan & Fine Policy ─────────────────────────────────────────── */}
      <Section title={t("sectionLoanPolicy")} icon={<BookOpen className="w-4 h-4 text-indigo-500" />}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <Field
            label={t("fieldLoanDaysLabel")}
            hint={t("fieldLoanDaysHint")}
            icon={<BookOpen className="w-4 h-4 text-gray-400" />}
          >
            <input
              type="number"
              min={1}
              max={365}
              value={data.DEFAULT_LOAN_DAYS}
              onChange={(e) => set("DEFAULT_LOAN_DAYS", e.target.value)}
              disabled={busy}
              className={inputCls}
            />
          </Field>

          <Field
            label={t("fieldFinePerDayLabel")}
            hint={t("fieldFinePerDayHint")}
            icon={<DollarSign className="w-4 h-4 text-gray-400" />}
          >
            <input
              type="number"
              min={0}
              step={0.01}
              value={data.FINE_PER_DAY}
              onChange={(e) => set("FINE_PER_DAY", e.target.value)}
              disabled={busy}
              className={inputCls}
            />
          </Field>

          <Field
            label={t("fieldReplaceCostLabel")}
            hint={t("fieldReplaceCostHint")}
            icon={<DollarSign className="w-4 h-4 text-gray-400" />}
          >
            <input
              type="number"
              min={0}
              step={0.01}
              value={data.DEFAULT_REPLACEMENT_COST}
              onChange={(e) => set("DEFAULT_REPLACEMENT_COST", e.target.value)}
              disabled={busy}
              className={inputCls}
            />
          </Field>

          <Field
            label={t("fieldMaxRenewalsLabel")}
            hint={t("fieldMaxRenewalsHint")}
            icon={<RefreshCw className="w-4 h-4 text-gray-400" />}
          >
            <input
              type="number"
              min={0}
              max={10}
              value={data.MAX_RENEWALS}
              onChange={(e) => set("MAX_RENEWALS", e.target.value)}
              disabled={busy}
              className={inputCls}
            />
          </Field>

          <Field
            label={t("fieldMaxLoansLabel")}
            hint={t("fieldMaxLoansHint")}
            icon={<Users className="w-4 h-4 text-gray-400" />}
          >
            <input
              type="number"
              min={1}
              max={20}
              value={data.MAX_LOANS_PER_MEMBER}
              onChange={(e) => set("MAX_LOANS_PER_MEMBER", e.target.value)}
              disabled={busy}
              className={inputCls}
            />
          </Field>

          <Field
            label={t("fieldReservationExpiryLabel")}
            hint={t("fieldReservationExpiryHint")}
            icon={<Clock className="w-4 h-4 text-gray-400" />}
          >
            <input
              type="number"
              min={1}
              max={90}
              value={data.RESERVATION_EXPIRE_DAYS}
              onChange={(e) => set("RESERVATION_EXPIRE_DAYS", e.target.value)}
              disabled={busy}
              className={inputCls}
            />
          </Field>

          <Field
            label={t("fieldQueueMultiplierLabel")}
            hint={t("fieldQueueMultiplierHint")}
            icon={<Users className="w-4 h-4 text-gray-400" />}
          >
            <input
              type="number"
              min={1}
              max={20}
              value={data.MAX_RESERVATION_QUEUE_MULTIPLIER}
              onChange={(e) => set("MAX_RESERVATION_QUEUE_MULTIPLIER", e.target.value)}
              disabled={busy}
              className={inputCls}
            />
          </Field>
        </div>
      </Section>

      {/* ── Email Notifications ────────────────────────────────────────── */}
      <Section title={t("sectionNotifications")} icon={<Bell className="w-4 h-4 text-amber-500" />}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <Field
            label={t("fieldNotificationsEnabledLabel")}
            hint={t("fieldNotificationsEnabledHint")}
            icon={<Bell className="w-4 h-4 text-gray-400" />}
          >
            <select
              value={data.NOTIFICATIONS_ENABLED}
              onChange={(e) => set("NOTIFICATIONS_ENABLED", e.target.value)}
              disabled={busy}
              className={inputCls}
            >
              <option value="true">{t("enabled")}</option>
              <option value="false">{t("disabled")}</option>
            </select>
          </Field>

          <Field
            label={t("fieldDueSoonDaysLabel")}
            hint={t("fieldDueSoonDaysHint")}
            icon={<Clock className="w-4 h-4 text-gray-400" />}
          >
            <input
              type="number"
              min={1}
              max={14}
              value={data.DUE_SOON_DAYS}
              onChange={(e) => set("DUE_SOON_DAYS", e.target.value)}
              disabled={busy}
              className={inputCls}
            />
          </Field>
        </div>
        <p className="text-xs text-gray-400 mt-4">
          {t("notifManageNote")}{" "}
          <a href="notifications" className="text-blue-600 hover:underline">{t("notifManageLink")}</a>.
        </p>
      </Section>

      {/* ── Library Information ────────────────────────────────────────── */}
      <Section title={t("sectionLibraryInfo")} icon={<Building2 className="w-4 h-4 text-indigo-500" />}>

        {/* Logo upload */}
        <div className="flex items-start gap-5 pb-5 border-b border-gray-100">
          {/* Preview */}
          <div className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden flex-shrink-0">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="logo" className="w-full h-full object-contain p-1.5" />
            ) : (
              <BookOpen className="w-8 h-8 text-gray-300" />
            )}
          </div>

          {/* Controls */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-700 flex items-center gap-1.5 mb-1">
              <ImagePlus className="w-4 h-4 text-gray-400" />
              {t("logoLabel")}
            </p>
            <p className="text-xs text-gray-400 mb-3">{t("logoHint")}</p>

            <div className="flex flex-wrap items-center gap-2">
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleLogoFile(f);
                  e.target.value = "";          // allow re-selecting the same file
                }}
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={logoStatus === "uploading"}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white
                           text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {logoStatus === "uploading"
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <ImagePlus className="w-3.5 h-3.5 text-gray-400" />}
                {logoUrl ? t("logoChangeBtn") : t("logoUploadBtn")}
              </button>

              {logoUrl && (
                <button
                  type="button"
                  onClick={handleLogoRemove}
                  disabled={logoStatus === "uploading"}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-100 bg-red-50
                             text-sm text-red-600 hover:bg-red-100 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {t("logoRemoveBtn")}
                </button>
              )}
            </div>

            {/* Feedback */}
            {logoStatus === "success" && (
              <p className="mt-2 text-xs text-green-600 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> {logoMsg}
              </p>
            )}
            {logoStatus === "error" && (
              <p className="mt-2 text-xs text-red-600 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" /> {logoMsg}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <Field
            label={t("fieldLibraryNameLabel")}
            hint={t("fieldLibraryNameHint")}
            icon={<Building2 className="w-4 h-4 text-gray-400" />}
          >
            <input
              type="text"
              value={data.LIBRARY_NAME}
              onChange={(e) => set("LIBRARY_NAME", e.target.value)}
              disabled={busy}
              className={inputCls}
              placeholder="PVD Library"
            />
          </Field>

          <Field
            label={t("fieldContactEmailLabel")}
            hint={t("fieldContactEmailHint")}
            icon={<Mail className="w-4 h-4 text-gray-400" />}
          >
            <input
              type="email"
              value={data.LIBRARY_EMAIL}
              onChange={(e) => set("LIBRARY_EMAIL", e.target.value)}
              disabled={busy}
              className={inputCls}
              placeholder="library@example.com"
            />
          </Field>

          <Field
            label={t("fieldContactPhoneLabel")}
            hint={t("fieldContactPhoneHint")}
            icon={<Phone className="w-4 h-4 text-gray-400" />}
          >
            <input
              type="tel"
              value={data.LIBRARY_PHONE}
              onChange={(e) => set("LIBRARY_PHONE", e.target.value)}
              disabled={busy}
              className={inputCls}
              placeholder="+855 23 000 000"
            />
          </Field>
        </div>
      </Section>

      {/* ── Languages ─────────────────────────────────────────────────── */}
      <Section title={t("sectionLanguages")} icon={<Globe className="w-4 h-4 text-indigo-500" />}>
        <p className="text-xs text-gray-400 -mt-2">{t("languagesSectionNote")}</p>

        {/* Per-locale toggle cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {ALL_LOCALES.map((loc) => {
            const isDefault = loc.code === DEFAULT_LOCALE;
            const isOn = enabledLocalesList.includes(loc.code);
            const isOnlyEnabled = enabledLocalesList.length === 1 && isOn;

            return (
              <div
                key={loc.code}
                className={`relative flex items-center justify-between gap-4 rounded-xl border-2 pl-4 pr-5 py-3.5 transition-all
                  ${isOn
                    ? "border-indigo-200 bg-indigo-50/60"
                    : "border-gray-100 bg-gray-50/60 opacity-60"
                  }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-2xl leading-none select-none">{loc.flag}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800 leading-tight">{loc.nativeLabel}</p>
                    <p className="text-xs text-gray-400 leading-tight">{loc.label} · <code className="font-mono">{loc.code}</code></p>
                    {isDefault && (
                      <p className="text-[10px] text-indigo-500 mt-0.5 flex items-center gap-1">
                        <Lock className="w-2.5 h-2.5" /> {t("langDefaultLocked")}
                      </p>
                    )}
                  </div>
                </div>
                {isDefault ? (
                  /* Default locale — always on, cannot be toggled */
                  <div
                    title={t("langDefaultLocked")}
                    className="flex-shrink-0 flex items-center justify-center w-10 h-6 rounded-full bg-indigo-200 cursor-not-allowed"
                  >
                    <Lock className="w-3.5 h-3.5 text-indigo-500" />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => !isOnlyEnabled && toggleLocale(loc.code, !isOn)}
                    disabled={busy || isOnlyEnabled}
                    title={isOnlyEnabled ? t("langMustHaveOne") : undefined}
                    className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200
                      focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
                      disabled:cursor-not-allowed disabled:opacity-60
                      ${isOn ? "bg-indigo-500" : "bg-gray-300"}`}
                    aria-pressed={isOn}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm
                        transition-transform duration-200
                        ${isOn ? "translate-x-5" : "translate-x-0"}`}
                    />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Developer guide for adding languages */}
        <details className="mt-2 group">
          <summary className="flex items-center gap-2 text-xs font-medium text-indigo-600 hover:text-indigo-700 cursor-pointer select-none list-none">
            <Info className="w-3.5 h-3.5 flex-shrink-0" />
            {t("addLangGuideTitle")}
            <span className="ml-auto text-gray-400 group-open:rotate-180 transition-transform text-base leading-none">▾</span>
          </summary>
          <div className="mt-3 rounded-xl bg-gray-900 text-gray-200 p-4 text-xs space-y-3 font-mono leading-relaxed">
            <p className="text-gray-400 font-sans font-medium not-italic">{t("addLangGuideNote")}</p>
            <div>
              <span className="text-emerald-400 font-sans">Step 1 —</span>{" "}
              <span className="text-gray-300 font-sans">{t("addLangGuideStep1")}</span>
              <pre className="mt-1.5 bg-gray-800 rounded-lg p-2 overflow-x-auto text-[11px] leading-5">{`// lib/locales.ts
{
  code:        "fr",
  label:       "French",
  nativeLabel: "Français",
  flag:        "🇫🇷",
  rtl:         false,
}`}</pre>
            </div>
            <div>
              <span className="text-emerald-400 font-sans">Step 2 —</span>{" "}
              <span className="text-gray-300 font-sans">{t("addLangGuideStep2")}</span>
              <pre className="mt-1.5 bg-gray-800 rounded-lg p-2 overflow-x-auto text-[11px] leading-5">{`# copy en.json as a starting point
cp messages/en.json messages/fr.json
# then translate the strings in fr.json`}</pre>
            </div>
            <div>
              <span className="text-emerald-400 font-sans">Step 3 —</span>{" "}
              <span className="text-gray-300 font-sans">{t("addLangGuideStep3")}</span>
            </div>
          </div>
        </details>
      </Section>

      {/* Loading skeleton overlay */}
      {status === "loading" && (
        <div className="fixed inset-0 flex items-center justify-center bg-white/60 z-50">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
        </div>
      )}
    </div>
  );
}

/* ── Small helpers ─────────────────────────────────────────────────────── */

const inputCls =
  "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 " +
  "focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent " +
  "disabled:bg-gray-50 disabled:text-gray-400 transition";

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-5">
      <div className="flex items-center gap-2 pb-1 border-b border-gray-100">
        {icon}
        <h2 className="text-base font-semibold text-gray-800">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  hint,
  icon,
  children,
}: {
  label: string;
  hint:  string;
  icon:  React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
        {icon}
        {label}
      </p>
      {children}
      <p className="text-xs text-gray-400">{hint}</p>
    </div>
  );
}
