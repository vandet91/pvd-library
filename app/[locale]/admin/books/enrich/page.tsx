"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import {
  Sparkles, BookOpen, ImageIcon, FileText, Calendar,
  BookCopy, Globe, User, Building2, RefreshCw,
  CheckCircle2, XCircle, AlertTriangle, Loader2,
  ChevronRight, ToggleLeft, ToggleRight, Info,
  ArrowLeft, Search, Bot, Zap, Flag, ChevronDown,
} from "lucide-react";
import type { BulkCoverResult } from "@/app/api/books/covers/elibrary-bulk/route";
import type { EnrichField, EnrichResult } from "@/app/api/books/isbn-enrich/bulk/route";

/* ── Types ──────────────────────────────────────────────────────────────────── */

interface Stats {
  totalBooks:         number;
  totalWithIsbn:      number;
  missingCover:       number;
  missingDescription: number;
  missingYear:        number;
  missingPages:       number;
  missingLanguage:    number;
  missingAuthor:      number;
  missingPublisher:   number;
  aiAvailable:        boolean;
  aiModel:            string | null;
}

interface BulkResult {
  processed: number;
  updated:   number;
  notFound:  number;
  errors:    number;
  results:   EnrichResult[];
}

/* ── Field definitions ──────────────────────────────────────────────────────── */

const FIELDS: {
  key:     EnrichField;
  label:   string;
  icon:    React.ReactNode;
  statKey: keyof Stats;
  color:   string;
  bg:      string;
}[] = [
  { key: "cover",       label: "Cover Image",    icon: <ImageIcon  className="w-4 h-4" />, statKey: "missingCover",       color: "text-violet-600", bg: "bg-violet-50" },
  { key: "description", label: "Description",    icon: <FileText   className="w-4 h-4" />, statKey: "missingDescription", color: "text-blue-600",   bg: "bg-blue-50"   },
  { key: "publishYear", label: "Publish Year",   icon: <Calendar   className="w-4 h-4" />, statKey: "missingYear",        color: "text-amber-600",  bg: "bg-amber-50"  },
  { key: "pages",       label: "Page Count",     icon: <BookCopy   className="w-4 h-4" />, statKey: "missingPages",       color: "text-orange-600", bg: "bg-orange-50" },
  { key: "language",    label: "Language",       icon: <Globe      className="w-4 h-4" />, statKey: "missingLanguage",    color: "text-teal-600",   bg: "bg-teal-50"   },
  { key: "author",      label: "Author",         icon: <User       className="w-4 h-4" />, statKey: "missingAuthor",      color: "text-rose-600",   bg: "bg-rose-50"   },
  { key: "publisher",   label: "Publisher",      icon: <Building2  className="w-4 h-4" />, statKey: "missingPublisher",   color: "text-indigo-600", bg: "bg-indigo-50" },
];

const BATCH_SIZES = [50, 100, 200, 300, 500];

/* ── Source badge ───────────────────────────────────────────────────────────── */

function SourceBadge({ source }: { source: string | null }) {
  if (!source) return <span className="text-xs text-gray-300">—</span>;
  const map: Record<string, { label: string; cls: string }> = {
    openlibrary:           { label: "OpenLibrary",       cls: "bg-blue-50 text-blue-700 border-blue-200"       },
    google:                { label: "Google Books",      cls: "bg-green-50 text-green-700 border-green-200"    },
    merged:                { label: "Both",              cls: "bg-violet-50 text-violet-700 border-violet-200" },
    ai:                    { label: "AI",                cls: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200" },
    "merged+ai":           { label: "APIs + AI",         cls: "bg-purple-50 text-purple-700 border-purple-200"   },
    "khmer+ai":            { label: "🇰🇭 AI",             cls: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200" },
    elibrary:              { label: "🇰🇭 eLibrary",       cls: "bg-red-50 text-red-700 border-red-200"          },
    "openlibrary+elibrary":{ label: "OL + 🇰🇭",          cls: "bg-red-50 text-red-700 border-red-200"          },
    "google+elibrary":     { label: "Google + 🇰🇭",      cls: "bg-red-50 text-red-700 border-red-200"          },
    "merged+elibrary":     { label: "APIs + 🇰🇭",        cls: "bg-red-50 text-red-700 border-red-200"          },
    "merged+ai+elibrary":  { label: "APIs + AI + 🇰🇭",   cls: "bg-red-50 text-red-700 border-red-200"          },
    "ai+elibrary":         { label: "AI + 🇰🇭",          cls: "bg-red-50 text-red-700 border-red-200"          },
  };
  const meta = map[source] ?? { label: source, cls: "bg-gray-50 text-gray-600 border-gray-200" };
  const isAi = source === "ai" || source === "merged+ai";
  return (
    <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] font-medium border ${meta.cls}`}>
      {isAi && <Bot className="w-2.5 h-2.5" />}
      {meta.label}
    </span>
  );
}

/* ── Main Page ──────────────────────────────────────────────────────────────── */

export default function IsbnEnrichPage() {
  const locale = useLocale();

  /* ── Stats ── */
  const [stats,        setStats]        = useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  /* ── Config ── */
  const [selectedFields, setSelectedFields] = useState<Set<EnrichField>>(new Set(["cover"]));
  const [overwrite,      setOverwrite]      = useState(false);
  const [useAI,          setUseAI]          = useState(false);
  const [batchSize,      setBatchSize]      = useState(100);

  /* ── Run ── */
  const [running,    setRunning]    = useState(false);
  const [result,     setResult]     = useState<BulkResult | null>(null);
  const [resultPage, setResultPage] = useState(1);
  const RESULT_PAGE_SIZE = 20;

  /* ── Load stats ── */
  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await fetch("/api/books/isbn-enrich/stats");
      if (res.ok) setStats(await res.json());
    } catch { /* ignore */ }
    finally { setStatsLoading(false); }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  /* ── Toggle field ── */
  function toggleField(key: EnrichField) {
    setSelectedFields((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  /* ── Quick presets ── */
  function selectAll()  { setSelectedFields(new Set(FIELDS.map((f) => f.key))); }
  function selectNone() { setSelectedFields(new Set()); }
  function selectMissingOnly() {
    if (!stats) return;
    setSelectedFields(new Set(FIELDS.filter((f) => (stats[f.statKey] ?? 0) > 0).map((f) => f.key)));
  }

  /* ── Run enrichment ── */
  async function runEnrich() {
    if (selectedFields.size === 0 || running) return;
    setRunning(true);
    setResult(null);
    setResultPage(1);
    try {
      const res = await fetch("/api/books/isbn-enrich/bulk", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          fields:    Array.from(selectedFields),
          overwrite,
          useAI,
          limit:     batchSize,
        }),
      });
      if (res.ok) {
        const data: BulkResult = await res.json();
        setResult(data);
        await loadStats(); // refresh counts
      }
    } catch { /* ignore */ }
    finally { setRunning(false); }
  }

  /* ── eLibrary Cambodia cover fetch ── */
  const [elibMissing,   setElibMissing]   = useState<number | null>(null);
  const [elibBatch,     setElibBatch]     = useState(20);
  const [elibRunning,   setElibRunning]   = useState(false);
  const [elibOffset,    setElibOffset]    = useState(0);
  const [elibFound,     setElibFound]     = useState(0);
  const [elibProcessed, setElibProcessed] = useState(0);
  const [elibResults,   setElibResults]   = useState<BulkCoverResult[]>([]);
  const [elibHasMore,   setElibHasMore]   = useState(false);
  const [elibDone,      setElibDone]      = useState(false);
  const [elibOpen,      setElibOpen]      = useState(true);

  const loadElibStats = useCallback(async () => {
    try {
      const res = await fetch("/api/books/covers/elibrary-bulk");
      if (res.ok) {
        const d = await res.json();
        setElibMissing(d.missing);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadElibStats(); }, [loadElibStats]);

  async function runElibBatch(offset: number, resetResults = false) {
    setElibRunning(true);
    if (resetResults) { setElibResults([]); setElibFound(0); setElibProcessed(0); setElibDone(false); }
    try {
      const res = await fetch("/api/books/covers/elibrary-bulk", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ limit: elibBatch, offset }),
      });
      if (!res.ok) throw new Error("Request failed");
      const data = await res.json();

      setElibResults((prev) => (resetResults ? data.results : [...prev, ...data.results]));
      setElibFound((prev)     => (resetResults ? data.updated : prev + data.updated));
      setElibProcessed((prev) => (resetResults ? data.processed : prev + data.processed));
      setElibOffset(offset + data.processed);
      setElibHasMore(data.hasMore);
      setElibDone(!data.hasMore);
      if (!data.hasMore) { setElibMissing(0); await loadStats(); }
      else setElibMissing((m) => (m ?? 0) - data.updated);
    } catch { /* ignore */ }
    finally { setElibRunning(false); }
  }

  /* ── Computed ── */
  const totalMissingSelected = stats
    ? Array.from(selectedFields).reduce((sum, key) => {
        const field = FIELDS.find((f) => f.key === key);
        return sum + (field ? (stats[field.statKey] ?? 0) : 0);
      }, 0)
    : 0;

  const pagedResults  = result?.results.slice((resultPage - 1) * RESULT_PAGE_SIZE, resultPage * RESULT_PAGE_SIZE) ?? [];
  const totalPages    = Math.ceil((result?.results.length ?? 0) / RESULT_PAGE_SIZE);

  /* ── Render ── */
  return (
    <div className="space-y-6 max-w-5xl">

      {/* ── Header ── */}
      <div>
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-3">
          <Link href={`/${locale}/admin/books`} className="hover:text-gray-600 flex items-center gap-1">
            <ArrowLeft className="w-3.5 h-3.5" /> Books
          </Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-gray-700 font-medium">ISBN Enrichment</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-violet-500" />
          ISBN Auto-Fill
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Automatically fill missing book data using OpenLibrary and Google Books.
        </p>
      </div>

      {/* ── Stats overview ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Books",      value: stats?.totalBooks,    color: "text-gray-800",   sub: null },
          { label: "Have ISBN",        value: stats?.totalWithIsbn, color: "text-indigo-600", sub: stats ? `${Math.round((stats.totalWithIsbn / stats.totalBooks) * 100)}%` : null },
          { label: "Missing Cover",    value: stats?.missingCover,  color: "text-violet-600", sub: null },
          { label: "Missing Any Data", value: stats
            ? Math.max(stats.missingCover, stats.missingDescription, stats.missingYear, stats.missingPages, stats.missingLanguage, stats.missingAuthor, stats.missingPublisher)
            : null,
            color: "text-amber-600", sub: null },
        ].map(({ label, value, color, sub }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
            {statsLoading
              ? <div className="h-8 bg-gray-100 rounded animate-pulse mx-auto w-16 mb-1" />
              : <p className={`text-2xl font-bold ${color}`}>{value?.toLocaleString() ?? "—"}</p>
            }
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
            {sub && !statsLoading && <p className="text-[11px] text-gray-400 mt-0.5">{sub} of total</p>}
          </div>
        ))}
      </div>

      {/* ── Field selector ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2">
            <Search className="w-4 h-4 text-violet-500" />
            Fields to Enrich
          </h2>
          <div className="flex items-center gap-2">
            <button onClick={selectAll}         className="text-xs text-indigo-600 hover:underline">All</button>
            <span className="text-gray-200">|</span>
            <button onClick={selectNone}        className="text-xs text-gray-400 hover:underline">None</button>
            <span className="text-gray-200">|</span>
            <button onClick={selectMissingOnly} className="text-xs text-amber-600 hover:underline">Missing only</button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {FIELDS.map((field) => {
            const count   = stats ? (stats[field.statKey] ?? 0) : null;
            const checked = selectedFields.has(field.key);
            return (
              <button
                key={field.key}
                onClick={() => toggleField(field.key)}
                className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                  checked
                    ? "border-indigo-400 bg-indigo-50 shadow-sm"
                    : "border-gray-100 hover:border-gray-200 hover:bg-gray-50"
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  checked ? "bg-indigo-100 text-indigo-600" : `${field.bg} ${field.color}`
                }`}>
                  {field.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${checked ? "text-indigo-800" : "text-gray-700"}`}>
                    {field.label}
                  </p>
                  {statsLoading
                    ? <div className="h-3 w-16 bg-gray-100 rounded animate-pulse mt-0.5" />
                    : count !== null && (
                      <p className={`text-xs mt-0.5 ${count > 0 ? "text-amber-600 font-medium" : "text-gray-400"}`}>
                        {count > 0 ? `${count.toLocaleString()} missing` : "✓ All filled"}
                      </p>
                    )
                  }
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                  checked ? "bg-indigo-500 border-indigo-500" : "border-gray-300"
                }`}>
                  {checked && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Options + run ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-5">
        <h2 className="font-semibold text-gray-800 flex items-center gap-2">
          <RefreshCw className="w-4 h-4 text-indigo-500" />
          Run Options
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">

          {/* Overwrite toggle */}
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-gray-700">Fill mode</p>
            <button
              onClick={() => setOverwrite((v) => !v)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
                overwrite
                  ? "border-amber-400 bg-amber-50"
                  : "border-gray-200 bg-gray-50"
              }`}
            >
              {overwrite
                ? <ToggleRight className="w-5 h-5 text-amber-500 flex-shrink-0" />
                : <ToggleLeft  className="w-5 h-5 text-gray-400 flex-shrink-0" />
              }
              <div className="text-left">
                <p className={`text-sm font-semibold ${overwrite ? "text-amber-800" : "text-gray-700"}`}>
                  {overwrite ? "Overwrite existing values" : "Fill blanks only"}
                </p>
                <p className={`text-xs mt-0.5 ${overwrite ? "text-amber-600" : "text-gray-400"}`}>
                  {overwrite
                    ? "Replaces data even if the field already has a value"
                    : "Only updates fields that are currently empty"}
                </p>
              </div>
            </button>
          </div>

          {/* AI fallback toggle */}
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
              <Bot className="w-3.5 h-3.5 text-violet-500" /> AI Fallback
            </p>
            {stats && !stats.aiAvailable ? (
              <div className="flex items-start gap-2 p-3 rounded-xl border border-gray-200 bg-gray-50 opacity-60">
                <Bot className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm text-gray-500 font-medium">AI not configured</p>
                  <p className="text-xs text-gray-400 mt-0.5">Set <code className="bg-gray-100 px-1 rounded">AI_API_KEY</code> in your environment to enable.</p>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setUseAI((v) => !v)}
                disabled={stats ? !stats.aiAvailable : true}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all disabled:opacity-40 ${
                  useAI
                    ? "border-violet-400 bg-violet-50"
                    : "border-gray-200 bg-gray-50 hover:border-gray-300"
                }`}
              >
                {useAI
                  ? <ToggleRight className="w-5 h-5 text-violet-500 flex-shrink-0" />
                  : <ToggleLeft  className="w-5 h-5 text-gray-400 flex-shrink-0" />
                }
                <div className="text-left">
                  <p className={`text-sm font-semibold flex items-center gap-1.5 ${useAI ? "text-violet-800" : "text-gray-700"}`}>
                    {useAI && <Zap className="w-3.5 h-3.5 text-violet-500" />}
                    {useAI ? "AI fallback enabled" : "Enable AI fallback"}
                  </p>
                  <p className={`text-xs mt-0.5 ${useAI ? "text-violet-600" : "text-gray-400"}`}>
                    {useAI
                      ? `Uses ${stats?.aiModel ?? "AI"} when no data found in OpenLibrary or Google Books`
                      : "Use AI to fill fields when both APIs return nothing"}
                  </p>
                  {useAI && (
                    <p className="text-xs text-violet-500 mt-1 flex items-center gap-1">
                      <span>🇰🇭</span> Khmer-title books use AI as <strong>primary source</strong>
                    </p>
                  )}
                </div>
              </button>
            )}
          </div>

          {/* Batch size */}
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-gray-700">Books per run</p>
            <div className="flex flex-wrap gap-2">
              {BATCH_SIZES.map((n) => (
                <button
                  key={n}
                  onClick={() => setBatchSize(n)}
                  className={`px-3 py-2 rounded-lg border text-sm font-semibold transition-all ${
                    batchSize === n
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                      : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"
                  }`}
                >
                  {n}
                </button>
              ))}
              <input
                type="number"
                min={1} max={500}
                value={batchSize}
                onChange={(e) => setBatchSize(Math.max(1, Math.min(500, parseInt(e.target.value) || 1)))}
                className="w-20 px-2 py-2 border border-gray-200 rounded-lg text-sm text-center font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <p className="text-xs text-gray-400 flex items-center gap-1">
              <Info className="w-3 h-3" />
              Runs {batchSize} books per click. Run again to process the next batch.
            </p>
          </div>
        </div>

        {/* Info bar */}
        {selectedFields.size > 0 && stats && !statsLoading && (
          <div className="flex items-start gap-2 text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2.5">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              Will process up to <strong>{batchSize}</strong> books from&nbsp;
              <strong>{totalMissingSelected.toLocaleString()}</strong> books with missing data
              across <strong>{selectedFields.size}</strong> selected field{selectedFields.size !== 1 ? "s" : ""}.
              Source: OpenLibrary + Google Books{Array.from(selectedFields).includes("cover") ? " + eLibrary Cambodia (cover fallback)" : ""}.
            </span>
          </div>
        )}

        {/* Run button */}
        <button
          onClick={runEnrich}
          disabled={running || selectedFields.size === 0}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold text-sm hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm shadow-indigo-200 active:scale-[0.99]"
        >
          {running
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Enriching books — please wait…</>
            : <><Sparkles className="w-4 h-4" /> Run Auto-Fill ({batchSize} books)</>
          }
        </button>
      </div>

      {/* ── Running overlay ── */}
      {running && (
        <div className="bg-white rounded-xl border border-indigo-200 shadow-sm p-6">
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              <div className="w-12 h-12 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin" />
              <Sparkles className="w-4 h-4 text-indigo-400 absolute inset-0 m-auto" />
            </div>
            <div>
              <p className="font-semibold text-indigo-800">
                Auto-filling {batchSize} books…
              </p>
              <p className="text-sm text-indigo-500 mt-0.5">
                Fetching from OpenLibrary and Google Books. This may take up to 30 seconds.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {Array.from(selectedFields).map((k) => {
                  const f = FIELDS.find((x) => x.key === k)!;
                  return (
                    <span key={k} className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium ${f.bg} ${f.color}`}>
                      {f.icon} {f.label}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="mt-4 h-1.5 rounded-full bg-indigo-100 overflow-hidden">
            <div className="h-full bg-indigo-500 animate-pulse rounded-full w-full" />
          </div>
        </div>
      )}

      {/* ── Results ── */}
      {result && !running && (
        <div className="space-y-4">

          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Processed",  value: result.processed, icon: <BookOpen    className="w-4 h-4" />, color: "text-gray-700",   bg: "bg-gray-50",   border: "border-gray-200"   },
              { label: "Updated",    value: result.updated,   icon: <CheckCircle2 className="w-4 h-4" />, color: "text-green-700",  bg: "bg-green-50",  border: "border-green-200"  },
              { label: "Not Found",  value: result.notFound,  icon: <AlertTriangle className="w-4 h-4" />, color: "text-amber-700",  bg: "bg-amber-50",  border: "border-amber-200"  },
              { label: "Errors",     value: result.errors,    icon: <XCircle      className="w-4 h-4" />, color: "text-red-700",    bg: "bg-red-50",    border: "border-red-200"    },
            ].map(({ label, value, icon, color, bg, border }) => (
              <div key={label} className={`rounded-xl border ${border} ${bg} p-4 flex items-center gap-3`}>
                <div className={`${color} shrink-0`}>{icon}</div>
                <div>
                  <p className={`text-xl font-bold ${color}`}>{value.toLocaleString()}</p>
                  <p className="text-xs text-gray-500">{label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Detail table */}
          {result.results.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-semibold text-gray-800 text-sm">Results Detail</h3>
                <span className="text-xs text-gray-400">{result.results.length} books processed</span>
              </div>
              <div className="divide-y divide-gray-50 max-h-[480px] overflow-y-auto">
                {pagedResults.map((r) => (
                  <div key={r.id} className="flex items-start gap-3 px-5 py-3">
                    <div className="mt-0.5 shrink-0">
                      {r.error
                        ? <XCircle      className="w-4 h-4 text-red-400" />
                        : r.updated
                          ? <CheckCircle2 className="w-4 h-4 text-green-500" />
                          : <AlertTriangle className="w-4 h-4 text-amber-400" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{r.title}</p>
                      <p className="text-xs text-gray-400 font-mono mt-0.5">ISBN: {r.isbn}</p>
                      {r.updated && r.fieldsUpdated.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {r.fieldsUpdated.map((f) => {
                            const meta = FIELDS.find((x) => x.key === f as EnrichField);
                            return (
                              <span key={f} className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${meta?.bg ?? "bg-gray-100"} ${meta?.color ?? "text-gray-600"}`}>
                                {meta?.icon} {meta?.label ?? f}
                              </span>
                            );
                          })}
                        </div>
                      )}
                      {r.error && <p className="text-xs text-red-500 mt-1">{r.error}</p>}
                      {!r.updated && !r.error && <p className="text-xs text-amber-600 mt-1">No matching data found</p>}
                    </div>
                    <div className="shrink-0">
                      <SourceBadge source={r.source} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                  <span>Page {resultPage} of {totalPages}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setResultPage((p) => Math.max(1, p - 1))}
                      disabled={resultPage === 1}
                      className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 transition-colors"
                    >← Prev</button>
                    <button
                      onClick={() => setResultPage((p) => Math.min(totalPages, p + 1))}
                      disabled={resultPage === totalPages}
                      className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 transition-colors"
                    >Next →</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Run again */}
          <button
            onClick={runEnrich}
            disabled={running}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-indigo-200 text-indigo-600 text-sm font-medium hover:bg-indigo-50 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Run again for next {batchSize} books
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          eLibrary Cambodia — bulk cover fetch (title-based, no ISBN needed)
      ══════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

        {/* Header */}
        <button
          onClick={() => setElibOpen((v) => !v)}
          className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
              <Flag className="w-4 h-4 text-red-500" />
            </div>
            <div className="text-left">
              <p className="font-semibold text-gray-900 text-sm">eLibrary Cambodia — Cover Fetch</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Searches by title — works on all books, no ISBN required. Best for Khmer books.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {elibMissing !== null && (
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                elibMissing === 0 ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
              }`}>
                {elibMissing === 0 ? "All covered ✓" : `${elibMissing.toLocaleString()} without cover`}
              </span>
            )}
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${elibOpen ? "rotate-180" : ""}`} />
          </div>
        </button>

        {elibOpen && (
          <div className="px-6 pb-6 pt-2 space-y-4 border-t border-gray-100">

            {/* Info */}
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5 text-xs text-amber-700">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                Searches <strong>elibraryofcambodia.org</strong> by title for each book without a cover.
                Uses the Khmer title if available, otherwise the English title.
                Rate-limited to ~1 book/sec — process in batches and come back later for large libraries.
              </span>
            </div>

            {/* Batch size */}
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1.5">Books per batch</p>
              <div className="flex flex-wrap gap-2">
                {[10, 20, 30, 50].map((n) => (
                  <button key={n} type="button" onClick={() => setElibBatch(n)}
                    className={`px-3 py-1.5 rounded-lg border text-sm font-semibold transition-all ${
                      elibBatch === n
                        ? "bg-red-600 text-white border-red-600"
                        : "bg-white text-gray-600 border-gray-200 hover:border-red-300"
                    }`}>
                    {n}
                  </button>
                ))}
                <p className="text-xs text-gray-400 self-center ml-1">
                  ~{Math.round(elibBatch * 0.8)}s per batch
                </p>
              </div>
            </div>

            {/* Progress bar */}
            {(elibProcessed > 0 || elibRunning) && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{elibProcessed.toLocaleString()} books processed · <strong className="text-green-600">{elibFound} covers found</strong></span>
                  {elibDone && <span className="text-green-600 font-medium">✓ Complete</span>}
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  {elibMissing !== null && elibMissing + elibProcessed > 0 && (
                    <div
                      className="h-full bg-red-500 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, (elibProcessed / (elibMissing + elibProcessed)) * 100)}%` }}
                    />
                  )}
                </div>
              </div>
            )}

            {/* Running state */}
            {elibRunning && (
              <div className="flex items-center gap-3 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-700">
                <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                <span>Searching eLibrary Cambodia for {elibBatch} books — please wait…</span>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3 flex-wrap">
              {(!elibRunning && !elibDone) && (
                <button
                  onClick={() => runElibBatch(elibOffset, elibProcessed === 0)}
                  disabled={elibRunning || elibMissing === 0}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  <Search className="w-4 h-4" />
                  {elibProcessed === 0
                    ? `Fetch covers (${elibBatch} books)`
                    : `Continue next ${elibBatch}`}
                </button>
              )}
              {elibProcessed > 0 && !elibRunning && (
                <button
                  onClick={() => { setElibOffset(0); setElibDone(false); runElibBatch(0, true); }}
                  disabled={elibRunning}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Start over
                </button>
              )}
            </div>

            {/* Results mini-grid */}
            {elibResults.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Last batch results ({elibResults.filter((r) => r.updated).length} found / {elibResults.length} checked)
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 max-h-64 overflow-y-auto">
                  {elibResults.map((r) => (
                    <div key={r.id} className={`rounded-lg overflow-hidden border text-xs ${
                      r.updated ? "border-green-200" : "border-gray-100"
                    }`}>
                      {r.coverUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.coverUrl} alt={r.title} className="w-full aspect-[3/4] object-cover" />
                      ) : (
                        <div className="w-full aspect-[3/4] bg-gray-100 flex items-center justify-center">
                          <ImageIcon className="w-5 h-5 text-gray-300" />
                        </div>
                      )}
                      <p className="px-1.5 py-1 text-[10px] text-gray-500 truncate">{r.title}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
