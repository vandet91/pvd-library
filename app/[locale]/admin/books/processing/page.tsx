"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import {
  Tag, Barcode, Loader2, RefreshCw, CheckCheck, Printer,
  ShoppingBasket, AlertCircle, BookOpen, Filter,
  ChevronRight, CheckCircle2, Circle, Package,
  ScanLine, X, CheckCircle, RotateCcw,
} from "lucide-react";

/* ── Types ─────────────────────────────────────────────────────────────── */

/** Primary queue: any copy with labelPrinted=false, regardless of basket membership */
interface NeedsLabelItem {
  id:         string;
  copyNumber: number;
  barcode:    string | null;
  condition:  string;
  status:     string;
  acquiredAt: string;
  book: { id: string; title: string; isbn: string | null; author: { name: string } | null };
  /** First basket the copy belongs to, if any */
  basketItems: { basketId: string; tagged: boolean; basket: { id: string; name: string } }[];
}

/** Secondary queue: basket items explicitly added for batch processing */
interface UntaggedItem {
  id:       string;
  basketId: string;
  addedAt:  string;
  tagged:   boolean;
  basket: { id: string; name: string };
  book:   { id: string; title: string; isbn: string | null; location: string | null; author: { name: string } | null };
  copy:   { id: string; copyNumber: number; barcode: string | null; rfid: string | null; condition: string; status: string; labelPrinted: boolean };
}

interface NoBarcodeItem {
  id:         string;
  copyNumber: number;
  condition:  string;
  status:     string;
  acquiredAt: string;
  book: { id: string; title: string; isbn: string | null; author: { name: string } | null };
}

interface ProcessingData {
  needsLabel:      NeedsLabelItem[];
  needsLabelTotal: number;
  untagged:        UntaggedItem[];
  noBarcode:       NoBarcodeItem[];
}

/** One entry in the scanner history */
interface ScanResult {
  copyId:         string;
  copyNumber:     number;
  barcode:        string | null;
  alreadyLabeled: boolean;
  book:           { id: string; title: string; author: string | null };
  scannedAt:      Date;
  error?:         string;
}

type Tab = "needslabel" | "inbaskets" | "nobarcode";

/* ── Helpers ────────────────────────────────────────────────────────────── */
function conditionBadge(c: string) {
  const m: Record<string, string> = {
    EXCELLENT: "bg-emerald-100 text-emerald-700",
    GOOD:      "bg-green-100 text-green-700",
    FAIR:      "bg-yellow-100 text-yellow-700",
    POOR:      "bg-orange-100 text-orange-700",
    DAMAGED:   "bg-red-100 text-red-700",
  };
  return (
    <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${m[c] ?? "bg-gray-100 text-gray-500"}`}>
      {c}
    </span>
  );
}

function printLabels(locale: string, copyIds: string[]) {
  if (!copyIds.length) return;
  window.open(
    `/${locale}/print/labels?copyIds=${copyIds.join(",")}&size=medium&copies=1`,
    "_blank",
    "width=900,height=700,menubar=yes,toolbar=yes",
  );
}

/* ── Page ───────────────────────────────────────────────────────────────── */
export default function ProcessingQueuePage() {
  const locale = useLocale();

  const [data,     setData]    = useState<ProcessingData | null>(null);
  const [loading,  setLoading] = useState(true);
  const [loadErr,  setLoadErr] = useState<string | null>(null);
  const [tab,      setTab]     = useState<Tab>("needslabel");
  const [toastMsg, setToast]   = useState<{ text: string; ok: boolean } | null>(null);

  /* Scanner state */
  const [scanValue,    setScanValue]    = useState("");
  const [scanBusy,     setScanBusy]     = useState(false);
  const [scanHistory,  setScanHistory]  = useState<ScanResult[]>([]);
  const [scannerOpen,  setScannerOpen]  = useState(true);
  const scanInputRef = useRef<HTMLInputElement>(null);

  /* "Needs Label" tab state */
  const [labeling,    setLabeling]    = useState<Set<string>>(new Set()); // copy IDs being labeled
  const [labelFilter, setLabelFilter] = useState("");
  const [selected,    setSelected]    = useState<Set<string>>(new Set()); // copy IDs checked for printing

  /* "In Baskets" tab state */
  const [expandedBaskets, setExpandedBaskets] = useState<Set<string>>(new Set());
  const [tagging,         setTagging]         = useState<Set<string>>(new Set());
  const [basketFilter,    setBasketFilter]    = useState("");

  function toast(text: string, ok = true) {
    setToast({ text, ok });
    setTimeout(() => setToast(null), 3200);
  }

  /* ── Load ──────────────────────────────────────────────────────────────── */
  const load = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      const res = await fetch("/api/books/processing");
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? `Server error ${res.status}`);
      }
      setData(await res.json() as ProcessingData);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Failed to load processing queue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* ── Barcode scanner ────────────────────────────────────────────────────── */
  async function handleScan(raw: string) {
    const barcode = raw.trim();
    if (!barcode || scanBusy) return;
    setScanBusy(true);
    setScanValue("");

    try {
      const res  = await fetch("/api/books/processing/scan", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ barcode }),
      });
      const json = await res.json() as Partial<ScanResult> & { error?: string };

      const entry: ScanResult = res.ok
        ? { ...json as ScanResult, scannedAt: new Date() }
        : {
            copyId: "", copyNumber: 0, barcode, alreadyLabeled: false,
            book: { id: "", title: barcode, author: null },
            scannedAt: new Date(),
            error: json.error ?? `Error ${res.status}`,
          };

      setScanHistory((prev) => [entry, ...prev].slice(0, 15));

      if (res.ok && !entry.alreadyLabeled) {
        // Remove from the local queue immediately
        setData((prev) => prev
          ? {
              ...prev,
              needsLabel:      prev.needsLabel.filter((n) => n.id !== entry.copyId),
              needsLabelTotal: Math.max(0, prev.needsLabelTotal - 1),
              untagged:        prev.untagged.filter((u) => u.copy.id !== entry.copyId),
            }
          : prev);
      }
    } catch {
      const entry: ScanResult = {
        copyId: "", copyNumber: 0, barcode, alreadyLabeled: false,
        book: { id: "", title: barcode, author: null },
        scannedAt: new Date(),
        error: "Network error",
      };
      setScanHistory((prev) => [entry, ...prev].slice(0, 15));
    } finally {
      setScanBusy(false);
      // Always re-focus so the next scan lands in the input
      setTimeout(() => scanInputRef.current?.focus(), 50);
    }
  }

  /* ── Mark a single copy as labeled ─────────────────────────────────────── */
  async function markLabelPrinted(item: NeedsLabelItem) {
    setLabeling((s) => new Set(s).add(item.id));
    const res = await fetch(`/api/copies/${item.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ labelPrinted: true }),
    });
    setLabeling((s) => { const ns = new Set(s); ns.delete(item.id); return ns; });
    if (res.ok) {
      // If also in a basket, sync its tagged flag (fire-and-forget)
      const bi = item.basketItems[0];
      if (bi && !bi.tagged) {
        fetch(`/api/baskets/${bi.basketId}/items`, {
          method:  "PATCH",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ copyId: item.id, tagged: true }),
        }).catch(() => {});
      }
      toast("Label marked as applied ✓");
      setData((prev) => prev
        ? { ...prev, needsLabel: prev.needsLabel.filter((n) => n.id !== item.id) }
        : prev);
    } else {
      toast("Failed to update", false);
    }
  }

  /* ── Mark all visible "Needs Label" copies as labeled ───────────────────── */
  async function markAllVisible() {
    const visible = filteredNeedsLabel;
    if (!visible.length) return;
    setLabeling(new Set(visible.map((i) => i.id)));
    await Promise.allSettled(
      visible.map((item) =>
        fetch(`/api/copies/${item.id}`, {
          method:  "PATCH",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ labelPrinted: true }),
        }),
      ),
    );
    setLabeling(new Set());
    toast(`${visible.length} copies marked as labeled`);
    const ids = new Set(visible.map((i) => i.id));
    setData((prev) => prev
      ? { ...prev, needsLabel: prev.needsLabel.filter((n) => !ids.has(n.id)) }
      : prev);
  }

  /* ── Mark basket item as tagged ─────────────────────────────────────────── */
  async function markTagged(item: UntaggedItem) {
    setTagging((s) => new Set(s).add(item.id));
    const res = await fetch(`/api/baskets/${item.basketId}/items`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ copyId: item.copy.id, tagged: true }),
    });
    setTagging((s) => { const ns = new Set(s); ns.delete(item.id); return ns; });
    if (res.ok) {
      fetch(`/api/copies/${item.copy.id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ labelPrinted: true }),
      }).catch(() => {});
      toast("Marked as labeled ✓");
      setData((prev) => prev
        ? { ...prev, untagged: prev.untagged.filter((u) => u.id !== item.id) }
        : prev);
    } else {
      toast("Failed to update", false);
    }
  }

  /* ── Mark entire basket as tagged ───────────────────────────────────────── */
  async function markBasketTagged(basketId: string, basketName: string) {
    setTagging((s) => new Set(s).add(basketId));
    const copyIds = (data?.untagged ?? [])
      .filter((u) => u.basketId === basketId)
      .map((u) => u.copy.id);
    const res = await fetch(`/api/baskets/${basketId}/items`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ all: "tag" }),
    });
    setTagging((s) => { const ns = new Set(s); ns.delete(basketId); return ns; });
    if (res.ok) {
      copyIds.forEach((copyId) =>
        fetch(`/api/copies/${copyId}`, {
          method:  "PATCH",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ labelPrinted: true }),
        }).catch(() => {}),
      );
      toast(`All items in "${basketName}" marked as labeled`);
      setData((prev) => prev
        ? { ...prev, untagged: prev.untagged.filter((u) => u.basketId !== basketId) }
        : prev);
    } else {
      toast("Failed to update basket", false);
    }
  }

  /* ── Selection helpers ──────────────────────────────────────────────────── */
  function toggleCopy(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function toggleBook(bookId: string, copyIds: string[]) {
    const allSelected = copyIds.every((id) => selected.has(id));
    setSelected((prev) => {
      const n = new Set(prev);
      if (allSelected) copyIds.forEach((id) => n.delete(id));
      else             copyIds.forEach((id) => n.add(id));
      return n;
    });
  }

  function toggleAll() {
    const visibleIds = filteredNeedsLabel.filter((i) => i.barcode).map((i) => i.id);
    const allSelected = visibleIds.every((id) => selected.has(id));
    setSelected(allSelected ? new Set() : new Set(visibleIds));
  }

  function clearSelection() { setSelected(new Set()); }

  /* ── Derived ────────────────────────────────────────────────────────────── */
  const filteredNeedsLabel = (data?.needsLabel ?? []).filter((item) =>
    !labelFilter ||
    item.book.title.toLowerCase().includes(labelFilter.toLowerCase()) ||
    item.book.isbn?.includes(labelFilter) ||
    item.barcode?.includes(labelFilter),
  );

  // Group filtered copies by book for the selection UI
  const needsLabelByBook = (() => {
    const map = new Map<string, { bookId: string; title: string; author: string | null; isbn: string | null; copies: NeedsLabelItem[] }>();
    for (const item of filteredNeedsLabel) {
      if (!map.has(item.book.id)) {
        map.set(item.book.id, { bookId: item.book.id, title: item.book.title, author: item.book.author?.name ?? null, isbn: item.book.isbn, copies: [] });
      }
      map.get(item.book.id)!.copies.push(item);
    }
    return [...map.values()];
  })();

  const groupedByBasket = (() => {
    if (!data) return [];
    const map = new Map<string, { basket: UntaggedItem["basket"]; items: UntaggedItem[] }>();
    for (const item of data.untagged) {
      if (!map.has(item.basketId)) map.set(item.basketId, { basket: item.basket, items: [] });
      map.get(item.basketId)!.items.push(item);
    }
    return [...map.values()].filter(
      (g) => !basketFilter || g.basket.name.toLowerCase().includes(basketFilter.toLowerCase()),
    );
  })();

  const needsLabelCount  = data?.needsLabelTotal ?? 0;
  const inBasketsCount   = data?.untagged.length  ?? 0;
  const noBarcodeCount   = data?.noBarcode.length ?? 0;

  /* ── Render ─────────────────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>Loading processing queue…</span>
      </div>
    );
  }

  if (loadErr) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <AlertCircle className="w-10 h-10 text-red-400" />
        <p className="text-red-600 font-medium">{loadErr}</p>
        <button
          onClick={load}
          className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Tag className="w-6 h-6 text-indigo-600" />
            Processing Queue
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Books awaiting physical spine labels or barcode assignment
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* ── Workflow explanation ────────────────────────────────────────── */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 text-sm text-indigo-700 flex items-start gap-3">
        <Package className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <div>
          <span className="font-semibold">Workflow: </span>
          New copy added to catalog
          <span className="mx-2 text-indigo-400">→</span>
          Appears here automatically under <strong>Needs Label</strong>
          <span className="mx-2 text-indigo-400">→</span>
          Print &amp; apply spine label
          <span className="mx-2 text-indigo-400">→</span>
          Click <strong>Mark Labeled</strong>
          <span className="mx-2 text-indigo-400">→</span>
          Done. <span className="text-indigo-500">Baskets are optional — use them to organise batches.</span>
        </div>
      </div>

      {/* ── Barcode scanner panel ──────────────────────────────────────── */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        {/* Header */}
        <button
          type="button"
          onClick={() => {
            setScannerOpen((v) => {
              if (!v) setTimeout(() => scanInputRef.current?.focus(), 80);
              return !v;
            });
          }}
          className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
        >
          <div className="flex items-center gap-2">
            <ScanLine className="w-4 h-4 text-indigo-600" />
            <span className="text-sm font-semibold text-gray-800">Barcode Scanner</span>
            <span className="text-xs text-gray-400">
              — scan after sticking the label to mark it done instantly
            </span>
          </div>
          <div className="flex items-center gap-2">
            {scanHistory.length > 0 && (
              <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                {scanHistory.filter((s) => !s.error && !s.alreadyLabeled).length} labeled this session
              </span>
            )}
            <span className="text-xs text-gray-400">{scannerOpen ? "▲" : "▼"}</span>
          </div>
        </button>

        {scannerOpen && (
          <div className="p-4 space-y-3 bg-white">
            {/* Input */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <ScanLine className={`absolute left-3 top-2.5 w-4 h-4 transition-colors ${
                  scanBusy ? "text-indigo-500 animate-pulse" : "text-gray-400"
                }`} />
                <input
                  ref={scanInputRef}
                  type="text"
                  value={scanValue}
                  autoFocus
                  autoComplete="off"
                  onChange={(e) => setScanValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleScan(scanValue);
                    }
                  }}
                  placeholder={scanBusy ? "Processing…" : "Point scanner here and scan barcode…"}
                  disabled={scanBusy}
                  className="w-full pl-10 pr-4 py-2.5 border-2 border-indigo-300 focus:border-indigo-500 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-gray-50 transition-colors"
                />
              </div>
              {scanHistory.length > 0 && (
                <button
                  type="button"
                  onClick={() => setScanHistory([])}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 px-2 py-2 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0"
                  title="Clear scan history"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Clear
                </button>
              )}
            </div>
            <p className="text-xs text-gray-400">
              Scanners send Enter automatically — just point and scan. Manual entry also works.
            </p>

            {/* Scan history */}
            {scanHistory.length > 0 && (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {scanHistory.map((entry, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${
                      entry.error
                        ? "bg-red-50 border border-red-100"
                        : entry.alreadyLabeled
                          ? "bg-amber-50 border border-amber-100"
                          : "bg-green-50 border border-green-100"
                    }`}
                  >
                    {entry.error ? (
                      <X className="w-4 h-4 text-red-500 flex-shrink-0" />
                    ) : entry.alreadyLabeled ? (
                      <RotateCcw className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    ) : (
                      <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      {entry.error ? (
                        <span className="text-red-700 font-medium">{entry.error}</span>
                      ) : (
                        <>
                          <span className={`font-medium truncate block ${
                            entry.alreadyLabeled ? "text-amber-800" : "text-green-800"
                          }`}>
                            {entry.book.title}
                          </span>
                          {entry.book.author && (
                            <span className="text-xs text-gray-500">{entry.book.author}</span>
                          )}
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 text-right">
                      {!entry.error && (
                        <span className="text-xs text-gray-400 font-mono">
                          #{entry.copyNumber}
                        </span>
                      )}
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        entry.error
                          ? "bg-red-100 text-red-700"
                          : entry.alreadyLabeled
                            ? "bg-amber-100 text-amber-700"
                            : "bg-green-100 text-green-700"
                      }`}>
                        {entry.error
                          ? "Not found"
                          : entry.alreadyLabeled
                            ? "Already labeled"
                            : "✓ Labeled"}
                      </span>
                      <span className="text-xs text-gray-300">
                        {entry.scannedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Summary cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        {[
          {
            key:   "needslabel" as Tab,
            icon:  Tag,
            count: needsLabelCount,
            label: "Needs Label",
            bg:    "bg-amber-100",
            text:  "text-amber-600",
            active:"border-amber-400 bg-amber-50",
            hover: "hover:border-amber-200",
          },
          {
            key:   "inbaskets" as Tab,
            icon:  ShoppingBasket,
            count: inBasketsCount,
            label: "In Baskets",
            bg:    "bg-purple-100",
            text:  "text-purple-600",
            active:"border-purple-400 bg-purple-50",
            hover: "hover:border-purple-200",
          },
          {
            key:   "nobarcode" as Tab,
            icon:  Barcode,
            count: noBarcodeCount,
            label: "No Barcode",
            bg:    "bg-blue-100",
            text:  "text-blue-600",
            active:"border-blue-400 bg-blue-50",
            hover: "hover:border-blue-200",
          },
        ].map(({ key, icon: Icon, count, label, bg, text, active, hover }) => (
          <div
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-xl border p-4 cursor-pointer transition-colors ${
              tab === key ? active : `border-gray-100 bg-white ${hover}`
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center`}>
                <Icon className={`w-5 h-5 ${text}`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {count > 200 ? "200+" : count}
                </p>
                <p className="text-xs text-gray-500 font-medium">{label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────── */}
      <div className="flex gap-1 border-b border-gray-200">
        {([
          { key: "needslabel" as Tab, label: `Needs Label (${needsLabelCount > 200 ? "200+" : needsLabelCount})`, icon: Tag },
          { key: "inbaskets"  as Tab, label: `In Baskets (${inBasketsCount})`,   icon: ShoppingBasket },
          { key: "nobarcode"  as Tab, label: `No Barcode (${noBarcodeCount})`,   icon: Barcode },
        ]).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === key
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          TAB 1 — Needs Label
          Primary queue: any copy with labelPrinted=false.
          No basket required — new copies appear here the moment they're added.
      ══════════════════════════════════════════════════════════════════ */}
      {tab === "needslabel" && (
        <div className="space-y-4">
          {needsLabelCount === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
              <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
              <p className="font-semibold text-gray-700">All copies have labels applied!</p>
              <p className="text-sm text-gray-400 mt-1">Nothing left to label.</p>
            </div>
          ) : (
            <>
              {/* ── Toolbar ── */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Filter className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={labelFilter}
                    onChange={(e) => { setLabelFilter(e.target.value); clearSelection(); }}
                    placeholder="Filter by title, barcode, or ISBN…"
                    className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
                <span className="text-sm text-gray-500">
                  {filteredNeedsLabel.length} of {needsLabelCount} shown
                  {needsLabelCount > 200 && " (limited to 200)"}
                </span>

                {/* Print Selected — shown when anything is checked */}
                {selected.size > 0 && (
                  <>
                    <button
                      onClick={() => { printLabels(locale, [...selected]); }}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      Print Selected ({selected.size})
                    </button>
                    <button
                      onClick={clearSelection}
                      className="flex items-center gap-1 text-xs px-2.5 py-1.5 border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <X className="w-3 h-3" /> Clear
                    </button>
                  </>
                )}

                {filteredNeedsLabel.length > 0 && selected.size === 0 && (
                  <>
                    <button
                      onClick={() => printLabels(locale, filteredNeedsLabel.map((i) => i.id))}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <Printer className="w-3.5 h-3.5" /> Print All
                    </button>
                    <button
                      onClick={markAllVisible}
                      disabled={labeling.size > 0}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                    >
                      {labeling.size > 0
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <CheckCheck className="w-3.5 h-3.5" />}
                      Mark All Labeled
                    </button>
                  </>
                )}
              </div>

              {/* ── Grouped table ── */}
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                {/* Table header */}
                <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-2.5 w-8">
                        {/* Select-all checkbox (only selects copies with barcodes) */}
                        <input
                          type="checkbox"
                          checked={
                            filteredNeedsLabel.filter((i) => i.barcode).length > 0 &&
                            filteredNeedsLabel.filter((i) => i.barcode).every((i) => selected.has(i.id))
                          }
                          onChange={toggleAll}
                          className="w-3.5 h-3.5 rounded accent-indigo-600"
                          title="Select all printable copies"
                        />
                      </th>
                      <th className="px-4 py-2.5 text-left">Book / Copy</th>
                      <th className="px-4 py-2.5 text-left w-36">Barcode</th>
                      <th className="px-4 py-2.5 text-left w-24">Condition</th>
                      <th className="px-4 py-2.5 text-left w-32">Basket</th>
                      <th className="px-4 py-2.5 text-right w-32">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {needsLabelByBook.map((group) => {
                      const printableIds = group.copies.filter((c) => c.barcode).map((c) => c.id);
                      const allBookSelected = printableIds.length > 0 && printableIds.every((id) => selected.has(id));
                      const someBookSelected = printableIds.some((id) => selected.has(id));

                      return (
                        <React.Fragment key={group.bookId}>
                          {/* ── Book group header row ── */}
                          {group.copies.length > 1 && (
                            <tr
                              key={`book-${group.bookId}`}
                              className="bg-indigo-50/60 border-t border-indigo-100 cursor-pointer hover:bg-indigo-50 transition-colors"
                              onClick={() => printableIds.length > 0 && toggleBook(group.bookId, printableIds)}
                            >
                              <td className="px-4 py-2">
                                {printableIds.length > 0 && (
                                  <input
                                    type="checkbox"
                                    checked={allBookSelected}
                                    ref={(el) => { if (el) el.indeterminate = someBookSelected && !allBookSelected; }}
                                    onChange={() => toggleBook(group.bookId, printableIds)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="w-3.5 h-3.5 rounded accent-indigo-600"
                                  />
                                )}
                              </td>
                              <td className="px-4 py-2" colSpan={5}>
                                <div className="flex items-center gap-2">
                                  <BookOpen className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                                  <span className="text-xs font-semibold text-indigo-800">{group.title}</span>
                                  {group.author && <span className="text-xs text-indigo-400">— {group.author}</span>}
                                  {group.isbn   && <span className="text-xs font-mono text-indigo-300">{group.isbn}</span>}
                                  <span className="ml-auto text-[10px] bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-medium">
                                    {group.copies.length} copies
                                  </span>
                                  {printableIds.length > 0 && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); printLabels(locale, printableIds); }}
                                      className="flex items-center gap-1 text-[10px] font-medium text-indigo-600 hover:text-indigo-800 px-2 py-0.5 rounded-lg hover:bg-indigo-100 transition-colors"
                                    >
                                      <Printer className="w-3 h-3" /> Print this book
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}

                          {/* ── Copy rows ── */}
                          {group.copies.map((item) => {
                            const bi = item.basketItems[0] ?? null;
                            const isSelected = selected.has(item.id);
                            return (
                              <tr
                                key={item.id}
                                onClick={() => item.barcode && toggleCopy(item.id)}
                                className={`border-t border-gray-50 transition-colors ${
                                  item.barcode ? "cursor-pointer" : ""
                                } ${isSelected ? "bg-indigo-50" : "hover:bg-gray-50"}`}
                              >
                                <td className="px-4 py-2.5">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    disabled={!item.barcode}
                                    onChange={() => toggleCopy(item.id)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="w-3.5 h-3.5 rounded accent-indigo-600 disabled:opacity-30"
                                    title={item.barcode ? "Select for printing" : "No barcode — cannot print"}
                                  />
                                </td>
                                <td className="px-4 py-2.5">
                                  {/* Only show book info if single copy (no group header) */}
                                  {group.copies.length === 1 && (
                                    <>
                                      <p className="font-medium text-gray-800 text-sm">{item.book.title}</p>
                                      {item.book.author && <p className="text-xs text-gray-400">{item.book.author.name}</p>}
                                      {item.book.isbn   && <p className="text-xs font-mono text-gray-400">ISBN: {item.book.isbn}</p>}
                                    </>
                                  )}
                                  <span className={`text-xs font-mono ${group.copies.length > 1 ? "text-gray-500 ml-2" : "text-gray-600 mt-0.5 block"}`}>
                                    Copy #{item.copyNumber}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5">
                                  {item.barcode
                                    ? <span className="text-xs font-mono text-gray-600">{item.barcode}</span>
                                    : <span className="text-xs text-gray-300 italic">No barcode</span>}
                                </td>
                                <td className="px-4 py-2.5">{conditionBadge(item.condition)}</td>
                                <td className="px-4 py-2.5">
                                  {bi ? (
                                    <Link
                                      href={`/${locale}/admin/baskets/${bi.basketId}`}
                                      onClick={(e) => e.stopPropagation()}
                                      className="inline-flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 hover:underline"
                                    >
                                      <ShoppingBasket className="w-3 h-3" />
                                      {bi.basket.name}
                                    </Link>
                                  ) : (
                                    <span className="text-xs text-gray-300">—</span>
                                  )}
                                </td>
                                <td className="px-4 py-2.5">
                                  <div className="flex items-center gap-1.5 justify-end" onClick={(e) => e.stopPropagation()}>
                                    <button
                                      onClick={() => printLabels(locale, [item.id])}
                                      disabled={!item.barcode}
                                      title={item.barcode ? "Print this copy's label" : "No barcode — assign one first"}
                                      className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded disabled:opacity-30 transition-colors"
                                    >
                                      <Printer className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => markLabelPrinted(item)}
                                      disabled={labeling.has(item.id)}
                                      className="flex items-center gap-1 text-xs px-2.5 py-1 bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 disabled:opacity-50 transition-colors"
                                    >
                                      {labeling.has(item.id)
                                        ? <Loader2 className="w-3 h-3 animate-spin" />
                                        : <CheckCircle2 className="w-3 h-3" />}
                                      Labeled
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
                </div>
                {needsLabelCount > 200 && (
                  <div className="px-4 py-3 bg-amber-50 border-t border-amber-100 text-xs text-amber-700 text-center">
                    Showing the 200 most recently acquired copies. Mark them as labeled to reveal older ones.
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB 2 — In Baskets
          Secondary workflow: basket-based batch processing.
          Useful when a librarian / AI has organized copies into batches.
      ══════════════════════════════════════════════════════════════════ */}
      {tab === "inbaskets" && (
        <div className="space-y-4">
          {inBasketsCount === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
              <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
              <p className="font-semibold text-gray-700">All basket items are labeled!</p>
              <p className="text-sm text-gray-400 mt-1">
                No pending basket labels. Use the <strong>Needs Label</strong> tab to see all unlabeled copies.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Filter className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={basketFilter}
                    onChange={(e) => setBasketFilter(e.target.value)}
                    placeholder="Filter by basket name…"
                    className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
                <p className="text-sm text-gray-500">
                  {groupedByBasket.reduce((s, g) => s + g.items.length, 0)} item(s) across {groupedByBasket.length} basket(s)
                </p>
              </div>

              {groupedByBasket.map(({ basket, items }) => (
                <div key={basket.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 bg-purple-50 border-b border-purple-100">
                    <div className="flex items-center gap-2">
                      <ShoppingBasket className="w-4 h-4 text-purple-600" />
                      <span className="font-semibold text-gray-800 text-sm">{basket.name}</span>
                      <span className="text-xs bg-purple-200 text-purple-800 px-2 py-0.5 rounded-full font-medium">
                        {items.length} unlabeled
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => markBasketTagged(basket.id, basket.name)}
                        disabled={tagging.has(basket.id)}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                      >
                        {tagging.has(basket.id)
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <CheckCheck className="w-3 h-3" />}
                        Mark All Labeled
                      </button>
                      <Link
                        href={`/${locale}/admin/baskets/${basket.id}`}
                        className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5 rounded-lg hover:bg-white transition-colors"
                      >
                        Open <ChevronRight className="w-3 h-3" />
                      </Link>
                      <button
                        onClick={() => setExpandedBaskets((prev) => {
                          const n = new Set(prev);
                          n.has(basket.id) ? n.delete(basket.id) : n.add(basket.id);
                          return n;
                        })}
                        className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1"
                      >
                        {expandedBaskets.has(basket.id) ? "▲ Collapse" : "▼ Expand"}
                      </button>
                    </div>
                  </div>

                  {(expandedBaskets.has(basket.id) || items.length <= 3) && (
                    <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                        <tr>
                          <th className="px-4 py-2 text-left">Book</th>
                          <th className="px-4 py-2 text-center w-16">Copy#</th>
                          <th className="px-4 py-2 text-left w-32">Barcode</th>
                          <th className="px-4 py-2 text-left w-24">Condition</th>
                          <th className="px-4 py-2 text-center w-24">Label</th>
                          <th className="px-4 py-2 text-right w-24">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {items.map((item) => (
                          <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-2.5">
                              <p className="font-medium text-gray-800 text-sm">{item.book.title}</p>
                              {item.book.author && (
                                <p className="text-xs text-gray-400">{item.book.author.name}</p>
                              )}
                              {item.book.isbn && (
                                <p className="text-xs font-mono text-gray-400">ISBN: {item.book.isbn}</p>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <span className="text-sm text-gray-700 font-mono">#{item.copy.copyNumber}</span>
                            </td>
                            <td className="px-4 py-2.5">
                              {item.copy.barcode
                                ? <span className="text-xs font-mono text-gray-600">{item.copy.barcode}</span>
                                : <span className="text-xs text-gray-300 italic">—</span>}
                            </td>
                            <td className="px-4 py-2.5">{conditionBadge(item.copy.condition)}</td>
                            <td className="px-4 py-2.5 text-center">
                              {item.copy.labelPrinted ? (
                                <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
                                  <CheckCircle2 className="w-3.5 h-3.5" /> Applied
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs text-amber-500 font-medium">
                                  <Circle className="w-3.5 h-3.5" /> Pending
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <button
                                onClick={() => markTagged(item)}
                                disabled={tagging.has(item.id)}
                                className="flex items-center gap-1 text-xs px-2.5 py-1 bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 disabled:opacity-50 transition-colors ml-auto"
                              >
                                {tagging.has(item.id)
                                  ? <Loader2 className="w-3 h-3 animate-spin" />
                                  : <CheckCircle2 className="w-3 h-3" />}
                                Labeled
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB 3 — No Barcode
      ══════════════════════════════════════════════════════════════════ */}
      {tab === "nobarcode" && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          {noBarcodeCount === 0 ? (
            <div className="p-12 text-center">
              <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
              <p className="font-semibold text-gray-700">All copies have barcodes!</p>
              <p className="text-sm text-gray-400 mt-1">No copies are missing barcodes or RFID tags.</p>
            </div>
          ) : (
            <>
              <div className="px-4 py-3 bg-blue-50 border-b border-blue-100 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-blue-600" />
                <span className="text-sm text-blue-800 font-medium">
                  {noBarcodeCount} copy/copies have no barcode or RFID — assign one before printing labels.
                </span>
              </div>
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3 text-left">Book</th>
                    <th className="px-4 py-3 text-center w-16">Copy#</th>
                    <th className="px-4 py-3 text-left w-24">Status</th>
                    <th className="px-4 py-3 text-left w-24">Condition</th>
                    <th className="px-4 py-3 text-right w-28">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(data?.noBarcode ?? []).map((copy) => (
                    <tr key={copy.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-gray-800">{copy.book.title}</p>
                        {copy.book.author && (
                          <p className="text-xs text-gray-400">{copy.book.author.name}</p>
                        )}
                        {copy.book.isbn && (
                          <p className="text-xs font-mono text-gray-400">ISBN: {copy.book.isbn}</p>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="text-sm text-gray-700 font-mono">#{copy.copyNumber}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          copy.status === "AVAILABLE" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                        }`}>
                          {copy.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">{conditionBadge(copy.condition)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <Link
                          href={`/${locale}/admin/books/${copy.book.id}`}
                          className="flex items-center gap-1 text-xs px-2.5 py-1 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors ml-auto w-fit"
                        >
                          <BookOpen className="w-3 h-3" />
                          Manage
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── All clear ──────────────────────────────────────────────────── */}
      {needsLabelCount === 0 && inBasketsCount === 0 && noBarcodeCount === 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 text-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
          <p className="font-semibold text-emerald-800">Processing queue is clear!</p>
          <p className="text-sm text-emerald-600 mt-1">All copies are labeled and have barcodes.</p>
        </div>
      )}

      {/* ── Toast ──────────────────────────────────────────────────────── */}
      {toastMsg && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${
          toastMsg.ok ? "bg-green-600 text-white" : "bg-red-600 text-white"
        }`}>
          {toastMsg.text}
        </div>
      )}
    </div>
  );
}
