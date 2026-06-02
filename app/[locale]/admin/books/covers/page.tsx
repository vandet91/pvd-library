"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import {
  ImageOff, ImageIcon, CheckCircle2, XCircle, AlertTriangle,
  Clock, Loader2, Trash2, RefreshCw, ChevronRight, ArrowLeft,
  ShieldCheck, ScanSearch, Info,
} from "lucide-react";
import type { CoverAuditItem } from "@/app/api/books/covers/audit/route";

/* ── Status meta ─────────────────────────────────────────────────────────────── */

const STATUS_META: Record<CoverAuditItem["status"], {
  label: string; icon: React.ReactNode; row: string; badge: string;
}> = {
  ok:        { label: "Valid image",    icon: <CheckCircle2 className="w-4 h-4" />, row: "",                        badge: "bg-green-50 text-green-700 border-green-200"  },
  not_image: { label: "Not an image",   icon: <XCircle      className="w-4 h-4" />, row: "bg-red-50/40",            badge: "bg-red-50 text-red-700 border-red-200"        },
  broken:    { label: "Broken link",    icon: <AlertTriangle className="w-4 h-4" />, row: "bg-amber-50/40",         badge: "bg-amber-50 text-amber-700 border-amber-200"  },
  timeout:   { label: "Timed out",      icon: <Clock        className="w-4 h-4" />, row: "bg-gray-50",              badge: "bg-gray-100 text-gray-600 border-gray-200"    },
};

const BATCH_SIZES = [50, 100, 200, 500];

/* ── Page ────────────────────────────────────────────────────────────────────── */

export default function CoverAuditPage() {
  const locale = useLocale();

  const [batchSize,   setBatchSize]   = useState(200);
  const [scanning,    setScanning]    = useState(false);
  const [progress,    setProgress]    = useState<string | null>(null);
  const [results,     setResults]     = useState<CoverAuditItem[] | null>(null);
  const [summary,     setSummary]     = useState<{ total: number; ok: number; invalid: number } | null>(null);
  const [selected,    setSelected]    = useState<Set<string>>(new Set());
  const [removing,    setRemoving]    = useState(false);
  const [filter,      setFilter]      = useState<"all" | "invalid" | "ok">("all");
  const [resultPage,  setResultPage]  = useState(1);
  const PAGE_SIZE = 25;

  /* ── Scan ── */
  const scan = useCallback(async () => {
    setScanning(true);
    setResults(null);
    setSummary(null);
    setSelected(new Set());
    setResultPage(1);
    setProgress(`Checking up to ${batchSize} cover URLs…`);

    const res  = await fetch("/api/books/covers/audit", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ limit: batchSize }),
    });

    setScanning(false);
    setProgress(null);

    if (!res.ok) return;
    const data = await res.json();
    setResults(data.results ?? []);
    setSummary({ total: data.total, ok: data.ok, invalid: data.invalid });

    // Auto-select all invalid ones
    const invalidIds = (data.results as CoverAuditItem[])
      .filter((r) => r.status !== "ok")
      .map((r) => r.id);
    setSelected(new Set(invalidIds));
  }, [batchSize]);

  /* ── Remove selected ── */
  async function removeSelected() {
    if (selected.size === 0 || removing) return;
    setRemoving(true);
    const res = await fetch("/api/books/covers/remove", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ ids: Array.from(selected) }),
    });
    setRemoving(false);
    if (!res.ok) return;
    const { removed } = await res.json();

    // Remove from results list
    setResults((prev) => prev?.filter((r) => !selected.has(r.id)) ?? null);
    setSummary((prev) => prev
      ? { ...prev, total: prev.total - removed, invalid: prev.invalid - removed }
      : null
    );
    setSelected(new Set());
  }

  /* ── Selection helpers ── */
  function toggleItem(id: string) {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function selectAllInvalid() {
    setSelected(new Set(results?.filter((r) => r.status !== "ok").map((r) => r.id) ?? []));
  }
  function selectNone() { setSelected(new Set()); }

  /* ── Filtered + paged results ── */
  const filtered = results?.filter((r) =>
    filter === "all"     ? true :
    filter === "invalid" ? r.status !== "ok" :
    r.status === "ok"
  ) ?? [];
  const totalPages  = Math.ceil(filtered.length / PAGE_SIZE);
  const paged       = filtered.slice((resultPage - 1) * PAGE_SIZE, resultPage * PAGE_SIZE);
  const invalidCount = results?.filter((r) => r.status !== "ok").length ?? 0;

  /* ── Render ── */
  return (
    <div className="space-y-6 max-w-5xl">

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-3">
          <Link href={`/${locale}/admin/books`} className="hover:text-gray-600 flex items-center gap-1">
            <ArrowLeft className="w-3.5 h-3.5" /> Books
          </Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-gray-700 font-medium">Cover Audit</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ImageOff className="w-6 h-6 text-rose-500" />
          Cover URL Audit
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Scan cover image URLs and remove any that are broken, non-images, or placeholder files.
        </p>
      </div>

      {/* Scan config */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
        <h2 className="font-semibold text-gray-800 flex items-center gap-2">
          <ScanSearch className="w-4 h-4 text-rose-500" />
          Scan Settings
        </h2>

        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-gray-700">Books to scan</p>
            <div className="flex flex-wrap gap-2">
              {BATCH_SIZES.map((n) => (
                <button
                  key={n}
                  onClick={() => setBatchSize(n)}
                  disabled={scanning}
                  className={`px-3 py-2 rounded-lg border text-sm font-semibold transition-all ${
                    batchSize === n
                      ? "bg-rose-600 text-white border-rose-600 shadow-sm"
                      : "bg-white text-gray-600 border-gray-200 hover:border-rose-300"
                  }`}
                >
                  {n}
                </button>
              ))}
              <input
                type="number"
                min={1} max={1000}
                value={batchSize}
                onChange={(e) => setBatchSize(Math.max(1, Math.min(1000, parseInt(e.target.value) || 1)))}
                disabled={scanning}
                className="w-20 px-2 py-2 border border-gray-200 rounded-lg text-sm text-center font-mono focus:outline-none focus:ring-2 focus:ring-rose-400 disabled:opacity-50"
              />
            </div>
          </div>

          <button
            onClick={scan}
            disabled={scanning}
            className="flex items-center gap-2 px-5 py-2.5 bg-rose-600 text-white rounded-xl text-sm font-semibold hover:bg-rose-700 disabled:opacity-50 transition-all shadow-sm active:scale-[0.99]"
          >
            {scanning
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Scanning…</>
              : <><ScanSearch className="w-4 h-4" /> Scan Covers</>
            }
          </button>
        </div>

        <div className="flex items-start gap-2 text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-gray-400" />
          Each URL is checked with an HTTP HEAD request. Checks Content-Type (must be <code className="bg-gray-100 px-1 rounded">image/*</code>),
          HTTP status (must be 2xx), and filters out placeholder images (e.g. OpenLibrary's 1×1 GIF). Timeout: 7s per URL.
        </div>
      </div>

      {/* Scanning progress */}
      {scanning && (
        <div className="bg-white rounded-xl border border-rose-200 p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full border-4 border-rose-100 border-t-rose-500 animate-spin shrink-0" />
          <div>
            <p className="font-semibold text-rose-800">{progress}</p>
            <p className="text-sm text-rose-400 mt-0.5">Sending HEAD requests in parallel — this may take a moment.</p>
            <div className="mt-2 h-1.5 w-64 bg-rose-100 rounded-full overflow-hidden">
              <div className="h-full bg-rose-400 animate-pulse w-full rounded-full" />
            </div>
          </div>
        </div>
      )}

      {/* Summary + actions */}
      {summary && results && !scanning && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Scanned",     value: summary.total,   icon: <ImageIcon     className="w-4 h-4" />, cls: "text-gray-700",   bg: "bg-gray-50",   border: "border-gray-200"   },
              { label: "Valid",       value: summary.ok,      icon: <ShieldCheck   className="w-4 h-4" />, cls: "text-green-700",  bg: "bg-green-50",  border: "border-green-200"  },
              { label: "Invalid",     value: summary.invalid, icon: <XCircle       className="w-4 h-4" />, cls: "text-red-700",    bg: "bg-red-50",    border: "border-red-200"    },
              { label: "Selected",    value: selected.size,   icon: <Trash2        className="w-4 h-4" />, cls: "text-rose-700",   bg: "bg-rose-50",   border: "border-rose-200"   },
            ].map(({ label, value, icon, cls, bg, border }) => (
              <div key={label} className={`rounded-xl border ${border} ${bg} p-4 flex items-center gap-3`}>
                <div className={`${cls} shrink-0`}>{icon}</div>
                <div>
                  <p className={`text-xl font-bold ${cls}`}>{value.toLocaleString()}</p>
                  <p className="text-xs text-gray-500">{label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Bulk action bar */}
          {invalidCount > 0 && (
            <div className="flex flex-wrap items-center gap-3 p-3 bg-rose-50 border border-rose-200 rounded-xl">
              <div className="flex items-center gap-2">
                <button onClick={selectAllInvalid} className="text-xs font-medium text-rose-700 hover:underline">
                  Select all invalid ({invalidCount})
                </button>
                <span className="text-rose-200">|</span>
                <button onClick={selectNone} className="text-xs text-gray-500 hover:underline">
                  Deselect all
                </button>
              </div>
              <div className="ml-auto flex items-center gap-2">
                {selected.size > 0 && (
                  <span className="text-xs text-rose-700 font-medium">{selected.size} selected</span>
                )}
                <button
                  onClick={removeSelected}
                  disabled={selected.size === 0 || removing}
                  className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 text-white rounded-lg text-sm font-semibold hover:bg-rose-700 disabled:opacity-40 transition-colors"
                >
                  {removing
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Removing…</>
                    : <><Trash2  className="w-3.5 h-3.5" /> Remove {selected.size > 0 ? selected.size : ""} Cover{selected.size !== 1 ? "s" : ""}</>
                  }
                </button>
              </div>
            </div>
          )}

          {invalidCount === 0 && (
            <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
              <ShieldCheck className="w-5 h-5 text-green-600 shrink-0" />
              <div>
                <p className="font-semibold text-green-800">All covers look good!</p>
                <p className="text-sm text-green-600 mt-0.5">Every URL returned a valid image content-type.</p>
              </div>
            </div>
          )}

          {/* Filter tabs */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex border-b border-gray-100">
              {([
                ["all",     `All (${results.length})`],
                ["invalid", `Invalid (${invalidCount})`],
                ["ok",      `Valid (${summary.ok})`],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => { setFilter(key); setResultPage(1); }}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                    filter === key
                      ? "border-rose-500 text-rose-600"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="divide-y divide-gray-50 max-h-[520px] overflow-y-auto">
              {paged.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-10">No items to show.</p>
              ) : paged.map((item) => {
                const meta    = STATUS_META[item.status];
                const checked = selected.has(item.id);
                return (
                  <div
                    key={item.id}
                    className={`flex items-start gap-3 px-4 py-3 transition-colors ${meta.row} ${
                      checked && item.status !== "ok" ? "ring-1 ring-inset ring-rose-200" : ""
                    }`}
                  >
                    {/* Checkbox — only for invalid items */}
                    <div className="mt-0.5 shrink-0">
                      {item.status !== "ok" ? (
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleItem(item.id)}
                          className="w-4 h-4 rounded border-gray-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                        />
                      ) : (
                        <div className="w-4 h-4 flex items-center justify-center">
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                        </div>
                      )}
                    </div>

                    {/* Cover thumbnail */}
                    <div className="w-8 h-10 rounded overflow-hidden bg-gray-100 border border-gray-200 flex-shrink-0">
                      {item.status === "ok" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.coverImage} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageOff className="w-3.5 h-3.5 text-gray-300" />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{item.title}</p>
                      <p className="text-xs text-gray-400 font-mono truncate mt-0.5">{item.coverImage}</p>
                      <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                        {item.contentType && (
                          <code className="bg-gray-100 px-1 rounded text-[10px]">{item.contentType.split(";")[0].trim()}</code>
                        )}
                      </p>
                    </div>

                    {/* Status badge */}
                    <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${meta.badge}`}>
                      {meta.icon} {meta.label}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                <span>{filtered.length} items · Page {resultPage} of {totalPages}</span>
                <div className="flex gap-2">
                  <button onClick={() => setResultPage((p) => Math.max(1, p - 1))} disabled={resultPage === 1}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40">
                    ← Prev
                  </button>
                  <button onClick={() => setResultPage((p) => Math.min(totalPages, p + 1))} disabled={resultPage === totalPages}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40">
                    Next →
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Scan again */}
          <button
            onClick={scan}
            disabled={scanning}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-rose-200 text-rose-600 text-sm font-medium hover:bg-rose-50 transition-colors"
          >
            <RefreshCw className="w-4 h-4" /> Scan next {batchSize} books
          </button>
        </>
      )}
    </div>
  );
}
