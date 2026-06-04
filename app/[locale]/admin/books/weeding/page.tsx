"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import {
  Trash2, Loader2, RefreshCw, BookOpen, AlertTriangle,
  Clock, BookX, ChevronRight, ShoppingBasket, Plus,
} from "lucide-react";

/* ── Types ──────────────────────────────────────────────────────────────── */
interface WeedBook {
  id:          string;
  title:       string;
  condition:   string;
  totalCopies: number;
  createdAt:   string;
  author:      { name: string } | null;
  category:    { name: string } | null;
  _count:      { loans: number };
  loans:       { createdAt: string }[];  // last loan only
}

interface WeedingData { books: WeedBook[]; tab: string; dormantDays: number }

type Tab = "poor" | "dormant" | "never";

const CONDITION_COLOR: Record<string, string> = {
  POOR:    "bg-orange-100 text-orange-700",
  DAMAGED: "bg-red-100 text-red-700",
  FAIR:    "bg-yellow-100 text-yellow-700",
};

export default function WeedingPage() {
  const locale = useLocale();

  const [tab,         setTab]         = useState<Tab>("poor");
  const [dormantDays, setDormantDays] = useState(730);
  const [data,        setData]        = useState<WeedingData | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [selected,    setSelected]    = useState<Set<string>>(new Set());
  const [toastMsg,    setToast]       = useState<{ text: string; ok: boolean } | null>(null);
  const [addingToBasket, setAddingToBasket] = useState(false);
  const [baskets,     setBaskets]     = useState<{ id: string; name: string }[]>([]);
  const [pickBasket,  setPickBasket]  = useState(false);

  function toast(text: string, ok = true) {
    setToast({ text, ok });
    setTimeout(() => setToast(null), 3500);
  }

  const load = useCallback(async () => {
    setLoading(true);
    setSelected(new Set());
    try {
      const res  = await fetch(`/api/books/weeding?tab=${tab}&dormantDays=${dormantDays}`);
      const json = await res.json() as WeedingData;
      setData(json);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [tab, dormantDays]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch("/api/baskets").then((r) => r.json()).then((d) => {
      if (Array.isArray(d)) setBaskets(d.map((b: { id: string; name: string }) => ({ id: b.id, name: b.name })));
    }).catch(() => {});
  }, []);

  function toggleSelect(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function toggleAll() {
    if (!data) return;
    if (selected.size === data.books.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(data.books.map((b) => b.id)));
    }
  }

  async function addSelectedToBasket(basketId: string) {
    setAddingToBasket(true);
    setPickBasket(false);
    const bookIds = [...selected];
    const res     = await fetch(`/api/baskets/${basketId}/items`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ bookIds, mode: "all-available" }),
    });
    setAddingToBasket(false);
    if (res.ok) {
      const { added } = await res.json();
      toast(`Added ${added} copies to basket`);
      setSelected(new Set());
    } else {
      const err = await res.json().catch(() => ({}));
      toast(err.error ?? "Failed to add to basket", false);
    }
  }

  const books = data?.books ?? [];

  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Trash2 className="w-6 h-6 text-rose-600" />
            Weeding Candidates
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Books to consider withdrawing from the collection
          </p>
        </div>
        <div className="flex items-center gap-2">
          {tab === "dormant" && (
            <select
              value={dormantDays}
              onChange={(e) => setDormantDays(Number(e.target.value))}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-rose-400"
            >
              <option value={365}>Not borrowed in 1 year</option>
              <option value={730}>Not borrowed in 2 years</option>
              <option value={1095}>Not borrowed in 3 years</option>
              <option value={1825}>Not borrowed in 5 years</option>
            </select>
          )}
          <button
            onClick={load}
            className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>
      </div>

      {/* ── Info banner ────────────────────────────────────────────────── */}
      <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 flex items-start gap-3">
        <AlertTriangle className="w-4 h-4 text-rose-600 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-rose-800">
          These are <strong>suggestions only</strong> — review each book before withdrawing.
          You can add selected books to a basket to process them as a batch.
        </p>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────── */}
      <div className="flex gap-1 border-b border-gray-200">
        {([
          { key: "poor",    label: "Poor Condition",   icon: BookX   },
          { key: "dormant", label: "Long Dormant",     icon: Clock   },
          { key: "never",   label: "Never Borrowed",   icon: BookOpen },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === key
                ? "border-rose-600 text-rose-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab description ────────────────────────────────────────────── */}
      <div className="text-sm text-gray-500">
        {tab === "poor"    && "Books with condition POOR, DAMAGED, or FAIR that haven't been withdrawn yet."}
        {tab === "dormant" && `Books that were borrowed at some point but not in the last ${dormantDays / 365} year(s).`}
        {tab === "never"   && "Books added more than 1 year ago that have never been borrowed."}
      </div>

      {/* ── Bulk action bar ────────────────────────────────────────────── */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
          <span className="text-sm font-medium text-gray-700">{selected.size} selected</span>
          <div className="relative">
            <button
              onClick={() => setPickBasket((v) => !v)}
              disabled={addingToBasket}
              className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors"
            >
              {addingToBasket
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <ShoppingBasket className="w-4 h-4" />}
              Add to Basket
            </button>
            {pickBasket && baskets.length > 0 && (
              <div className="absolute top-full mt-1 left-0 bg-white border border-gray-200 rounded-xl shadow-lg z-10 min-w-[200px] overflow-hidden">
                {baskets.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => addSelectedToBasket(b.id)}
                    className="flex items-center gap-2 w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors"
                  >
                    <ShoppingBasket className="w-3.5 h-3.5 text-indigo-500" />
                    {b.name}
                  </button>
                ))}
                <Link
                  href={`/${locale}/admin/baskets`}
                  className="flex items-center gap-2 w-full text-left px-4 py-2.5 text-sm border-t border-gray-100 text-indigo-600 hover:bg-indigo-50 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Create new basket
                </Link>
              </div>
            )}
          </div>
          <button
            onClick={() => setSelected(new Set())}
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            Clear
          </button>
        </div>
      )}

      {/* ── Books table ────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-gray-400 flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin" /> Loading…
          </div>
        ) : books.length === 0 ? (
          <div className="p-12 text-center">
            <BookOpen className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="font-medium text-gray-500">No candidates found for this filter.</p>
            <p className="text-sm text-gray-400 mt-1">
              {tab === "dormant" ? "Try increasing the dormancy threshold." : "Great — no action needed!"}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-2.5 text-left w-8">
                    <input
                      type="checkbox"
                      checked={selected.size === books.length && books.length > 0}
                      onChange={toggleAll}
                      className="w-4 h-4 rounded border-gray-300 text-rose-600 accent-rose-600"
                    />
                  </th>
                  <th className="px-4 py-2.5 text-left">Title / Author</th>
                  <th className="px-4 py-2.5 text-center w-24">Condition</th>
                  <th className="px-4 py-2.5 text-center w-20">Loans</th>
                  <th className="px-4 py-2.5 text-left w-36">
                    {tab === "dormant" ? "Last Borrowed" : tab === "never" ? "Added" : "Category"}
                  </th>
                  <th className="px-4 py-2.5 text-right w-24">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {books.map((b) => (
                  <tr key={b.id} className={`hover:bg-gray-50 transition-colors ${selected.has(b.id) ? "bg-rose-50" : ""}`}>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(b.id)}
                        onChange={() => toggleSelect(b.id)}
                        className="w-4 h-4 rounded border-gray-300 text-rose-600 accent-rose-600"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">{b.title}</p>
                      {b.author && <p className="text-xs text-gray-400">{b.author.name}</p>}
                      {b.category && <p className="text-xs text-gray-300">{b.category.name}</p>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        CONDITION_COLOR[b.condition] ?? "bg-gray-100 text-gray-500"
                      }`}>
                        {b.condition}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm font-semibold text-gray-700">{b._count.loans}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {tab === "dormant" && b.loans[0]
                        ? new Date(b.loans[0].createdAt).toLocaleDateString()
                        : tab === "never" || tab === "poor"
                        ? new Date(b.createdAt).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/${locale}/admin/books/${b.id}`}
                        className="inline-flex items-center gap-1 text-xs px-2.5 py-1 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        View <ChevronRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 text-xs text-gray-400">
              Showing {books.length} candidate(s). Select items above and add to a basket for batch processing.
            </div>
          </>
        )}
      </div>

      {/* Toast */}
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
