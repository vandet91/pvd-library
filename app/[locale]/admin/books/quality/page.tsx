"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import {
  ShieldAlert, ArrowLeft, ChevronRight, RefreshCw,
  Barcode, User, Globe, FileText, ImageIcon,
  Calendar, BookCopy, Building2, Tag, Hash,
  Loader2, BookOpen, ExternalLink, ChevronLeft,
  ChevronRight as ChevronRightIcon, AlertTriangle,
  Wand2, CheckCircle2, XCircle,
} from "lucide-react";
import type { IssueKey, QualityStats, BookQualityRow } from "@/app/api/books/quality/route";

/* ── Issue definitions ──────────────────────────────────────────────────────── */

interface IssueDef {
  key:         IssueKey;
  label:       string;
  description: string;
  icon:        React.ReactNode;
  color:       string;
  bg:          string;
  border:      string;
  severity:    "high" | "medium" | "low";
}

const ISSUES: IssueDef[] = [
  // ── High — critical for cataloging & discovery ──
  { key: "no_isbn",        label: "No ISBN",           description: "Books with no ISBN number",                    icon: <Hash      className="w-4 h-4" />, color: "text-red-700",    bg: "bg-red-50",     border: "border-red-200",    severity: "high"   },
  { key: "invalid_isbn",   label: "Invalid ISBN",      description: "ISBN that fails checksum validation",          icon: <Barcode   className="w-4 h-4" />, color: "text-orange-700", bg: "bg-orange-50",  border: "border-orange-200", severity: "high"   },
  { key: "no_author",      label: "No Author",         description: "Books without a linked author",                icon: <User      className="w-4 h-4" />, color: "text-rose-700",   bg: "bg-rose-50",    border: "border-rose-200",   severity: "high"   },
  // ── Medium — affects browsability & member experience ──
  { key: "no_category",    label: "No Category",       description: "Books not assigned to any category",           icon: <Tag       className="w-4 h-4" />, color: "text-pink-700",   bg: "bg-pink-50",    border: "border-pink-200",   severity: "medium" },
  { key: "no_language",    label: "No Language",       description: "Books with no language set",                   icon: <Globe     className="w-4 h-4" />, color: "text-blue-700",   bg: "bg-blue-50",    border: "border-blue-200",   severity: "medium" },
  { key: "no_description", label: "No Description",    description: "Books with no description or summary",         icon: <FileText  className="w-4 h-4" />, color: "text-indigo-700", bg: "bg-indigo-50",  border: "border-indigo-200", severity: "medium" },
  // ── Low — enrichment & completeness ──
  { key: "no_audience",    label: "No Audience Level", description: "Books with audience level set to Unspecified", icon: <BookOpen  className="w-4 h-4" />, color: "text-purple-700", bg: "bg-purple-50",  border: "border-purple-200", severity: "low"    },
  { key: "no_publisher",   label: "No Publisher",      description: "Books without a linked publisher",             icon: <Building2 className="w-4 h-4" />, color: "text-cyan-700",   bg: "bg-cyan-50",    border: "border-cyan-200",   severity: "low"    },
  { key: "no_cover",       label: "No Cover",          description: "Books with no cover image URL",                icon: <ImageIcon className="w-4 h-4" />, color: "text-violet-700", bg: "bg-violet-50",  border: "border-violet-200", severity: "low"    },
  { key: "no_year",        label: "No Publish Year",   description: "Books with no publication year",               icon: <Calendar  className="w-4 h-4" />, color: "text-amber-700",  bg: "bg-amber-50",   border: "border-amber-200",  severity: "low"    },
  { key: "no_pages",       label: "No Page Count",     description: "Books with no page count",                     icon: <BookCopy  className="w-4 h-4" />, color: "text-teal-700",   bg: "bg-teal-50",    border: "border-teal-200",   severity: "low"    },
];

const SEVERITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

/* ── Helpers ────────────────────────────────────────────────────────────────── */

function pct(count: number, total: number) {
  if (!total) return "0%";
  return `${Math.round((count / total) * 100)}%`;
}

function SeverityDot({ s }: { s: "high" | "medium" | "low" }) {
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${
      s === "high" ? "bg-red-500" : s === "medium" ? "bg-amber-400" : "bg-gray-300"
    }`} />
  );
}

/* ── Main page ──────────────────────────────────────────────────────────────── */

export default function DataQualityPage() {
  const locale = useLocale();

  const [stats,        setStats]        = useState<QualityStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [activeIssue,  setActiveIssue]  = useState<IssueKey | null>(null);
  const [books,        setBooks]        = useState<BookQualityRow[]>([]);
  const [listLoading,  setListLoading]  = useState(false);
  const [page,         setPage]         = useState(1);
  const [totalPages,   setTotalPages]   = useState(1);
  const [totalBooks,   setTotalBooks]   = useState(0);
  const LIMIT = 50;

  // AI Enrich state
  const [aiEnriching,  setAiEnriching]  = useState(false);
  const [aiEnrichMsg,  setAiEnrichMsg]  = useState<{ text: string; ok: boolean } | null>(null);

  const AI_ENRICHABLE: IssueKey[] = ["no_description", "no_language", "no_audience", "no_category"];

  async function handleAiEnrich() {
    if (!activeIssue || !AI_ENRICHABLE.includes(activeIssue)) return;

    // Fetch all book IDs for this issue (up to 200)
    setAiEnriching(true); setAiEnrichMsg(null);
    try {
      const res = await fetch(`/api/books/quality?issue=${activeIssue}&page=1&limit=200`);
      const data = await res.json();
      const ids: string[] = (data.books ?? []).map((b: BookQualityRow) => b.id);
      if (ids.length === 0) { setAiEnrichMsg({ text: "No books to enrich.", ok: false }); return; }

      const fieldMap: Record<IssueKey, string[]> = {
        no_description: ["description"],
        no_language:    ["language"],
        no_audience:    ["audienceLevel"],
        no_category:    ["category"],
        no_isbn:        [],
        invalid_isbn:   [],
        no_author:      [],
        no_publisher:   [],
        no_cover:       [],
        no_year:        [],
        no_pages:       [],
      };

      const enrichRes = await fetch("/api/books/ai-enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookIds: ids, fields: fieldMap[activeIssue] }),
      });
      const enrichData = await enrichRes.json();
      if (!enrichRes.ok) {
        const { friendlyAiError } = await import("@/lib/ai-error");
        throw new Error(friendlyAiError(new Error(enrichData.error ?? "Enrich failed"), enrichRes));
      }
      setAiEnrichMsg({ text: `AI enriched ${enrichData.enriched} of ${ids.length} books. Errors: ${enrichData.errors}.`, ok: true });
      // Refresh the list
      loadStats();
      if (activeIssue) loadBooks(activeIssue, page);
    } catch (e) {
      setAiEnrichMsg({ text: e instanceof Error ? e.message : "Error", ok: false });
    } finally {
      setAiEnriching(false);
    }
  }

  /* ── Load stats ── */
  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    const res = await fetch("/api/books/quality");
    if (res.ok) setStats(await res.json());
    setStatsLoading(false);
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  /* ── Load book list for an issue ── */
  const loadBooks = useCallback(async (issue: IssueKey, p: number) => {
    setListLoading(true);
    const res = await fetch(`/api/books/quality?issue=${issue}&page=${p}&limit=${LIMIT}`);
    if (res.ok) {
      const data = await res.json();
      setBooks(data.books ?? []);
      setTotalPages(data.pages ?? 1);
      setTotalBooks(data.total ?? 0);
    }
    setListLoading(false);
  }, []);

  function openIssue(key: IssueKey) {
    setActiveIssue(key);
    setPage(1);
    setBooks([]);
    loadBooks(key, 1);
  }

  function changePage(p: number) {
    setPage(p);
    if (activeIssue) loadBooks(activeIssue, p);
  }

  /* ── Sort issues by severity then count ── */
  const sortedIssues = [...ISSUES].sort((a, b) => {
    const so = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (so !== 0) return so;
    const ca = stats ? (stats[a.key] ?? 0) : 0;
    const cb = stats ? (stats[b.key] ?? 0) : 0;
    return cb - ca;
  });

  const activeDef = ISSUES.find((i) => i.key === activeIssue);
  const activeCount = stats && activeIssue ? (stats[activeIssue] ?? 0) : 0;

  /* ── Health score ── */
  const healthScore = stats
    ? Math.max(0, Math.round(100 - (
        (stats.no_isbn        * 3   +
         stats.invalid_isbn   * 3   +
         stats.no_author      * 2   +
         stats.no_category    * 1.5 +
         stats.no_language    * 1   +
         stats.no_description * 0.5 +
         stats.no_audience    * 0.4 +
         stats.no_cover       * 0.5 +
         stats.no_year        * 0.3 +
         stats.no_pages       * 0.2 +
         stats.no_publisher   * 0.2) / Math.max(1, stats.total) * 10
      )))
    : null;

  return (
    <div className="space-y-6 w-full">

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-3">
          <Link href={`/${locale}/admin/books`} className="hover:text-gray-600 flex items-center gap-1 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Books
          </Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-gray-700 font-medium">Data Quality</span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <ShieldAlert className="w-6 h-6 text-amber-500" />
              Data Quality
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Identify books with missing or invalid metadata so you can fix or enrich them.
            </p>
          </div>
          <button onClick={loadStats} disabled={statsLoading}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors shrink-0">
            <RefreshCw className={`w-3.5 h-3.5 ${statsLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Health score + total */}
      {!statsLoading && stats && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex flex-col sm:flex-row items-center gap-5">
          {/* Score ring */}
          <div className="relative w-24 h-24 shrink-0">
            <svg viewBox="0 0 36 36" className="w-24 h-24 -rotate-90">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#f3f4f6" strokeWidth="3" />
              <circle
                cx="18" cy="18" r="15.9" fill="none"
                stroke={healthScore! >= 80 ? "#22c55e" : healthScore! >= 50 ? "#f59e0b" : "#ef4444"}
                strokeWidth="3"
                strokeDasharray={`${healthScore} ${100 - healthScore!}`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-black text-gray-800">{healthScore}</span>
              <span className="text-[10px] text-gray-400 font-medium -mt-0.5">/ 100</span>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-lg font-bold text-gray-800">
              {healthScore! >= 80 ? "Good quality" : healthScore! >= 50 ? "Needs attention" : "Poor data quality"}
            </p>
            <p className="text-sm text-gray-500 mt-0.5">
              {stats.total.toLocaleString()} total books in the catalog.
            </p>
            <div className="flex flex-wrap gap-3 mt-3">
              {(["high", "medium", "low"] as const).map((sev) => {
                const issues = ISSUES.filter((i) => i.severity === sev);
                const count  = issues.reduce((s, i) => s + (stats[i.key] ?? 0), 0);
                return (
                  <span key={sev} className="flex items-center gap-1.5 text-xs text-gray-600">
                    <SeverityDot s={sev} />
                    <span className="capitalize font-medium">{sev}</span>
                    <span className="text-gray-400">{count.toLocaleString()} issues</span>
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Two-column: cards left, book list right */}
      <div className="flex gap-5 items-start">

        {/* ── Left: issue cards ── */}
        <div className="w-80 shrink-0 space-y-1.5">
          {/* Severity group labels */}
          {(["high", "medium", "low"] as const).map((sev) => {
            const group = sortedIssues.filter((i) => i.severity === sev);
            return (
              <div key={sev}>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 px-1 pt-2 pb-1">
                  {sev === "high" ? "Critical" : sev === "medium" ? "Important" : "Enrichment"}
                </p>
                {group.map((issue) => {
                  const count   = stats ? (stats[issue.key] ?? 0) : null;
                  const pctStr  = stats ? pct(stats[issue.key] ?? 0, stats.total) : null;
                  const active  = activeIssue === issue.key;
                  const isEmpty = count === 0;

                  return (
                    <button
                      key={issue.key}
                      onClick={() => !isEmpty && openIssue(issue.key)}
                      disabled={statsLoading || isEmpty}
                      className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all group ${
                        active
                          ? `${issue.border} ${issue.bg} shadow-sm`
                          : isEmpty
                            ? "border-transparent bg-gray-50 opacity-50 cursor-default"
                            : "border-transparent hover:border-gray-200 hover:bg-gray-50 cursor-pointer"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                          isEmpty ? "bg-gray-100 text-gray-300" : `${issue.bg} ${issue.color}`
                        }`}>
                          {issue.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <p className={`text-xs font-semibold truncate ${active ? issue.color : isEmpty ? "text-gray-400" : "text-gray-700"}`}>
                              {issue.label}
                            </p>
                            <span className={`text-xs font-bold shrink-0 ${isEmpty ? "text-gray-300" : issue.color}`}>
                              {statsLoading ? "…" : count?.toLocaleString() ?? "—"}
                            </span>
                          </div>
                          {!isEmpty && stats && !statsLoading && (
                            <div className="mt-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${issue.bg.replace("-50", "-400")}`}
                                style={{ width: pctStr ?? "0%" }} />
                            </div>
                          )}
                        </div>
                        {!isEmpty && !statsLoading && (
                          <ChevronRightIcon className={`w-3 h-3 shrink-0 transition-transform ${active ? `rotate-90 ${issue.color}` : "text-gray-300"}`} />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* ── Right: book list ── */}
        <div className="flex-1 min-w-0">
          {!activeIssue ? (
            <div className="bg-white rounded-xl border border-dashed border-gray-200 flex flex-col items-center justify-center py-20 text-center">
              <ShieldAlert className="w-10 h-10 text-gray-200 mb-3" />
              <p className="text-sm text-gray-400 font-medium">Select an issue on the left</p>
              <p className="text-xs text-gray-300 mt-1">to browse affected books</p>
            </div>
          ) : activeDef && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {/* List header */}
          <div className={`px-5 py-4 border-b ${activeDef.border} ${activeDef.bg} flex items-center justify-between gap-3`}>
            <div className="flex items-center gap-2">
              <span className={activeDef.color}>{activeDef.icon}</span>
              <div>
                <h3 className={`font-semibold text-sm ${activeDef.color}`}>{activeDef.label}</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {listLoading ? "Loading…" : `${totalBooks.toLocaleString()} books`}
                  {" · Page "}{page} of {totalPages}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* AI Enrich All — only for AI-enrichable issues */}
              {AI_ENRICHABLE.includes(activeIssue as IssueKey) && (
                <button
                  onClick={handleAiEnrich}
                  disabled={aiEnriching}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-medium hover:bg-violet-700 disabled:opacity-50 transition-colors"
                >
                  {aiEnriching ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                  {aiEnriching ? "Enriching…" : "AI Enrich All"}
                </button>
              )}
              {/* Link to ISBN Auto-Fill for enrichable issues */}
              {["no_description","no_cover","no_year","no_pages","no_language","no_author","no_publisher"].includes(activeIssue) && (
                <Link
                  href={`/${locale}/admin/books/enrich`}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Auto-Fill <ExternalLink className="w-3 h-3" />
                </Link>
              )}
              <button onClick={() => setActiveIssue(null)} className="text-gray-400 hover:text-gray-600 text-xs px-2 py-1 rounded hover:bg-white/60 transition-colors">
                Close ✕
              </button>
            </div>
          </div>

          {/* AI enrich result banner */}
          {aiEnrichMsg && (
            <div className={`flex items-center gap-2 px-5 py-2 text-xs font-medium border-b ${aiEnrichMsg.ok ? "bg-violet-50 text-violet-800 border-violet-100" : "bg-red-50 text-red-700 border-red-100"}`}>
              {aiEnrichMsg.ok
                ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                : <XCircle className="w-3.5 h-3.5 shrink-0" />}
              {aiEnrichMsg.text}
              <button onClick={() => setAiEnrichMsg(null)} className="ml-auto opacity-60 hover:opacity-100">✕</button>
            </div>
          )}

          {/* Book rows */}
          {listLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" /> Loading…
            </div>
          ) : books.length === 0 ? (
            <div className="text-center py-12">
              <BookOpen className="w-10 h-10 text-gray-200 mx-auto mb-2" />
              <p className="text-gray-400 text-sm">No books found for this issue.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {books.map((book) => (
                <div key={book.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                  {/* Cover thumbnail */}
                  <div className="w-8 h-10 rounded bg-gray-100 border border-gray-200 overflow-hidden shrink-0 flex items-center justify-center">
                    {book.coverImage
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={book.coverImage} alt="" className="w-full h-full object-cover" />
                      : <ImageIcon className="w-3.5 h-3.5 text-gray-300" />
                    }
                  </div>

                  {/* Book info — multi-column on wide layout */}
                  <div className="flex-1 min-w-0 grid grid-cols-1 lg:grid-cols-[2fr_1fr_1fr_1fr] gap-x-4 items-center">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{book.title}</p>
                      {book.author
                        ? <p className="text-xs text-gray-400 truncate">{book.author}</p>
                        : <p className="text-xs text-rose-400 italic">No author</p>
                      }
                    </div>
                    <div className="hidden lg:block">
                      {book.isbn
                        ? <span className="text-xs font-mono text-gray-500">{book.isbn}</span>
                        : <span className="text-xs text-red-400 italic">No ISBN</span>
                      }
                    </div>
                    <div className="hidden lg:block">
                      {book.language
                        ? <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full font-mono">{book.language}</span>
                        : <span className="text-xs text-amber-400 italic">No language</span>
                      }
                    </div>
                    <div className="hidden lg:block">
                      {book.category
                        ? <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{book.category}</span>
                        : <span className="text-xs text-gray-300 italic">No category</span>
                      }
                    </div>
                  </div>

                  {/* Issue highlight */}
                  <div className="shrink-0">
                    <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium border ${activeDef.bg} ${activeDef.color} ${activeDef.border}`}>
                      <AlertTriangle className="w-2.5 h-2.5" />
                      {activeDef.label}
                    </span>
                  </div>

                  {/* Edit link */}
                  <Link
                    href={`/${locale}/admin/books/${book.id}`}
                    className="shrink-0 flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
                  >
                    Edit <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
              <span>{totalBooks.toLocaleString()} books · Page {page} of {totalPages}</span>
              <div className="flex items-center gap-1">
                <button onClick={() => changePage(1)} disabled={page === 1}
                  className="px-2 py-1.5 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40">«</button>
                <button onClick={() => changePage(page - 1)} disabled={page === 1}
                  className="px-2 py-1.5 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40">
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const p = Math.max(1, Math.min(totalPages - 4, page - 2)) + i;
                  return (
                    <button key={p} onClick={() => changePage(p)}
                      className={`w-7 h-7 rounded border text-xs font-medium transition-colors ${
                        p === page ? "bg-indigo-600 text-white border-indigo-600" : "border-gray-200 hover:bg-gray-50"
                      }`}>
                      {p}
                    </button>
                  );
                })}
                <button onClick={() => changePage(page + 1)} disabled={page === totalPages}
                  className="px-2 py-1.5 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40">
                  <ChevronRightIcon className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => changePage(totalPages)} disabled={page === totalPages}
                  className="px-2 py-1.5 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40">»</button>
              </div>
            </div>
          )}
          </div>
          )}
        </div>

      </div>{/* end two-column */}
    </div>
  );
}
