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
  Globe,
  Info,
  Lock,
  ImagePlus,
  Trash2,
  Bot,
  UserPlus,
  Send,
  Activity,
  MapPin,
  ExternalLink,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { useLibraryLogo } from "@/context/library-logo";
import { ALL_LOCALES, DEFAULT_LOCALE } from "@/lib/locales";
import { OPAC_THEMES, type OpacThemeKey } from "@/lib/opac-theme";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";

interface SettingsData {
  DEFAULT_LOAN_DAYS:                string;
  FINE_PER_DAY:                     string;
  FINES_ENABLED:                    string;
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
  LIBRARY_ADDRESS:                  string;
  LIBRARY_TELEGRAM:                 string;
  DEFAULT_STAFF_THEME:              string;
  DEFAULT_STAFF_AUTH_STYLE:         string;
  DEFAULT_STAFF_AUTH_METHODS:       string;
  ENABLED_LOCALES:                  string;
  AI_SEARCH_ADMIN:                  string;
  AI_SEARCH_MEMBER:                 string;
  MEMBER_SELF_REGISTER:              string;
  MEMBER_SELF_REGISTER_AUTO_APPROVE: string;
  OPAC_THEME:                        string;
  OPAC_FULL_WIDTH:                   string;
  OPAC_PAGE_BG:                      string;
  OPAC_FONT:                         string;
  OPAC_FONT_EN:                      string;
  OPAC_FONT_KM:                      string;
  OPAC_CUSTOM_FONTS:                 string;
  PUBLIC_PAGINATION_MODE:            string;
  PUBLIC_PAGINATION_LIMIT:           string;
  BOOK_COVER_STYLE:                  string;
  BOOK_COVER_FRAME:                  string;
  // Book Sale
  BOOK_SALE_ENABLED:                 string;
  BOOK_SALE_QR_IMAGE:                string;
  BOOK_SALE_BANK_NAME:               string;
  BOOK_SALE_ACCOUNT_NAME:            string;
  BOOK_SALE_ACCOUNT_NUMBER:          string;
  BOOK_SALE_PAYMENT_INSTRUCTIONS:    string;
  BOOK_SALE_PAYMENT_METHODS:         string;
  BOOK_SALE_SHIPPING_FEE:            string;
  BOOK_SALE_TAX_RATE:                string;
  BOOK_SALE_DELIVERY_ENABLED:        string;
  BOOK_SALE_PICKUP_ENABLED:          string;
  BOOK_SALE_RETURN_WINDOW_DAYS:      string;
  // Public footer
  PUBLIC_FOOTER_ENABLED:             string;
  PUBLIC_FOOTER_SHOW:                string;
  PUBLIC_FOOTER_DESCRIPTION:         string;
  LIBRARY_HOURS:                     string;
  LIBRARY_WHATSAPP:                  string;
  LIBRARY_WEBSITE:                   string;
  STOCK_CURRENCY:                    string;
  STOCK_SECONDARY_CURRENCY:          string;
  STOCK_SECONDARY_RATE:              string;
  // Telegram
  TELEGRAM_NOTIFICATIONS_ENABLED:   string;
  TELEGRAM_ADMIN_CHAT_ID:           string;
  TELEGRAM_MEMBERSHIP_EXPIRY_DAYS:  string;
  TELEGRAM_LINK_MEMBER:             string;
  PHONE_CLICK_ACTION:               string;
  MEMBER_ID_FORMAT:                 string;
  MEMBER_ID_COUNTER:                string;
  TELEMETRY_ENABLED:                string;
  TELEMETRY_ENDPOINT:               string;
  TELEMETRY_KEY:                    string;
  TELEMETRY_KEY_SET:                string;
}

const DEFAULT: SettingsData = {
  DEFAULT_LOAN_DAYS:                "14",
  FINE_PER_DAY:                     "0.50",
  FINES_ENABLED:                    "true",
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
  LIBRARY_ADDRESS:                  "",
  LIBRARY_TELEGRAM:                 "",
  DEFAULT_STAFF_THEME:              "ocean",
  DEFAULT_STAFF_AUTH_STYLE:         "split",
  DEFAULT_STAFF_AUTH_METHODS:       '["password","google","magic"]',
  ENABLED_LOCALES:                  JSON.stringify(ALL_LOCALES.map(l => l.code)),
  AI_SEARCH_ADMIN:                  "true",
  AI_SEARCH_MEMBER:                 "true",
  MEMBER_SELF_REGISTER:              "false",
  MEMBER_SELF_REGISTER_AUTO_APPROVE: "false",
  OPAC_THEME:                        "royal",
  OPAC_FULL_WIDTH:                   "false",
  OPAC_PAGE_BG:                      "light",
  OPAC_FONT:                         "default",
  OPAC_FONT_EN:                      "default",
  OPAC_FONT_KM:                      "default",
  OPAC_CUSTOM_FONTS:                 "[]",
  PUBLIC_PAGINATION_MODE:            "loadmore",
  PUBLIC_PAGINATION_LIMIT:           "30",
  BOOK_COVER_STYLE:                  "spine",
  BOOK_COVER_FRAME:                  "none",
  BOOK_SALE_ENABLED:                 "false",
  BOOK_SALE_QR_IMAGE:                "",
  BOOK_SALE_BANK_NAME:               "",
  BOOK_SALE_ACCOUNT_NAME:            "",
  BOOK_SALE_ACCOUNT_NUMBER:          "",
  BOOK_SALE_PAYMENT_INSTRUCTIONS:    "",
  BOOK_SALE_PAYMENT_METHODS:         "qr",
  BOOK_SALE_SHIPPING_FEE:            "2.00",
  BOOK_SALE_TAX_RATE:                "0",
  BOOK_SALE_DELIVERY_ENABLED:        "true",
  BOOK_SALE_PICKUP_ENABLED:          "true",
  BOOK_SALE_RETURN_WINDOW_DAYS:      "7",
  // Public footer
  PUBLIC_FOOTER_ENABLED:             "false",
  PUBLIC_FOOTER_SHOW:                "phone,email,telegram,address",
  PUBLIC_FOOTER_DESCRIPTION:         "Your gateway to knowledge and discovery. Explore, learn, and grow with us.",
  LIBRARY_HOURS:                     "",
  LIBRARY_WHATSAPP:                  "",
  LIBRARY_WEBSITE:                   "",
  STOCK_CURRENCY:                    "USD",
  STOCK_SECONDARY_CURRENCY:          "",
  STOCK_SECONDARY_RATE:              "4100",
  // Telegram
  TELEGRAM_NOTIFICATIONS_ENABLED:   "true",
  TELEGRAM_ADMIN_CHAT_ID:           "",
  TELEGRAM_MEMBERSHIP_EXPIRY_DAYS:  "7",
  TELEGRAM_LINK_MEMBER:             "true",
  PHONE_CLICK_ACTION:               "both",
  MEMBER_ID_FORMAT:                 "MEM-{YYYY}-{RAND4}",
  MEMBER_ID_COUNTER:                "0",
  TELEMETRY_ENABLED:                "false",
  TELEMETRY_ENDPOINT:               "",
  TELEMETRY_KEY:                    "",
  TELEMETRY_KEY_SET:                "false",
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
  {
    id:      "academic",
    nameKey: "themeAcademicName",
    descKey: "themeAcademicDesc",
    sidebar: "#0f766e",
    pageBg:  "#f0fdfa",
    header:  "#ffffff",
    border:  "#99f6e4",
    accent:  "#0f766e",
  },
  {
    id:      "parchment",
    nameKey: "themeParchmentName",
    descKey: "themeParchmentDesc",
    sidebar: "#5c3d2e",
    pageBg:  "#fffbf0",
    header:  "#fffbf5",
    border:  "#e8dcc8",
    accent:  "#b45309",
  },
  {
    id:      "slate",
    nameKey: "themeSlateColorName",
    descKey: "themeSlateColorDesc",
    sidebar: "#1e293b",
    pageBg:  "#f8fafc",
    header:  "#ffffff",
    border:  "#e2e8f0",
    accent:  "#0284c7",
  },
  {
    id:      "terminal",
    nameKey: "themeTerminalName",
    descKey: "themeTerminalDesc",
    sidebar: "#0a1a0a",
    pageBg:  "#0a0a0a",
    header:  "#0d110d",
    border:  "#1a2e1a",
    accent:  "#22c55e",
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
  const locale = useLocale();
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

  /* ── Telemetry check-in state ── */
  const [telemetryTesting, setTelemetryTesting] = useState(false);
  const [telemetryResult, setTelemetryResult]   = useState<{ ok: boolean; message: string } | null>(null);

  async function testTelemetry() {
    setTelemetryTesting(true);
    setTelemetryResult(null);
    try {
      const res = await fetch("/api/admin/telemetry/test", { method: "POST" });
      const json = await res.json();
      setTelemetryResult(res.ok ? json : { ok: false, message: json.error ?? "Check-in failed" });
    } catch (err) {
      setTelemetryResult({ ok: false, message: (err as Error).message ?? "Check-in failed" });
    } finally {
      setTelemetryTesting(false);
    }
  }

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

      {/* ── Public Catalog Theme ──────────────────────────────────────── */}
      <Section title={t("sectionCatalog")} icon={<Palette className="w-4 h-4 text-pink-500" />}>
        <p className="text-xs text-gray-400 -mt-2">{t("catalogSectionNote")}</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {(Object.entries(OPAC_THEMES) as [OpacThemeKey, typeof OPAC_THEMES[OpacThemeKey]][]).map(([key, thm]) => {
            const labels: Record<OpacThemeKey, { name: string; desc: string }> = {
              royal:  { name: "Royal Blue", desc: "Deep navy & indigo — the classic look" },
              forest: { name: "Forest",     desc: "Deep green & teal — calm and natural" },
              sunset: { name: "Sunset",     desc: "Rose & violet — warm and inviting"    },
            };
            const active = data.OPAC_THEME === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => set("OPAC_THEME", key)}
                disabled={busy}
                className={`relative rounded-xl border-2 p-4 text-left transition-all focus:outline-none hover:shadow-md disabled:opacity-60
                  ${active ? "border-indigo-500 shadow-md ring-2 ring-indigo-100" : "border-gray-100 hover:border-gray-200"}`}
              >
                {/* Mini page preview */}
                <div className="h-16 rounded-lg overflow-hidden mb-3 flex flex-col gap-px">
                  <div className={`h-5 flex-shrink-0 ${thm.previewNav} flex items-center px-2 gap-1`}>
                    <div className="w-2 h-2 rounded bg-white/30" />
                    <div className="w-8 h-1.5 rounded bg-white/20" />
                  </div>
                  <div className={`flex-1 ${thm.previewHero} flex items-center px-2`}>
                    <div className="space-y-1">
                      <div className="w-16 h-1.5 rounded bg-white/40" />
                      <div className="w-10 h-1 rounded bg-white/25" />
                    </div>
                  </div>
                  <div className="h-5 flex-shrink-0 bg-gray-100 flex items-center px-2 gap-1">
                    <div className="w-4 h-1.5 rounded bg-gray-300" />
                    <div className="w-4 h-1.5 rounded bg-gray-300" />
                    <div className="w-4 h-1.5 rounded" style={{ background: thm.accentHex }} />
                  </div>
                </div>
                <p className="font-semibold text-gray-800 text-sm">{labels[key].name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{labels[key].desc}</p>
                {active && (
                  <span
                    className="absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px]"
                    style={{ background: thm.accentHex }}
                  >✓</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Full-width layout toggle */}
        <div className="pt-2 border-t border-gray-100">
          <Field
            label={t("fullWidthLabel")}
            hint={t("fullWidthHint")}
            icon={<Monitor className="w-4 h-4 text-gray-400" />}
          >
            <div className="flex gap-3 mt-1">
              {([["false", t("fullWidthCentred"), "30"], ["true", t("fullWidthFull"), "36"]] as const).map(([val, label, defaultLimit]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => {
                    set("OPAC_FULL_WIDTH", val);
                    // Auto-set Items Per Page only when the value still matches
                    // the other layout's default — preserves manual edits.
                    const otherDefault = val === "true" ? "30" : "36";
                    if (data.PUBLIC_PAGINATION_LIMIT === otherDefault || data.OPAC_FULL_WIDTH !== val) {
                      set("PUBLIC_PAGINATION_LIMIT", defaultLimit);
                    }
                  }}
                  disabled={busy}
                  className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-medium transition-all
                    ${data.OPAC_FULL_WIDTH === val
                      ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </Field>

          <Field
            label={t("pageBgLabel")}
            hint={t("pageBgHint")}
            icon={<Monitor className="w-4 h-4 text-gray-400" />}
          >
            <div className="flex gap-3 mt-1">
              {([
                { val: "light", label: t("pageBgLight"), preview: "bg-gray-200",  ring: "ring-gray-300" },
                { val: "white", label: t("pageBgWhite"), preview: "bg-white",     ring: "ring-gray-300" },
                { val: "dark",  label: t("pageBgDark"),  preview: "bg-slate-950", ring: "ring-slate-700" },
              ] as const).map(({ val, label, preview, ring }) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => set("OPAC_PAGE_BG", val)}
                  disabled={busy}
                  className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-medium transition-all flex flex-col items-center gap-1.5
                    ${data.OPAC_PAGE_BG === val
                      ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"}`}
                >
                  <span className={`w-8 h-5 rounded ${preview} ring-1 ${ring} inline-block`} />
                  {label}
                </button>
              ))}
            </div>
          </Field>

          {/* Per-language font pickers */}
          <div className="col-span-full space-y-4">
            <p className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
              <Monitor className="w-4 h-4 text-gray-400" />
              {t("fontsPerLanguage")}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FontPickerField
                label="English / Latin font"
                sampleText="Aa Bb Cc"
                currentFont={data.OPAC_FONT_EN}
                customFontsJson={data.OPAC_CUSTOM_FONTS}
                busy={busy}
                inputCls={inputCls}
                onFontChange={(v) => set("OPAC_FONT_EN", v)}
                onCustomFontsChange={(v) => set("OPAC_CUSTOM_FONTS", v)}
                latinOnly
              />
              <FontPickerField
                label="Khmer font"
                sampleText="អក្សរ"
                currentFont={data.OPAC_FONT_KM}
                customFontsJson={data.OPAC_CUSTOM_FONTS}
                busy={busy}
                inputCls={inputCls}
                onFontChange={(v) => set("OPAC_FONT_KM", v)}
                onCustomFontsChange={(v) => set("OPAC_CUSTOM_FONTS", v)}
                khmerOnly
              />
            </div>
          </div>
        </div>

        {/* Book Cover Style */}
        <div className="pt-2 border-t border-gray-100 space-y-3">
          <p className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
            <BookOpen className="w-4 h-4 text-gray-400" />
            {t("coverStyleLabel")}
          </p>
          <p className="text-xs text-gray-400 -mt-1">{t("coverStyleHint")}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {([
              {
                id: "spine", name: t("coverStyleSpineName"),
                desc: t("coverStyleSpineDesc"),
                preview: (
                  <div className="relative w-full h-full">
                    <div className="absolute inset-0" style={{ background: "linear-gradient(135deg,#3b4a6b,#1e3a5f)" }} />
                    <div className="absolute left-0 top-0 bottom-0 w-1.5" style={{ background: "linear-gradient(to right,rgba(0,0,0,.4),transparent)" }} />
                    <div className="absolute right-0 top-0 bottom-0 w-1" style={{ background: "repeating-linear-gradient(to bottom,#e8dcc8 0,#e8dcc8 1px,#f5ead5 1px,#f5ead5 3px)", opacity: .7 }} />
                  </div>
                ),
              },
              {
                id: "vignette", name: t("coverStyleVignetteName"),
                desc: t("coverStyleVignetteDesc"),
                preview: (
                  <div className="relative w-full h-full">
                    <div className="absolute inset-0" style={{ background: "linear-gradient(160deg,#d97706,#b45309)" }} />
                    <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 50%,transparent 25%,rgba(0,0,0,.7) 100%)" }} />
                  </div>
                ),
              },
              {
                id: "tilt", name: t("coverStyleTiltName"),
                desc: t("coverStyleTiltDesc"),
                preview: (
                  <div className="w-full h-full flex items-center justify-center" style={{ perspective: "200px" }}>
                    <div className="w-[75%] h-[88%] rounded-sm overflow-hidden"
                      style={{ transform: "rotateY(-14deg) rotateX(2deg)", background: "linear-gradient(135deg,#7c3aed,#4c1d95)", position: "relative", boxShadow: "-4px 6px 12px rgba(0,0,0,.4)" }}>
                      <div className="absolute inset-0" style={{ background: "linear-gradient(110deg,rgba(255,255,255,.22) 0%,transparent 46%)" }} />
                    </div>
                  </div>
                ),
              },
              {
                id: "hardcover", name: t("coverStyleHardcoverName"),
                desc: t("coverStyleHardcoverDesc"),
                preview: (
                  <div className="relative w-full h-full overflow-hidden" style={{ background: "linear-gradient(160deg,#064e3b,#022c22)" }}>
                    <div className="absolute left-0 top-0 bottom-0 w-2" style={{ background: "rgba(0,0,0,.28)", zIndex: 2 }} />
                    <div className="absolute inset-0" style={{ background: "repeating-linear-gradient(155deg,rgba(255,255,255,.04) 0,rgba(255,255,255,.04) 1px,transparent 1px,transparent 7px)" }} />
                    <div className="absolute top-0 right-0 w-3 h-3" style={{ background: "linear-gradient(135deg,rgba(255,255,255,.22) 50%,transparent 50%)" }} />
                    <div className="absolute inset-0 flex flex-col p-1.5" style={{ paddingLeft: 10, zIndex: 3 }}>
                      <div className="text-[5px] font-bold leading-tight" style={{ color: "rgba(255,255,255,.85)" }}>Hardcover</div>
                      <div className="text-[4px] mt-0.5" style={{ color: "rgba(255,255,255,.4)" }}>Classic binding</div>
                    </div>
                  </div>
                ),
              },
            ] as const).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => set("BOOK_COVER_STYLE", opt.id)}
                disabled={busy}
                className={`relative rounded-xl border-2 p-3 text-left transition-all focus:outline-none hover:shadow-md disabled:opacity-60
                  ${data.BOOK_COVER_STYLE === opt.id
                    ? "border-indigo-500 shadow-md ring-2 ring-indigo-100"
                    : "border-gray-100 hover:border-gray-200"}`}
              >
                <div className="h-16 rounded-lg overflow-hidden mb-2.5 bg-gray-100">
                  {opt.preview}
                </div>
                <p className="font-semibold text-gray-800 text-xs">{opt.name}</p>
                <p className="text-[10px] text-gray-400 mt-0.5 leading-snug">{opt.desc}</p>
                {data.BOOK_COVER_STYLE === opt.id && (
                  <span className="absolute top-2.5 right-2.5 w-4 h-4 rounded-full bg-indigo-500 flex items-center justify-center text-white text-[9px]">✓</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Cover Frame ──────────────────────────────────────────── */}
        <div className="pt-4 border-t border-gray-100">
          <p className="text-sm font-semibold text-gray-700 mb-1">{t("coverFrameLabel")}</p>
          <p className="text-xs text-gray-400 mb-3">{t("coverFrameHint")}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {([
              { id: "none",    name: t("coverFrameNoneName"),    desc: t("coverFrameNoneDesc"),
                preview: (
                  <div className="w-full h-full flex items-center justify-center bg-gray-100">
                    <div className="w-8 h-12 rounded bg-gradient-to-b from-indigo-400 to-indigo-700" />
                  </div>
                ),
              },
              { id: "accent",  name: t("coverFrameAccentName"),  desc: t("coverFrameAccentDesc"),
                preview: (
                  <div className="w-full h-full flex items-center justify-center bg-gray-100">
                    <div className="w-8 h-12 rounded bg-gradient-to-b from-indigo-400 to-indigo-700"
                      style={{ boxShadow: "0 0 0 2.5px #6366f1" }} />
                  </div>
                ),
              },
              { id: "glow",    name: t("coverFrameGlowName"),    desc: t("coverFrameGlowDesc"),
                preview: (
                  <div className="w-full h-full flex items-center justify-center bg-gray-100">
                    <div className="w-8 h-12 rounded bg-gradient-to-b from-indigo-400 to-indigo-700"
                      style={{ boxShadow: "0 0 0 2px #6366f1, 0 0 14px 4px rgba(99,102,241,0.45)" }} />
                  </div>
                ),
              },
              { id: "classic", name: t("coverFrameClassicName"), desc: t("coverFrameClassicDesc"),
                preview: (
                  <div className="w-full h-full flex items-center justify-center bg-gray-100">
                    <div className="w-8 h-12 rounded bg-gradient-to-b from-indigo-400 to-indigo-700"
                      style={{ boxShadow: "0 0 0 1.5px rgba(255,255,255,0.9), 0 0 0 4px #6366f1, 0 0 0 5.5px rgba(255,255,255,0.4)" }} />
                  </div>
                ),
              },
              { id: "shadow",  name: t("coverFrameShadowName"),  desc: t("coverFrameShadowDesc"),
                preview: (
                  <div className="w-full h-full flex items-center justify-center bg-gray-100">
                    <div className="w-8 h-12 rounded bg-gradient-to-b from-indigo-400 to-indigo-700"
                      style={{ boxShadow: "5px 8px 20px rgba(0,0,0,0.45), 2px 3px 6px rgba(0,0,0,0.2)" }} />
                  </div>
                ),
              },
            ] as const).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => set("BOOK_COVER_FRAME", opt.id)}
                disabled={busy}
                className={`relative rounded-xl border-2 p-3 text-left transition-all focus:outline-none hover:shadow-md disabled:opacity-60
                  ${data.BOOK_COVER_FRAME === opt.id
                    ? "border-indigo-500 shadow-md ring-2 ring-indigo-100"
                    : "border-gray-100 hover:border-gray-200"}`}
              >
                <div className="h-16 rounded-lg overflow-hidden mb-2.5 bg-gray-100">
                  {opt.preview}
                </div>
                <p className="font-semibold text-gray-800 text-xs">{opt.name}</p>
                <p className="text-[10px] text-gray-400 mt-0.5 leading-snug">{opt.desc}</p>
                {data.BOOK_COVER_FRAME === opt.id && (
                  <span className="absolute top-2.5 right-2.5 w-4 h-4 rounded-full bg-indigo-500 flex items-center justify-center text-white text-[9px]">✓</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Pagination mode */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2 border-t border-gray-100">
          <Field
            label={t("paginationStyleLabel")}
            hint={t("paginationStyleHint")}
            icon={<Monitor className="w-4 h-4 text-gray-400" />}
          >
            <div className="flex gap-3 mt-1">
              {([["loadmore", t("paginationLoadMore")], ["numbers", t("paginationNumbers")]] as const).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => set("PUBLIC_PAGINATION_MODE", val)}
                  disabled={busy}
                  className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-medium transition-all
                    ${data.PUBLIC_PAGINATION_MODE === val
                      ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </Field>

          <Field
            label={t("itemsPerPageLabel")}
            hint={t("itemsPerPageHint")}
            icon={<BookOpen className="w-4 h-4 text-gray-400" />}
          >
            <input
              type="number"
              min={5}
              max={100}
              value={data.PUBLIC_PAGINATION_LIMIT}
              onChange={(e) => set("PUBLIC_PAGINATION_LIMIT", e.target.value)}
              disabled={busy}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-60"
            />
          </Field>
        </div>
      </Section>

      {/* ── Loan & Fine Policy ─────────────────────────────────────────── */}
      <Section title={t("sectionLoanPolicy")} icon={<BookOpen className="w-4 h-4 text-indigo-500" />}>
        {/* Relationship notice with Circulation Rules */}
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
          <Info className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800 min-w-0">
            {t("loanPolicyNote")}
          </div>
        </div>
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
            label="Fines Enabled"
            hint="Enable or disable fines feature in the system"
            icon={data.FINES_ENABLED === "true" ? <ToggleRight className="w-4 h-4 text-green-500" /> : <ToggleLeft className="w-4 h-4 text-gray-400" />}
          >
            <div className="flex items-center gap-4">
              <button
                onClick={() => set("FINES_ENABLED", data.FINES_ENABLED === "true" ? "false" : "true")}
                disabled={busy}
                className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                  data.FINES_ENABLED === "true" ? "bg-green-500" : "bg-gray-300"
                } ${busy ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
              >
                <span
                  className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                    data.FINES_ENABLED === "true" ? "translate-x-7" : "translate-x-1"
                  }`}
                />
              </button>
              <span className="text-sm text-gray-600">{data.FINES_ENABLED === "true" ? "Enabled" : "Disabled"}</span>
            </div>
          </Field>

          {data.FINES_ENABLED === "true" && (
            <Field
              label="Reset Active Fines"
              hint="Recalculate all unpaid fines with the current fine per day rate"
              icon={<RefreshCw className="w-4 h-4 text-blue-500" />}
            >
              <button
                onClick={async () => {
                  if (!confirm("This will recalculate all unpaid fines with the new rate. Continue?")) return;
                  try {
                    const res = await fetch("/api/admin/fines/reset", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ finePerDay: parseFloat(data.FINE_PER_DAY) }),
                    });
                    const result = await res.json();
                    if (result.success) {
                      alert(`✓ ${result.message}`);
                    } else {
                      alert(`✗ Error: ${result.error}`);
                    }
                  } catch (err) {
                    alert(`✗ Failed to reset fines: ${err}`);
                  }
                }}
                disabled={busy || !data.FINE_PER_DAY}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm transition-colors"
              >
                <RefreshCw className="w-4 h-4 inline mr-2" />
                Reset Fines Now
              </button>
            </Field>
          )}

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

      {/* ── AI Book Search ─────────────────────────────────────────────── */}
      <Section title={t("sectionAI")} icon={<Bot className="w-4 h-4 text-violet-500" />}>
        <p className="text-xs text-gray-400 -mt-2 mb-4">{t("aiSectionNote")}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <Field
            label={t("fieldAIAdminLabel")}
            hint={t("fieldAIAdminHint")}
            icon={<Bot className="w-4 h-4 text-gray-400" />}
          >
            <select
              value={data.AI_SEARCH_ADMIN}
              onChange={(e) => set("AI_SEARCH_ADMIN", e.target.value)}
              disabled={busy}
              className={inputCls}
            >
              <option value="true">{t("enabled")}</option>
              <option value="false">{t("disabled")}</option>
            </select>
          </Field>

          <Field
            label={t("fieldAIMemberLabel")}
            hint={t("fieldAIMemberHint")}
            icon={<Bot className="w-4 h-4 text-gray-400" />}
          >
            <select
              value={data.AI_SEARCH_MEMBER}
              onChange={(e) => set("AI_SEARCH_MEMBER", e.target.value)}
              disabled={busy}
              className={inputCls}
            >
              <option value="true">{t("enabled")}</option>
              <option value="false">{t("disabled")}</option>
            </select>
          </Field>
        </div>
      </Section>

      {/* ── Telegram Notifications ───────────────────────────────────── */}
      <Section title={t("sectionTelegram")} icon={<Send className="w-4 h-4 text-sky-500" />}>
        <p className="text-xs text-gray-400 -mt-2 mb-4">{t("telegramSectionNote")}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <Field
            label={t("telegramEnabledLabel")}
            hint={t("telegramEnabledHint")}
            icon={<Send className="w-4 h-4 text-gray-400" />}
          >
            <select value={data.TELEGRAM_NOTIFICATIONS_ENABLED} onChange={(e) => set("TELEGRAM_NOTIFICATIONS_ENABLED", e.target.value)} disabled={busy} className={inputCls}>
              <option value="true">{t("enabled")}</option>
              <option value="false">{t("disabled")}</option>
            </select>
          </Field>

          <Field
            label={t("telegramAdminChatLabel")}
            hint={t("telegramAdminChatHint")}
            icon={<Bot className="w-4 h-4 text-gray-400" />}
          >
            <input
              type="text"
              value={data.TELEGRAM_ADMIN_CHAT_ID}
              onChange={(e) => set("TELEGRAM_ADMIN_CHAT_ID", e.target.value)}
              disabled={busy || data.TELEGRAM_NOTIFICATIONS_ENABLED !== "true"}
              placeholder="e.g. 123456789 or -100123456789"
              className={inputCls}
            />
          </Field>

          <Field
            label={t("telegramExpiryLabel")}
            hint={t("telegramExpiryHint")}
            icon={<Clock className="w-4 h-4 text-gray-400" />}
          >
            <input
              type="number" min={1} max={30}
              value={data.TELEGRAM_MEMBERSHIP_EXPIRY_DAYS}
              onChange={(e) => set("TELEGRAM_MEMBERSHIP_EXPIRY_DAYS", e.target.value)}
              disabled={busy || data.TELEGRAM_NOTIFICATIONS_ENABLED !== "true"}
              className={inputCls}
            />
          </Field>

          <Field
            label={t("telegramLinkMemberLabel")}
            hint={t("telegramLinkMemberHint")}
            icon={<Send className="w-4 h-4 text-gray-400" />}
          >
            <select value={data.TELEGRAM_LINK_MEMBER} onChange={(e) => set("TELEGRAM_LINK_MEMBER", e.target.value)} disabled={busy} className={inputCls}>
              <option value="true">{t("telegramLinkAllowed")}</option>
              <option value="false">{t("telegramLinkDisabled")}</option>
            </select>
          </Field>

          <Field
            label={t("phoneClickLabel")}
            hint={t("phoneClickHint")}
            icon={<Activity className="w-4 h-4 text-gray-400" />}
          >
            <select value={data.PHONE_CLICK_ACTION} onChange={(e) => set("PHONE_CLICK_ACTION", e.target.value)} disabled={busy} className={inputCls}>
              <option value="both">{t("phoneClickBoth")}</option>
              <option value="dial">{t("phoneClickDial")}</option>
              <option value="telegram">{t("phoneClickTelegram")}</option>
              <option value="disabled">{t("phoneClickDisabled")}</option>
            </select>
          </Field>
        </div>

        {/* Register Webhook button */}
        <WebhookRegister />

        <div className="rounded-lg bg-sky-50 border border-sky-100 p-3 text-xs text-sky-700 space-y-1">
          <p className="font-semibold">{t("telegramSetupTitle")}</p>
          <p>• Create a bot via <strong>@BotFather</strong> on Telegram and copy the bot token</p>
          <p>• Add <code className="bg-sky-100 px-1 rounded">TELEGRAM_BOT_TOKEN</code> and <code className="bg-sky-100 px-1 rounded">TELEGRAM_BOT_USERNAME</code> to your <code className="bg-sky-100 px-1 rounded">.env</code> file</p>
          <p>• Click <strong>Register Webhook</strong> above — this tells Telegram where to send messages</p>
          <p>• <strong>Admin alerts:</strong> message the bot to get your personal chat ID (forward any message to <strong>@userinfobot</strong>), then paste it in <em>Admin / Staff Alert Chat ID</em> above</p>
          <p>• <strong>Member notifications:</strong> members link their account by messaging the bot <code className="bg-sky-100 px-1 rounded">/start</code></p>
          <p>• Loan/membership reminders are sent automatically by the cron job or via the Notifications page</p>
        </div>
      </Section>

      {/* ── Member Self-Registration ──────────────────────────────────── */}
      <Section title={t("sectionSelfReg")} icon={<UserPlus className="w-4 h-4 text-emerald-500" />}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <Field
            label={t("selfRegLabel")}
            hint={t("selfRegHint")}
            icon={<UserPlus className="w-4 h-4 text-gray-400" />}
          >
            <select
              value={data.MEMBER_SELF_REGISTER}
              onChange={(e) => set("MEMBER_SELF_REGISTER", e.target.value)}
              disabled={busy}
              className={inputCls}
            >
              <option value="true">{t("selfRegOpen")}</option>
              <option value="false">{t("selfRegClosed")}</option>
            </select>
          </Field>

          <Field
            label={t("selfRegAutoApproveLabel")}
            hint={t("selfRegAutoApproveHint")}
            icon={<Users className="w-4 h-4 text-gray-400" />}
          >
            <select
              value={data.MEMBER_SELF_REGISTER_AUTO_APPROVE}
              onChange={(e) => set("MEMBER_SELF_REGISTER_AUTO_APPROVE", e.target.value)}
              disabled={busy || data.MEMBER_SELF_REGISTER !== "true"}
              className={inputCls}
            >
              <option value="false">{t("selfRegPending")}</option>
              <option value="true">{t("selfRegAutoApprove")}</option>
            </select>
          </Field>
        </div>

        {data.MEMBER_SELF_REGISTER === "true" && data.MEMBER_SELF_REGISTER_AUTO_APPROVE === "false" && (
          <div className="rounded-lg bg-amber-50 border border-amber-100 p-3 text-xs text-amber-700">
            {t("selfRegPendingNote")}
          </div>
        )}

        {data.MEMBER_SELF_REGISTER === "false" && (
          <div className="rounded-lg bg-gray-50 border border-gray-100 p-3 text-xs text-gray-500">
            {t("selfRegClosedNote")}
          </div>
        )}
      </Section>

      {/* ── Member ID Format ──────────────────────────────────────────────── */}
      <Section title={t("sectionMemberId")} icon={<Users className="w-4 h-4 text-indigo-500" />}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <Field
            label={t("memberIdFormatLabel")}
            hint={t("memberIdFormatHint")}
            icon={<Users className="w-4 h-4 text-gray-400" />}
          >
            <input
              type="text"
              value={data.MEMBER_ID_FORMAT}
              onChange={(e) => set("MEMBER_ID_FORMAT", e.target.value)}
              disabled={busy}
              placeholder="MEM-{YYYY}-{RAND4}"
              className={inputCls}
            />
          </Field>

          <Field
            label={t("memberIdCounterLabel")}
            hint={t("memberIdCounterHint")}
            icon={<Users className="w-4 h-4 text-gray-400" />}
          >
            <input
              type="number"
              min={0}
              value={data.MEMBER_ID_COUNTER}
              onChange={(e) => set("MEMBER_ID_COUNTER", e.target.value)}
              disabled={busy}
              className={inputCls}
            />
          </Field>
        </div>

        {/* Live preview */}
        {(() => {
          const fmt = data.MEMBER_ID_FORMAT || "MEM-{YYYY}-{RAND4}";
          const seq = parseInt(data.MEMBER_ID_COUNTER || "0", 10) + 1;
          const now = new Date();
          const yyyy = String(now.getFullYear());
          const preview = fmt
            .replace(/{YYYY}/g, yyyy)
            .replace(/{YY}/g,   yyyy.slice(-2))
            .replace(/{MM}/g,   String(now.getMonth() + 1).padStart(2, "0"))
            .replace(/{SEQ6}/g, String(seq).padStart(6, "0"))
            .replace(/{SEQ5}/g, String(seq).padStart(5, "0"))
            .replace(/{SEQ4}/g, String(seq).padStart(4, "0"))
            .replace(/{RAND6}/g, "382910")
            .replace(/{RAND4}/g, "4821");
          return (
            <div className="rounded-lg bg-indigo-50 border border-indigo-100 p-3 text-xs text-indigo-700 flex items-center gap-2">
              <span className="font-medium">{t("memberIdPreview")}</span>
              <code className="font-mono bg-white px-2 py-0.5 rounded border border-indigo-200">{preview}</code>
              <span className="text-indigo-400">{t("memberIdRandomNote")}</span>
            </div>
          );
        })()}

        <div className="rounded-lg bg-gray-50 border border-gray-100 p-3 text-xs text-gray-500 space-y-1">
          <p className="font-semibold text-gray-700 mb-1">{t("memberIdTokensTitle")}</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-0.5">
            <p><code className="bg-white border border-gray-200 px-1 rounded">{"{"+"YYYY}"}</code> — 4-digit year (e.g. 2026)</p>
            <p><code className="bg-white border border-gray-200 px-1 rounded">{"{"+"YY}"}</code> — 2-digit year (e.g. 26)</p>
            <p><code className="bg-white border border-gray-200 px-1 rounded">{"{"+"MM}"}</code> — 2-digit month (e.g. 06)</p>
            <p><code className="bg-white border border-gray-200 px-1 rounded">{"{"+"SEQ4}"}</code> — 4-digit auto sequence (0001, 0002…)</p>
            <p><code className="bg-white border border-gray-200 px-1 rounded">{"{"+"SEQ5}"}</code> — 5-digit auto sequence (00001, 00002…)</p>
            <p><code className="bg-white border border-gray-200 px-1 rounded">{"{"+"SEQ6}"}</code> — 6-digit auto sequence (000001…)</p>
            <p><code className="bg-white border border-gray-200 px-1 rounded">{"{"+"RAND4}"}</code> — 4-digit random number</p>
            <p><code className="bg-white border border-gray-200 px-1 rounded">{"{"+"RAND6}"}</code> — 6-digit random number</p>
          </div>
          <p className="mt-1 text-gray-400">Examples: <code>LIB-{"{YYYY}"}-{"{SEQ5}"}</code> → LIB-2026-00001 &nbsp;·&nbsp; <code>STU-{"{YY}"}{"{MM}"}-{"{RAND4}"}</code> → STU-2606-4821</p>
        </div>
      </Section>

      {/* ── Book Sale / Shop ──────────────────────────────────────────── */}
      <Section title={t("sectionSale")} icon={<DollarSign className="w-4 h-4 text-violet-500" />}>
        <p className="text-xs text-gray-400 -mt-2 mb-4">{t("saleSectionNote")}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <Field label={t("saleEnabledLabel")} hint={t("saleEnabledHint")} icon={<DollarSign className="w-4 h-4 text-gray-400" />}>
            <select value={data.BOOK_SALE_ENABLED} onChange={(e) => set("BOOK_SALE_ENABLED", e.target.value)} disabled={busy} className={inputCls}>
              <option value="true">{t("saleOn")}</option>
              <option value="false">{t("saleOff")}</option>
            </select>
          </Field>

          <Field label={t("saleCurrencyLabel")} hint={t("saleCurrencyHint")} icon={<DollarSign className="w-4 h-4 text-gray-400" />}>
            <input value={data.STOCK_CURRENCY} onChange={(e) => set("STOCK_CURRENCY", e.target.value)} placeholder="USD" disabled={busy} className={inputCls} />
          </Field>

          <Field label={t("saleSecCurLabel")} hint={t("saleSecCurHint")} icon={<DollarSign className="w-4 h-4 text-gray-400" />}>
            <input value={data.STOCK_SECONDARY_CURRENCY} onChange={(e) => set("STOCK_SECONDARY_CURRENCY", e.target.value)} placeholder="KHR" disabled={busy} className={inputCls} />
          </Field>

          {data.STOCK_SECONDARY_CURRENCY && (
            <Field label={t("saleRateLabel")} hint={`1 ${data.STOCK_CURRENCY} = X ${data.STOCK_SECONDARY_CURRENCY}`} icon={<DollarSign className="w-4 h-4 text-gray-400" />}>
              <input type="number" value={data.STOCK_SECONDARY_RATE} onChange={(e) => set("STOCK_SECONDARY_RATE", e.target.value)} disabled={busy} className={inputCls} />
            </Field>
          )}

          {/* ── Payment QR Image ── */}
          <div className="space-y-3 rounded-xl border border-amber-100 bg-amber-50/40 p-4">
            <p className="text-sm font-semibold text-gray-800 flex items-center gap-2">
              <ImagePlus className="w-4 h-4 text-amber-600" /> {t("saleQrSectionLabel")}
            </p>
            <p className="text-xs text-gray-500">{t("saleQrHint")}</p>

            {/* Preview + upload */}
            <div className="flex items-start gap-4">
              {data.BOOK_SALE_QR_IMAGE ? (
                <div className="relative flex-shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={data.BOOK_SALE_QR_IMAGE} alt="Payment QR" className="w-28 h-28 rounded-xl border border-amber-200 object-contain bg-white shadow-sm" />
                  <button
                    type="button"
                    onClick={() => set("BOOK_SALE_QR_IMAGE", "")}
                    className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 shadow"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="w-28 h-28 rounded-xl border-2 border-dashed border-amber-200 flex flex-col items-center justify-center bg-white text-amber-400 flex-shrink-0">
                  <ImagePlus className="w-6 h-6 mb-1" />
                  <span className="text-[10px]">{t("saleNoQr")}</span>
                </div>
              )}
              <div className="flex-1 space-y-2">
                <label className="flex items-center gap-2 px-3 py-2 bg-white border border-amber-200 rounded-lg text-sm font-medium text-amber-700 hover:bg-amber-50 cursor-pointer transition-colors w-fit">
                  <ImagePlus className="w-4 h-4" />
                  {data.BOOK_SALE_QR_IMAGE ? t("saleReplaceQr") : t("saleUploadQr")}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={busy}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const fd = new FormData();
                      fd.append("file", file);
                      fd.append("folder", "settings");
                      const res = await fetch("/api/upload", { method: "POST", body: fd });
                      const json = await res.json();
                      if (json.url) set("BOOK_SALE_QR_IMAGE", json.url);
                    }}
                  />
                </label>
                <p className="text-xs text-gray-400">{t("salePasteUrl")}</p>
                <input value={data.BOOK_SALE_QR_IMAGE} onChange={(e) => set("BOOK_SALE_QR_IMAGE", e.target.value)} placeholder="https://…/qr.png" disabled={busy} className={inputCls} />
              </div>
            </div>
          </div>

          <Field label={t("saleBankNameLabel")} hint={t("saleBankNameHint")} icon={<DollarSign className="w-4 h-4 text-gray-400" />}>
            <input value={data.BOOK_SALE_BANK_NAME} onChange={(e) => set("BOOK_SALE_BANK_NAME", e.target.value)} placeholder="ABA Bank" disabled={busy} className={inputCls} />
          </Field>

          <Field label={t("saleAccountNameLabel")} hint={t("saleAccountNameHint")} icon={<DollarSign className="w-4 h-4 text-gray-400" />}>
            <input value={data.BOOK_SALE_ACCOUNT_NAME} onChange={(e) => set("BOOK_SALE_ACCOUNT_NAME", e.target.value)} placeholder="PVD Library" disabled={busy} className={inputCls} />
          </Field>

          <Field label={t("saleAccountNumberLabel")} hint={t("saleAccountNumberHint")} icon={<DollarSign className="w-4 h-4 text-gray-400" />}>
            <input value={data.BOOK_SALE_ACCOUNT_NUMBER} onChange={(e) => set("BOOK_SALE_ACCOUNT_NUMBER", e.target.value)} placeholder="012 345 678" disabled={busy} className={inputCls} />
          </Field>

          <Field label={t("saleInstructionsLabel")} hint={t("saleInstructionsHint")} icon={<DollarSign className="w-4 h-4 text-gray-400" />}>
            <textarea value={data.BOOK_SALE_PAYMENT_INSTRUCTIONS} onChange={(e) => set("BOOK_SALE_PAYMENT_INSTRUCTIONS", e.target.value)} placeholder="Scan, pay, then upload your payment screenshot on the order page." disabled={busy} rows={2} className={`${inputCls} resize-none`} />
          </Field>

          <Field label={t("saleMethodsLabel")} hint={t("saleMethodsHint")} icon={<DollarSign className="w-4 h-4 text-gray-400" />}>
            <input value={data.BOOK_SALE_PAYMENT_METHODS} onChange={(e) => set("BOOK_SALE_PAYMENT_METHODS", e.target.value)} placeholder="qr,cash_on_pickup" disabled={busy} className={inputCls} />
          </Field>

          <Field label={t("saleDeliveryLabel")} hint={t("saleDeliveryHint")} icon={<DollarSign className="w-4 h-4 text-gray-400" />}>
            <select value={data.BOOK_SALE_DELIVERY_ENABLED} onChange={(e) => set("BOOK_SALE_DELIVERY_ENABLED", e.target.value)} disabled={busy} className={inputCls}>
              <option value="true">{t("saleOn")}</option>
              <option value="false">{t("saleOff")}</option>
            </select>
          </Field>

          <Field label={t("salePickupLabel")} hint={t("salePickupHint")} icon={<DollarSign className="w-4 h-4 text-gray-400" />}>
            <select value={data.BOOK_SALE_PICKUP_ENABLED} onChange={(e) => set("BOOK_SALE_PICKUP_ENABLED", e.target.value)} disabled={busy} className={inputCls}>
              <option value="true">{t("saleOn")}</option>
              <option value="false">{t("saleOff")}</option>
            </select>
          </Field>

          <Field label={t("saleShippingLabel")} hint={t("saleShippingHint", { currency: data.STOCK_CURRENCY || "USD" })} icon={<DollarSign className="w-4 h-4 text-gray-400" />}>
            <input type="number" step="0.01" min="0" value={data.BOOK_SALE_SHIPPING_FEE} onChange={(e) => set("BOOK_SALE_SHIPPING_FEE", e.target.value)} disabled={busy} className={inputCls} />
          </Field>

          <Field label={t("saleTaxLabel")} hint={t("saleTaxHint")} icon={<DollarSign className="w-4 h-4 text-gray-400" />}>
            <div className="relative">
              <input type="number" step="0.01" min="0" max="100" value={data.BOOK_SALE_TAX_RATE} onChange={(e) => set("BOOK_SALE_TAX_RATE", e.target.value)} disabled={busy} className={inputCls} placeholder="0" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">%</span>
            </div>
          </Field>

          <Field label={t("saleReturnWindowLabel")} hint={t("saleReturnWindowHint")} icon={<DollarSign className="w-4 h-4 text-gray-400" />}>
            <input type="number" min="0" value={data.BOOK_SALE_RETURN_WINDOW_DAYS} onChange={(e) => set("BOOK_SALE_RETURN_WINDOW_DAYS", e.target.value)} disabled={busy} className={inputCls} />
          </Field>

        </div>
      </Section>

      {/* ── Public Footer ─────────────────────────────────────────────── */}
      <Section title={t("sectionFooter")} icon={<MapPin className="w-4 h-4 text-teal-500" />}>
        <p className="text-xs text-gray-400 -mt-2 mb-4">{t("footerSectionNote")}</p>

        {/* Master toggle */}
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100 mb-4">
          <div>
            <p className="text-sm font-semibold text-gray-800">{t("footerEnabledLabel")}</p>
            <p className="text-xs text-gray-500 mt-0.5">{t("footerEnabledDesc")}</p>
          </div>
          <button
            type="button"
            onClick={() => set("PUBLIC_FOOTER_ENABLED", data.PUBLIC_FOOTER_ENABLED === "true" ? "false" : "true")}
            disabled={busy}
            className="flex items-center gap-2 text-sm font-medium transition-colors"
          >
            {data.PUBLIC_FOOTER_ENABLED === "true" ? (
              <><ToggleRight className="w-8 h-8 text-teal-500" /><span className="text-teal-600">{t("footerToggleOn")}</span></>
            ) : (
              <><ToggleLeft className="w-8 h-8 text-gray-400" /><span className="text-gray-400">{t("footerToggleOff")}</span></>
            )}
          </button>
        </div>

        {data.PUBLIC_FOOTER_ENABLED === "true" && (
          <>
            {/* Which contact types to show */}
            <div className="mb-4">
              <p className="text-sm font-medium text-gray-700 mb-2">{t("footerShowLabel")}</p>
              <div className="flex flex-wrap gap-2">
                {([
                  { key: "phone",    label: "Phone"    },
                  { key: "email",    label: "Email"    },
                  { key: "whatsapp", label: "WhatsApp" },
                  { key: "telegram", label: "Telegram" },
                  { key: "address",  label: "Address"  },
                  { key: "hours",    label: "Hours"    },
                  { key: "website",  label: "Website"  },
                ] as const).map(({ key, label }) => {
                  const current = (data.PUBLIC_FOOTER_SHOW ?? "").split(",").map(v => v.trim()).filter(Boolean);
                  const active  = current.includes(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        const next = active
                          ? current.filter(v => v !== key)
                          : [...current, key];
                        set("PUBLIC_FOOTER_SHOW", next.join(","));
                      }}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors disabled:opacity-50 ${
                        active
                          ? "bg-teal-50 border-teal-300 text-teal-700"
                          : "bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-gray-400 mt-1.5">{t("footerShowHint")}</p>
            </div>

            {/* Extra fields not in Library Information */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <Field label={t("footerHoursLabel")} hint={t("footerHoursHint")} icon={<Clock className="w-4 h-4 text-gray-400" />}>
                <input value={data.LIBRARY_HOURS} onChange={(e) => set("LIBRARY_HOURS", e.target.value)}
                  placeholder="Mon–Fri 8am–5pm" disabled={busy} className={inputCls} />
              </Field>
              <Field label={t("footerWhatsappLabel")} hint={t("footerWhatsappHint")} icon={<ExternalLink className="w-4 h-4 text-gray-400" />}>
                <input value={data.LIBRARY_WHATSAPP} onChange={(e) => set("LIBRARY_WHATSAPP", e.target.value)}
                  placeholder="+855 12 345 678" disabled={busy} className={inputCls} />
              </Field>
              <Field label={t("footerWebsiteLabel")} hint={t("footerWebsiteHint")} icon={<ExternalLink className="w-4 h-4 text-gray-400" />}>
                <input value={data.LIBRARY_WEBSITE} onChange={(e) => set("LIBRARY_WEBSITE", e.target.value)}
                  placeholder="https://..." disabled={busy} className={inputCls} />
              </Field>
            </div>

            {/* ── Description ── */}
            <div className="mt-6">
              <Field label={t("footerDescriptionLabel")} hint={t("footerDescriptionHint")} icon={<ExternalLink className="w-4 h-4 text-gray-400" />}>
                <textarea value={data.PUBLIC_FOOTER_DESCRIPTION} onChange={(e) => set("PUBLIC_FOOTER_DESCRIPTION", e.target.value)}
                  rows={2} placeholder="Your gateway to knowledge…" disabled={busy}
                  className={`${inputCls} resize-none`} />
              </Field>
            </div>
          </>
        )}
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
          <Field label={t("libraryAddressLabel")} hint={t("libraryAddressHint")} icon={<Building2 className="w-4 h-4 text-gray-400" />}>
            <input
              type="text"
              value={data.LIBRARY_ADDRESS}
              onChange={(e) => set("LIBRARY_ADDRESS", e.target.value)}
              disabled={busy}
              className={inputCls}
              placeholder="123 Street, Phnom Penh"
            />
          </Field>
          <Field
            label={t("libraryTelegramLabel")}
            hint={t("libraryTelegramHint")}
            icon={<Phone className="w-4 h-4 text-gray-400" />}
          >
            <input
              type="text"
              value={data.LIBRARY_TELEGRAM}
              onChange={(e) => set("LIBRARY_TELEGRAM", e.target.value)}
              disabled={busy}
              className={inputCls}
              placeholder="@pvdlibrary"
            />
            {data.LIBRARY_TELEGRAM && (
              <a
                href={`https://t.me/${data.LIBRARY_TELEGRAM.replace("@", "")}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 mt-1 text-xs text-blue-500 hover:underline"
              >
                Preview link ↗
              </a>
            )}
          </Field>
        </div>
      </Section>

      {/* ── Languages ─────────────────────────────────────────────────── */}
      <Section title={t("sectionLanguages")} icon={<Globe className="w-4 h-4 text-indigo-500" />}>
        <p className="text-xs text-gray-400 -mt-2">{t("languagesSectionNote")}</p>

        {/* Per-locale toggle cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {ALL_LOCALES.map((loc) => {
            const isDefault     = loc.code === DEFAULT_LOCALE;
            const isOn          = enabledLocalesList.includes(loc.code);
            const isOnlyEnabled = enabledLocalesList.length === 1 && isOn;

            return (
              <div
                key={loc.code}
                className={`relative flex items-center justify-between gap-4 rounded-xl border-2 pl-4 pr-5 py-3.5 transition-all
                  ${isOn ? "border-indigo-200 bg-indigo-50/60" : "border-gray-100 bg-gray-50/60 opacity-60"}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-2xl leading-none select-none">{loc.flag}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800 leading-tight">{loc.nativeLabel}</p>
                    <p className="text-xs text-gray-400 leading-tight">
                      {loc.label} · <code className="font-mono">{loc.code}</code>
                    </p>
                    {isDefault && (
                      <p className="text-[10px] text-indigo-500 mt-0.5 flex items-center gap-1">
                        <Lock className="w-2.5 h-2.5" /> {t("langDefaultLocked")}
                      </p>
                    )}
                  </div>
                </div>
                {isDefault ? (
                  <div title={t("langDefaultLocked")}
                    className="flex-shrink-0 flex items-center justify-center w-10 h-6 rounded-full bg-indigo-200 cursor-not-allowed">
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
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm
                      transition-transform duration-200 ${isOn ? "translate-x-5" : "translate-x-0"}`} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Link to Translations manager */}
        <div className="flex items-center justify-between gap-4 pt-2 border-t border-gray-100">
          <p className="text-xs text-gray-400">{t("translationsNote")}</p>
          <button
            type="button"
            onClick={() => router.push(`/${(typeof window !== "undefined" ? window.location.pathname.split("/")[1] : "en")}/admin/translations`)}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg text-xs font-semibold hover:bg-indigo-100 transition-colors shrink-0"
          >
            <Globe className="w-3.5 h-3.5" /> {t("manageTranslations")}
          </button>
        </div>
      </Section>

      {/* ── System ───────────────────────────────────────────────────── */}
      <Section title="System" icon={<Activity className="w-4 h-4 text-gray-500" />}>
        <Field
          label="Version check-in"
          hint="When enabled, this server periodically sends the maintainer its hostname, library name, app version, rough book/member counts, and basic runtime info (Node/Next version, OS, uptime) — the maintainer's server also notes an approximate country/city from the request, never a raw IP address. No member, book, or loan data is ever included. Disabled by default."
          icon={<Activity className="w-4 h-4 text-gray-400" />}
        >
          <div className="flex items-center gap-4">
            <button
              onClick={() => set("TELEMETRY_ENABLED", data.TELEMETRY_ENABLED === "true" ? "false" : "true")}
              disabled={busy}
              className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                data.TELEMETRY_ENABLED === "true" ? "bg-green-500" : "bg-gray-300"
              } ${busy ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                  data.TELEMETRY_ENABLED === "true" ? "translate-x-7" : "translate-x-1"
                }`}
              />
            </button>
            <span className="text-sm text-gray-600">{data.TELEMETRY_ENABLED === "true" ? "Enabled" : "Disabled"}</span>
          </div>
        </Field>

        {data.TELEMETRY_ENABLED === "true" && (
          <>
            <Field
              label="Telemetry endpoint"
              hint="URL that receives the heartbeat and replies with update-availability info (e.g. a route on your own site). Nothing is sent while this is empty."
              icon={<Activity className="w-4 h-4 text-gray-400" />}
            >
              <input
                value={data.TELEMETRY_ENDPOINT}
                onChange={(e) => set("TELEMETRY_ENDPOINT", e.target.value)}
                disabled={busy}
                placeholder="https://me.mrsloth.org/api/telemetry"
                className={inputCls}
              />
            </Field>

            <Field
              label="Telemetry key"
              hint={`Shared secret sent as the x-telemetry-key header — must match what your endpoint expects. ${data.TELEMETRY_KEY_SET === "true" ? "A key is already saved; leave this blank to keep it." : "Not set yet."}`}
              icon={<Activity className="w-4 h-4 text-gray-400" />}
            >
              <input
                type="password"
                value={data.TELEMETRY_KEY}
                onChange={(e) => set("TELEMETRY_KEY", e.target.value)}
                disabled={busy}
                placeholder={data.TELEMETRY_KEY_SET === "true" ? "•••••••• (unchanged)" : "shared secret"}
                className={inputCls}
              />
            </Field>

            <Field label="Check in now" hint="Send a heartbeat immediately, without waiting for the next scheduled check-in." icon={<Activity className="w-4 h-4 text-gray-400" />}>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={testTelemetry}
                  disabled={busy || telemetryTesting}
                  className="px-3 py-2 bg-gray-100 border border-gray-200 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                >
                  {telemetryTesting ? "Checking in…" : "Check in now"}
                </button>
                {telemetryResult && (
                  <span className={`text-xs font-medium ${telemetryResult.ok ? "text-green-600" : "text-red-600"}`}>
                    {telemetryResult.message}
                  </span>
                )}
              </div>
            </Field>
          </>
        )}
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

/* ── Webhook register button ───────────────────────────────────────────── */
function WebhookRegister() {
  const t = useTranslations("settings");
  const [status,  setStatus]  = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [url,     setUrl]     = useState("");
  const [errMsg,  setErrMsg]  = useState("");
  const [domain,  setDomain]  = useState("");

  async function register() {
    setStatus("loading");
    setErrMsg("");
    try {
      const res  = await fetch("/api/telegram/register-webhook", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ domain: domain.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setStatus("error"); setErrMsg(data.error ?? "Failed"); return; }
      setUrl(data.webhookUrl);
      setStatus("ok");
    } catch {
      setStatus("error");
      setErrMsg("Network error");
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="https://yourdomain.com  (leave blank to auto-detect)"
          className="flex-1 min-w-[260px] px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
        />
        <button
          type="button"
          onClick={register}
          disabled={status === "loading"}
          className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
        >
          {status === "loading"
            ? <><Loader2 className="w-4 h-4 animate-spin" /> {t("webhookRegistering")}</>
            : <><Send className="w-4 h-4" /> {t("webhookRegister")}</>}
        </button>
      </div>
      {status === "ok" && (
        <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          {t("webhookRegistered")} → <code className="font-mono break-all">{url}</code>
        </p>
      )}
      {status === "error" && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          ✗ {errMsg}
        </p>
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

/* ── Font picker (self-contained to avoid IIFE-in-JSX issues) ──────────── */
const FONT_PRESETS = [
  { val: "default",         label: "System Default", sample: "Aa",    khmer: false },
  { val: "Noto Sans Khmer", label: "Noto Sans Khmer",sample: "អក្សរ", khmer: true  },
  { val: "Kantumruy Pro",   label: "Kantumruy Pro",  sample: "អក្សរ", khmer: true  },
  { val: "Ang Daunsok",     label: "Ang Daunsok",    sample: "អក្សរ", khmer: true  },
  { val: "Kh Siemreap",     label: "Kh Siemreap",   sample: "អក្សរ", khmer: true  },
  { val: "Khmer Chantha",   label: "Khmer Chantha",  sample: "អក្សរ", khmer: true  },
  { val: "Inter",           label: "Inter",          sample: "Aa",    khmer: false },
  { val: "Poppins",         label: "Poppins",        sample: "Aa",    khmer: false },
  { val: "Roboto",          label: "Roboto",         sample: "Aa",    khmer: false },
] as const;

function FontPickerField({
  label, sampleText, currentFont, customFontsJson, busy, inputCls,
  onFontChange, onCustomFontsChange, latinOnly, khmerOnly,
}: {
  label?: string;
  sampleText?: string;
  currentFont: string;
  customFontsJson: string;
  busy: boolean;
  inputCls: string;
  onFontChange: (v: string) => void;
  onCustomFontsChange: (v: string) => void;
  latinOnly?: boolean;
  khmerOnly?: boolean;
}) {
  const [newFontName, setNewFontName] = useState("");

  let customFonts: {name:string; url:string}[] = [];
  try { customFonts = JSON.parse(customFontsJson || "[]"); } catch { /* ignore */ }

  const allPresetVals = FONT_PRESETS.map(p => p.val) as string[];
  const allFontNames  = [...allPresetVals, ...customFonts.map(f => f.name)];
  const googleValue   = allFontNames.includes(currentFont) ? "" : currentFont;

  // Filter presets based on latinOnly / khmerOnly
  const visiblePresets = FONT_PRESETS.filter(p =>
    khmerOnly  ? (p.val === "default" || p.khmer) :
    latinOnly  ? (p.val === "default" || !p.khmer) :
    true
  );

  return (
    <div className="space-y-1">
      {label && (
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{label}</p>
      )}
      <div className="mt-1 space-y-3">
        {/* Preset grid */}
        <div className="grid grid-cols-2 gap-2">
          {visiblePresets.map(({ val, label: presetLabel, sample }) => {
            const active = currentFont === val;
            return (
              <button key={val} type="button" disabled={busy}
                onClick={() => onFontChange(val)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border-2 text-left transition-all
                  ${active ? "border-indigo-500 bg-indigo-50" : "border-gray-200 hover:border-gray-300"}`}>
                <span className={`text-lg leading-none flex-shrink-0 ${active ? "text-indigo-600" : "text-gray-500"}`}>{sample}</span>
                <span className={`text-xs font-medium truncate ${active ? "text-indigo-700" : "text-gray-600"}`}>{presetLabel}</span>
              </button>
            );
          })}
          {/* Uploaded custom fonts */}
          {customFonts.map((cf) => {
            const active = currentFont === cf.name;
            return (
              <button key={cf.name} type="button" disabled={busy}
                onClick={() => onFontChange(cf.name)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border-2 text-left transition-all
                  ${active ? "border-indigo-500 bg-indigo-50" : "border-gray-200 hover:border-gray-300"}`}>
                <span className={`text-lg leading-none flex-shrink-0 ${active ? "text-indigo-600" : "text-gray-500"}`}>អ</span>
                <span className={`text-xs font-medium truncate ${active ? "text-indigo-700" : "text-gray-600"}`}>{cf.name}</span>
              </button>
            );
          })}
        </div>

        {/* Google Fonts name */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 whitespace-nowrap">Google Font:</span>
          <input
            value={googleValue}
            onChange={(e) => onFontChange(e.target.value || "default")}
            placeholder="e.g. Nokora, Open Sans…"
            disabled={busy}
            className={inputCls}
          />
        </div>

        {/* Custom uploaded fonts */}
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2">
          <p className="text-xs font-semibold text-gray-700">Custom / Uploaded Fonts</p>
          <p className="text-xs text-gray-400">Upload .ttf / .woff / .woff2 for fonts not on Google Fonts (e.g. Kh Ang PeaNor, AKbalthom KOUPREY Chaet).</p>

          {customFonts.map((cf, i) => (
            <div key={i} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-gray-200">
              <span className="text-xs font-medium text-gray-700 flex-1 truncate">{cf.name}</span>
              <span className="text-[10px] text-gray-400 truncate max-w-[120px]">{cf.url.split("/").pop()}</span>
              <button type="button" disabled={busy}
                onClick={async () => {
                  const next      = customFonts.filter((_, j) => j !== i);
                  const nextFont  = currentFont === cf.name ? "default" : currentFont;
                  const nextJson  = JSON.stringify(next);
                  onCustomFontsChange(nextJson);
                  onFontChange(nextFont);
                  // Persist immediately — don't wait for the Save button
                  await fetch("/api/settings", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ OPAC_CUSTOM_FONTS: nextJson, OPAC_FONT: nextFont }),
                  });
                }}
                className="w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 flex-shrink-0">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}

          <div className="flex gap-2">
            <input
              value={newFontName}
              onChange={(e) => setNewFontName(e.target.value)}
              placeholder="Font name (e.g. Kh Ang PeaNor)"
              disabled={busy}
              className={`${inputCls} flex-1 text-xs`}
            />
            <label className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 cursor-pointer transition-colors whitespace-nowrap">
              <ImagePlus className="w-3.5 h-3.5" />
              Upload File
              <input type="file" accept=".ttf,.woff,.woff2,.otf" className="hidden" disabled={busy}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  const name = newFontName.trim();
                  if (!file || !name) { alert("Enter a font name first."); return; }
                  const fd = new FormData();
                  fd.append("file", file);
                  fd.append("folder", "fonts");
                  const res  = await fetch("/api/upload", { method: "POST", body: fd });
                  const json = await res.json();
                  if (json.url) {
                    const next     = [...customFonts, { name, url: json.url }];
                    const nextJson = JSON.stringify(next);
                    onCustomFontsChange(nextJson);
                    onFontChange(name);
                    setNewFontName("");
                    e.target.value = "";
                    // Persist immediately
                    await fetch("/api/settings", {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ OPAC_CUSTOM_FONTS: nextJson, OPAC_FONT: name }),
                    });
                  }
                }}
              />
            </label>
          </div>
        </div>
      </div>
      <p className="text-xs text-gray-400">Applied to Discover, E-Library and Shop pages.</p>
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
