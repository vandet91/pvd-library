"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useLocale } from "next-intl";
import {
  Languages, Search, Save, Bot, Plus,
  RefreshCw, ChevronLeft, ChevronRight, CheckCircle2,
  AlertCircle, Loader2, Globe, X,
  Check, ToggleLeft, ToggleRight, Rocket, RotateCcw, Eye, EyeOff, Info,
} from "lucide-react";

/* ── Types ──────────────────────────────────────────────────────────────────── */

interface LocaleMeta { code: string; name: string; total: number; translated: number; missing: number; pct: number; isSource: boolean; enabled?: boolean; }
interface TranslationItem { key: string; en: string; value: string; missing: boolean; namespace: string; }
interface NsStats { total: number; missing: number; }

type FilterMode = "all" | "missing" | "translated";

/* ── Helpers ────────────────────────────────────────────────────────────────── */

function PctRing({ pct }: { pct: number }) {
  const color = pct >= 80 ? "#22c55e" : pct >= 40 ? "#f59e0b" : "#ef4444";
  return (
    <svg viewBox="0 0 36 36" className="w-10 h-10 -rotate-90">
      <circle cx="18" cy="18" r="15.9" fill="none" stroke="#f3f4f6" strokeWidth="3.5" />
      <circle cx="18" cy="18" r="15.9" fill="none" stroke={color} strokeWidth="3.5"
        strokeDasharray={`${pct} ${100 - pct}`} strokeLinecap="round" />
      <text x="18" y="18" dominantBaseline="middle" textAnchor="middle"
        className="fill-gray-700 text-[9px] font-bold" style={{ fontSize: 9, transform: "rotate(90deg)", transformOrigin: "center" }}>
      </text>
    </svg>
  );
}

const LIMIT = 50;

/* ── Main ───────────────────────────────────────────────────────────────────── */

export default function TranslationsPage() {
  const adminLocale = useLocale();

  /* ── Locales ── */
  const [locales,       setLocales]       = useState<LocaleMeta[]>([]);
  const [activeLocale,  setActiveLocale]  = useState("km");
  const [localesLoading, setLocalesLoading] = useState(true);

  /* ── Keys ── */
  const [items,       setItems]       = useState<TranslationItem[]>([]);
  const [namespaces,  setNamespaces]  = useState<Record<string, NsStats>>({});
  const [activeNs,    setActiveNs]    = useState("");
  const [search,      setSearch]      = useState("");
  const [debouncedQ,  setDebouncedQ]  = useState("");
  const [filterMode,  setFilterMode]  = useState<FilterMode>("all");
  const [page,        setPage]        = useState(1);
  const [totalPages,  setTotalPages]  = useState(1);
  const [total,       setTotal]       = useState(0);
  const [loading,     setLoading]     = useState(false);

  /* ── Edits ── */
  const [edits,       setEdits]       = useState<Record<string, string>>({});
  const [saving,      setSaving]      = useState(false);
  const [saveMsg,     setSaveMsg]     = useState<{ ok: boolean; text: string } | null>(null);

  /* ── AI ── */
  const [aiLoading,   setAiLoading]   = useState<Set<string>>(new Set());
  const [aiEnabled,   setAiEnabled]   = useState(false);
  const [aiBulkBusy,  setAiBulkBusy]  = useState(false);

  /* ── Publish state ── */
  const [publishing,      setPublishing]      = useState<string | null>(null);
  const [restartRequired, setRestartRequired] = useState(false);
  const [enabledLocales,  setEnabledLocales]  = useState<Set<string>>(new Set(["en"]));

  /* ── Add locale dialog ── */
  const [addOpen,     setAddOpen]     = useState(false);
  const [newCode,     setNewCode]     = useState("");
  const [addBusy,     setAddBusy]     = useState(false);
  const [addError,    setAddError]    = useState("");

  const searchRef = useRef<HTMLInputElement>(null);

  /* ── Debounce search ── */
  useEffect(() => {
    const id = setTimeout(() => { setDebouncedQ(search); setPage(1); }, 350);
    return () => clearTimeout(id);
  }, [search]);

  /* ── Load locales ── */
  const loadLocales = useCallback(async () => {
    setLocalesLoading(true);
    const [localesRes, settingsRes] = await Promise.all([
      fetch("/api/admin/translations/locales"),
      fetch("/api/settings"),
    ]);
    if (localesRes.ok) {
      const d = await localesRes.json();
      setLocales(d.locales ?? []);
      setAiEnabled(true);
    }
    if (settingsRes.ok) {
      const s: Record<string, string> = await settingsRes.json();
      try {
        const enabled: string[] = JSON.parse(s.ENABLED_LOCALES ?? '["en"]');
        setEnabledLocales(new Set(enabled));
      } catch { /* ignore */ }
    }
    setLocalesLoading(false);
  }, []);

  /* ── Toggle publish ── */
  async function togglePublish(code: string) {
    if (publishing) return;
    const enabling = !enabledLocales.has(code);
    setPublishing(code);
    const res = await fetch("/api/admin/translations/publish", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ locale: code, enabled: enabling }),
    });
    setPublishing(null);
    if (res.ok) {
      const d = await res.json();
      setEnabledLocales(new Set(d.enabledLocales ?? ["en"]));
      if (d.restartRequired) setRestartRequired(true);
    }
  }

  useEffect(() => { loadLocales(); }, [loadLocales]);

  /* ── Load translation items ── */
  const loadItems = useCallback(async () => {
    if (activeLocale === "en") return;
    setLoading(true);
    const params = new URLSearchParams({
      locale:    activeLocale,
      namespace: activeNs,
      search:    debouncedQ,
      filter:    filterMode,
      page:      String(page),
      limit:     String(LIMIT),
    });
    const res = await fetch(`/api/admin/translations?${params}`);
    if (res.ok) {
      const d = await res.json();
      setItems(d.items ?? []);
      setNamespaces(d.namespaces ?? {});
      setTotalPages(d.pages ?? 1);
      setTotal(d.total ?? 0);
    }
    setLoading(false);
  }, [activeLocale, activeNs, debouncedQ, filterMode, page]);

  useEffect(() => { loadItems(); }, [loadItems]);

  /* ── Reset page on filter/ns/locale change ── */
  useEffect(() => { setPage(1); setEdits({}); }, [activeLocale, activeNs, filterMode, debouncedQ]);

  /* ── Save ── */
  async function save() {
    if (Object.keys(edits).length === 0 || saving) return;
    setSaving(true);
    setSaveMsg(null);
    const res = await fetch("/api/admin/translations", {
      method:  "PUT",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ locale: activeLocale, changes: edits }),
    });
    setSaving(false);
    if (res.ok) {
      const d = await res.json();
      setSaveMsg({ ok: true, text: `${d.saved} key${d.saved !== 1 ? "s" : ""} saved` });
      setEdits({});
      loadItems();
      loadLocales();
    } else {
      setSaveMsg({ ok: false, text: "Save failed" });
    }
    setTimeout(() => setSaveMsg(null), 3000);
  }

  /* ── AI translate single key ── */
  async function aiTranslateKey(key: string, enValue: string) {
    setAiLoading((prev) => new Set([...prev, key]));
    const res = await fetch("/api/admin/translations/ai", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ locale: activeLocale, keys: [key], enValues: { [key]: enValue } }),
    });
    setAiLoading((prev) => { const n = new Set(prev); n.delete(key); return n; });
    if (res.ok) {
      const { translations } = await res.json();
      if (translations[key]) {
        setEdits((prev) => ({ ...prev, [key]: translations[key] }));
        setItems((prev) => prev.map((it) => it.key === key ? { ...it, value: translations[key], missing: false } : it));
      }
    }
  }

  /* ── AI translate all missing on current page ── */
  async function aiTranslatePage() {
    const missing = items.filter((it) => it.missing);
    if (missing.length === 0) return;
    setAiBulkBusy(true);
    const enValues = Object.fromEntries(missing.map((it) => [it.key, it.en]));
    const res = await fetch("/api/admin/translations/ai", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ locale: activeLocale, keys: missing.map((it) => it.key), enValues }),
    });
    setAiBulkBusy(false);
    if (res.ok) {
      const { translations } = await res.json();
      setEdits((prev) => ({ ...prev, ...translations }));
      setItems((prev) => prev.map((it) =>
        translations[it.key] ? { ...it, value: translations[it.key], missing: false } : it
      ));
    }
  }

  /* ── Add locale ── */
  async function addLocale() {
    if (!newCode.trim()) return;
    setAddBusy(true); setAddError("");
    const res = await fetch("/api/admin/translations/locales", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ code: newCode.trim().toLowerCase() }),
    });
    setAddBusy(false);
    if (res.ok) {
      setAddOpen(false); setNewCode("");
      await loadLocales();
      setActiveLocale(newCode.trim().toLowerCase());
    } else {
      const d = await res.json();
      setAddError(d.error ?? "Failed to create locale");
    }
  }

  /* ── Computed ── */
  const activeMeta   = locales.find((l) => l.code === activeLocale);
  const pendingCount = Object.keys(edits).length;
  const nsList       = Object.entries(namespaces).sort((a, b) => b[1].missing - a[1].missing);
  const missingOnPage = items.filter((it) => it.missing && !edits[it.key]).length;

  /* ── Render ── */
  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-h-[calc(100vh-4rem)] overflow-hidden">

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex flex-wrap items-center gap-3 px-6 py-4 border-b border-gray-100 bg-white">
        <div className="flex items-center gap-2">
          <Languages className="w-5 h-5 text-indigo-500" />
          <h1 className="text-lg font-bold text-gray-900">Translations</h1>
        </div>

        {/* Locale tabs */}
        <div className="flex items-center gap-1 ml-2 flex-wrap">
          {localesLoading
            ? <div className="h-8 w-32 bg-gray-100 rounded-lg animate-pulse" />
            : locales.map((loc) => {
              const isEnabled = enabledLocales.has(loc.code);
              return (
                <button
                  key={loc.code}
                  onClick={() => { setActiveLocale(loc.code); setEdits({}); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    activeLocale === loc.code
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {loc.name}
                  {!loc.isSource && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                      activeLocale === loc.code ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"
                    }`}>
                      {loc.pct}%
                    </span>
                  )}
                  {loc.isSource
                    ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/20 text-white font-medium">source</span>
                    : isEnabled
                      ? <Eye className={`w-3 h-3 ${activeLocale === loc.code ? "text-green-300" : "text-green-500"}`} />
                      : <EyeOff className={`w-3 h-3 ${activeLocale === loc.code ? "text-white/40" : "text-gray-300"}`} />
                  }
                </button>
              );
            })
          }
          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors border border-dashed border-gray-200"
          >
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        </div>

        {/* Save button */}
        <div className="ml-auto flex items-center gap-2">
          {saveMsg && (
            <span className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg ${
              saveMsg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
            }`}>
              {saveMsg.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
              {saveMsg.text}
            </span>
          )}
          {pendingCount > 0 && (
            <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1.5 rounded-lg font-medium">
              {pendingCount} unsaved
            </span>
          )}
          <button
            onClick={save}
            disabled={pendingCount === 0 || saving || activeLocale === "en"}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 transition-colors shadow-sm"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save
          </button>
        </div>
      </div>


      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex min-h-0 overflow-hidden">

        {/* ── Left: namespace sidebar ── */}
        <aside className="w-52 flex-shrink-0 border-r border-gray-100 bg-gray-50 overflow-y-auto">
          <div className="p-3 space-y-0.5">
            <button
              onClick={() => setActiveNs("")}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                activeNs === "" ? "bg-indigo-50 text-indigo-700 font-semibold" : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <span className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" /> All</span>
              <span className={`text-[11px] font-bold px-1.5 rounded-full ${
                activeNs === "" ? "bg-indigo-100 text-indigo-600" : "bg-gray-200 text-gray-500"
              }`}>
                {Object.values(namespaces).reduce((s, n) => s + n.missing, 0)}
              </span>
            </button>

            <div className="pt-1 pb-0.5 px-3">
              <p className="text-[10px] uppercase tracking-widest font-semibold text-gray-400">Namespaces</p>
            </div>

            {nsList.map(([ns, stats]) => (
              <button
                key={ns}
                onClick={() => { setActiveNs(ns); setPage(1); }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                  activeNs === ns ? "bg-indigo-50 text-indigo-700 font-semibold" : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                <span className="truncate">{ns}</span>
                {stats.missing > 0 && (
                  <span className="text-[11px] font-bold px-1.5 rounded-full bg-amber-100 text-amber-600 shrink-0">
                    {stats.missing}
                  </span>
                )}
              </button>
            ))}
          </div>
        </aside>

        {/* ── Right: translation table ── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* Toolbar */}
          <div className="flex-shrink-0 flex flex-wrap items-center gap-2 px-4 py-3 border-b border-gray-100 bg-white">

            {/* Search */}
            <div className="relative flex-1 min-w-48 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search keys or values…"
                className="w-full pl-8 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter pills */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
              {(["all", "missing", "translated"] as FilterMode[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilterMode(f)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold capitalize transition-all ${
                    filterMode === f ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            {/* Stats */}
            <span className="text-xs text-gray-400">
              {loading ? "…" : `${total.toLocaleString()} keys`}
            </span>

            {/* AI bulk translate */}
            {activeLocale !== "en" && missingOnPage > 0 && (
              <button
                onClick={aiTranslatePage}
                disabled={aiBulkBusy}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white rounded-lg text-xs font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors ml-auto"
              >
                {aiBulkBusy
                  ? <><Loader2 className="w-3 h-3 animate-spin" /> Translating…</>
                  : <><Bot className="w-3 h-3" /> AI translate {missingOnPage} missing</>
                }
              </button>
            )}
          </div>

          {/* Source locale notice */}
          {activeLocale === "en" && (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              <div className="text-center">
                <Languages className="w-10 h-10 mx-auto mb-2 text-gray-200" />
                <p className="font-medium">English is the source locale</p>
                <p className="text-sm mt-1">Select another language to edit translations.</p>
              </div>
            </div>
          )}

          {/* Progress bar + publish toggle */}
          {activeLocale !== "en" && activeMeta && (
            <div className="flex-shrink-0 px-4 py-2.5 bg-gray-50 border-b border-gray-100 space-y-2">
              {/* Progress */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      activeMeta.pct >= 80 ? "bg-green-500" : activeMeta.pct >= 40 ? "bg-amber-400" : "bg-red-400"
                    }`}
                    style={{ width: `${activeMeta.pct}%` }}
                  />
                </div>
                <span className="text-xs font-semibold text-gray-600 shrink-0">
                  {activeMeta.translated.toLocaleString()} / {activeMeta.total.toLocaleString()} ({activeMeta.pct}%)
                </span>
              </div>

              {/* Publish toggle */}
              {(() => {
                const routingReady = true; // proxy.ts reads messages/ dynamically — no restart needed
                const isEnabled    = enabledLocales.has(activeLocale);
                return (
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => togglePublish(activeLocale)}
                        disabled={!!publishing}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all ${
                          isEnabled
                            ? "border-green-400 bg-green-50 text-green-700 hover:bg-green-100"
                            : "border-gray-200 bg-white text-gray-600 hover:border-indigo-300 hover:text-indigo-700"
                        }`}
                      >
                        {publishing === activeLocale
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : isEnabled
                            ? <><ToggleRight className="w-4 h-4 text-green-500" /> Available to users</>
                            : <><ToggleLeft  className="w-4 h-4 text-gray-400" /> Hidden from users</>
                        }
                      </button>

                      {!isEnabled && activeMeta.pct < 80 && (
                        <span className="text-xs text-amber-600 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          {80 - activeMeta.pct}% more needed for 80% threshold
                        </span>
                      )}

                      {/* Routing not ready warning */}
                      {!routingReady && (
                        <span className="text-xs text-orange-600 bg-orange-50 border border-orange-200 px-2 py-1 rounded-lg flex items-center gap-1">
                          <RotateCcw className="w-3 h-3" />
                          Restart required to activate URL routing
                        </span>
                      )}
                    </div>

                    {!isEnabled && activeMeta.pct >= 80 && (
                      <button
                        onClick={() => togglePublish(activeLocale)}
                        disabled={!!publishing}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors"
                      >
                        <Rocket className="w-3.5 h-3.5" />
                        {routingReady ? "Publish language" : "Enable (restart needed for routing)"}
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Key table */}
          {activeLocale !== "en" && (
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center gap-2 h-40 text-gray-400">
                  <Loader2 className="w-5 h-5 animate-spin" /> Loading…
                </div>
              ) : items.length === 0 ? (
                <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
                  No keys match your filters.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50 border-b border-gray-100 z-10">
                    <tr>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 w-52">Key</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 w-[38%]">English</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">
                        {activeMeta?.name ?? activeLocale}
                      </th>
                      <th className="w-12" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {items.map((item) => {
                      const edited  = edits[item.key];
                      const current = edited ?? item.value;
                      const dirty   = edited !== undefined;
                      const aiRunning = aiLoading.has(item.key);

                      return (
                        <tr key={item.key} className={`group transition-colors ${
                          dirty ? "bg-amber-50/40" : item.missing ? "bg-red-50/20" : "hover:bg-gray-50/60"
                        }`}>
                          {/* Key */}
                          <td className="px-4 py-2 align-top">
                            <div className="flex items-start gap-1.5">
                              {dirty
                                ? <span className="mt-1 w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                                : item.missing
                                  ? <span className="mt-1 w-1.5 h-1.5 rounded-full bg-red-300 shrink-0" />
                                  : <span className="mt-1 w-1.5 h-1.5 rounded-full bg-green-300 shrink-0" />
                              }
                              <code className="text-xs text-gray-500 font-mono break-all leading-snug">
                                {item.key.includes(".")
                                  ? <>
                                      <span className="text-gray-300">{item.key.split(".")[0]}.</span>
                                      {item.key.split(".").slice(1).join(".")}
                                    </>
                                  : item.key
                                }
                              </code>
                            </div>
                          </td>

                          {/* English source */}
                          <td className="px-4 py-2 align-top">
                            <p className="text-gray-500 text-xs leading-relaxed line-clamp-3">{item.en}</p>
                          </td>

                          {/* Editable value */}
                          <td className="px-4 py-2 align-top">
                            <textarea
                              rows={Math.max(1, Math.ceil((current || item.en).length / 60))}
                              value={current}
                              onChange={(e) => setEdits((prev) => ({ ...prev, [item.key]: e.target.value }))}
                              placeholder={item.missing ? "Missing translation…" : undefined}
                              className={`w-full px-2 py-1.5 text-xs border rounded-lg resize-none focus:outline-none focus:ring-2 transition-colors leading-relaxed ${
                                dirty
                                  ? "border-amber-300 focus:ring-amber-400 bg-amber-50"
                                  : item.missing
                                    ? "border-red-200 focus:ring-red-300 bg-red-50/30 placeholder:text-red-300"
                                    : "border-gray-200 focus:ring-indigo-300 bg-white"
                              }`}
                            />
                          </td>

                          {/* AI button */}
                          <td className="px-2 py-2 align-top">
                            <button
                              onClick={() => aiTranslateKey(item.key, item.en)}
                              disabled={aiRunning || aiBulkBusy}
                              title="AI translate this key"
                              className="opacity-0 group-hover:opacity-100 flex items-center justify-center w-7 h-7 rounded-lg bg-violet-50 text-violet-600 hover:bg-violet-100 disabled:opacity-40 transition-all"
                            >
                              {aiRunning
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <Bot className="w-3.5 h-3.5" />
                              }
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Pagination */}
          {activeLocale !== "en" && totalPages > 1 && (
            <div className="flex-shrink-0 flex items-center justify-between px-4 py-2.5 border-t border-gray-100 bg-white text-xs text-gray-500">
              <span>{total.toLocaleString()} keys · Page {page} of {totalPages}</span>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(1)} disabled={page === 1}
                  className="px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40">«</button>
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                  className="px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40">
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const p = Math.max(1, Math.min(totalPages - 4, page - 2)) + i;
                  return (
                    <button key={p} onClick={() => setPage(p)}
                      className={`w-7 h-7 rounded border text-xs font-medium transition-colors ${
                        p === page ? "bg-indigo-600 text-white border-indigo-600" : "border-gray-200 hover:bg-gray-50"
                      }`}>
                      {p}
                    </button>
                  );
                })}
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40">
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setPage(totalPages)} disabled={page === totalPages}
                  className="px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40">»</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Add language dialog ───────────────────────────────────────────── */}
      {addOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setAddOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Plus className="w-4 h-4 text-indigo-500" /> Add Language
              </h2>
              <button onClick={() => setAddOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Locale code</label>
                <input
                  type="text"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value.toLowerCase())}
                  placeholder="e.g. fr, zh, th, vi"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  onKeyDown={(e) => e.key === "Enter" && addLocale()}
                />
                <p className="text-xs text-gray-400 mt-1">Use ISO 639-1 code (2 letters, lowercase)</p>
              </div>

              {addError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{addError}</p>
              )}

              <div className="flex flex-wrap gap-2">
                {["fr","zh","ja","th","vi","id","ms","ar","es","de","pt"].map((c) => (
                  <button key={c} onClick={() => setNewCode(c)}
                    className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors ${
                      newCode === c ? "bg-indigo-600 text-white border-indigo-600" : "border-gray-200 text-gray-600 hover:border-indigo-300"
                    }`}>
                    {c}
                  </button>
                ))}
              </div>

              <button
                onClick={addLocale}
                disabled={!newCode.trim() || addBusy}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {addBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Create language file
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
