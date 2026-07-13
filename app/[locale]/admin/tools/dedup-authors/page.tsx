"use client";

import { useState, useEffect, useCallback } from "react";
import {
  UserRound, RefreshCw, Loader2, Merge, CheckCircle2,
  AlertCircle, ChevronDown, ChevronUp, ShieldCheck,
} from "lucide-react";

interface DupAuthor {
  id:           string;
  name:         string;
  bookCount:    number;
  coAuthorCount: number;
  ebookCount:   number;
  createdAt:    string;
}

interface DupGroup  { key: string; authors: DupAuthor[] }
interface ApiResult { groups: DupGroup[]; totalDuplicates: number; totalGroups: number }

export default function DedupAuthorsPage() {
  const [data,     setData]     = useState<ApiResult | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [busyBulk, setBusyBulk] = useState(false);
  const [busyKeys, setBusyKeys] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [toast,    setToast]    = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/tools/dedup-authors");
      if (!res.ok) throw new Error(await res.text());
      const d: ApiResult = await res.json();
      setData(d);
      setExpanded(new Set(d.groups.slice(0, 5).map((g) => g.key)));
    } catch (e) {
      showToast(`Load failed: ${e instanceof Error ? e.message : "error"}`, false);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  /** Pick the author to keep — most books → oldest */
  function keepAuthor(group: DupGroup): string {
    return [...group.authors].sort((a, b) => {
      const as = a.bookCount + a.coAuthorCount + a.ebookCount;
      const bs = b.bookCount + b.coAuthorCount + b.ebookCount;
      if (bs !== as) return bs - as;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    })[0].id;
  }

  /** Merge a single group: re-point all books to keepId, delete the rest */
  async function mergeGroup(group: DupGroup) {
    const keepId    = keepAuthor(group);
    const deleteIds = group.authors.filter((a) => a.id !== keepId).map((a) => a.id);
    setBusyKeys((p) => new Set([...p, group.key]));
    try {
      const res = await fetch("/api/admin/tools/dedup-authors", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ action: "merge", keepId, deleteIds }),
      });
      const r = await res.json();
      if (!res.ok) throw new Error(r.error);
      showToast(`Merged ${r.merged} duplicate(s) into "${group.authors.find((a) => a.id === keepId)?.name}"`);
      await load();
    } catch (e) {
      showToast(String(e instanceof Error ? e.message : e), false);
    } finally {
      setBusyKeys((p) => { const n = new Set(p); n.delete(group.key); return n; });
    }
  }

  async function mergeAllEmpty() {
    if (!confirm("Auto-merge all duplicate authors that have 0 books? The author with the most books in each group will be kept.")) return;
    setBusyBulk(true);
    try {
      const res = await fetch("/api/admin/tools/dedup-authors", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ action: "merge-all-empty" }),
      });
      const r = await res.json();
      if (!res.ok) throw new Error(r.error);
      showToast(`Removed ${r.merged} empty duplicate(s). Skipped ${r.skipped} (have books).`);
      await load();
    } catch (e) {
      showToast(String(e instanceof Error ? e.message : e), false);
    } finally { setBusyBulk(false); }
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <UserRound className="w-6 h-6 text-violet-600" /> Duplicate Authors
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Find authors imported multiple times under the same name.
            Merging re-points all books, co-author links, and e-books to the kept record, then deletes the duplicates.
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Refresh
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium ${
          toast.ok
            ? "bg-green-50 border border-green-200 text-green-800"
            : "bg-red-50 border border-red-200 text-red-800"
        }`}>
          {toast.ok ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
          {toast.msg}
        </div>
      )}

      {/* Stats */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-2xl font-extrabold text-gray-900">{data.totalGroups.toLocaleString()}</p>
            <p className="text-xs text-gray-500 mt-0.5">Groups with duplicates</p>
          </div>
          <div className={`rounded-xl border p-4 ${data.totalDuplicates > 0 ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}`}>
            <p className={`text-2xl font-extrabold ${data.totalDuplicates > 0 ? "text-red-700" : "text-green-700"}`}>
              {data.totalDuplicates.toLocaleString()}
            </p>
            <p className={`text-xs mt-0.5 ${data.totalDuplicates > 0 ? "text-red-500" : "text-green-600"}`}>
              {data.totalDuplicates > 0 ? "Extra duplicate records" : "No duplicates ✓"}
            </p>
          </div>
          {data.totalDuplicates > 0 && (
            <button onClick={mergeAllEmpty} disabled={busyBulk}
              className="flex items-center justify-center gap-2 px-3 py-3 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 active:scale-[0.98] disabled:opacity-50 transition-all shadow-sm col-span-2 sm:col-span-1">
              {busyBulk ? <Loader2 className="w-4 h-4 animate-spin" /> : <Merge className="w-4 h-4" />}
              Auto-merge Empty
            </button>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && !data && (
        <div className="flex items-center justify-center py-20 gap-3 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span className="text-sm">Scanning authors…</span>
        </div>
      )}

      {/* No duplicates */}
      {data && data.totalDuplicates === 0 && (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
          <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
          <p className="font-semibold text-gray-700">No duplicate authors found ✓</p>
          <p className="text-sm text-gray-400 mt-1">Every author name appears exactly once.</p>
        </div>
      )}

      {/* Groups */}
      {data && data.groups.map((group) => {
        const keepId = keepAuthor(group);
        const isOpen = expanded.has(group.key);
        const isBusy = busyKeys.has(group.key);
        const canAutoMerge = group.authors.some(
          (a) => a.id !== keepId && a.bookCount === 0 && a.coAuthorCount === 0 && a.ebookCount === 0
        );

        return (
          <div key={group.key} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

            {/* Group header */}
            <button
              onClick={() => setExpanded((p) => { const n = new Set(p); n.has(group.key) ? n.delete(group.key) : n.add(group.key); return n; })}
              className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors text-left">
              <div className="flex items-center gap-3 min-w-0">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-100 text-red-700 text-xs font-bold flex-shrink-0">
                  {group.authors.length}
                </span>
                <span className="font-semibold text-gray-900 capitalize truncate">{group.key}</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {/* Merge button in header for quick access */}
                <button
                  onClick={(e) => { e.stopPropagation(); mergeGroup(group); }}
                  disabled={isBusy}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors">
                  {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Merge className="w-3 h-3" />}
                  {canAutoMerge ? "Merge" : "Force merge"}
                </button>
                {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </div>
            </button>

            {/* Authors table */}
            {isOpen && (
              <div className="border-t border-gray-100 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-2 w-8"></th>
                      <th className="px-4 py-2 text-left">Name (stored)</th>
                      <th className="px-4 py-2 text-center">Books</th>
                      <th className="px-4 py-2 text-center">Co-author</th>
                      <th className="px-4 py-2 text-center">E-books</th>
                      <th className="px-4 py-2 text-left">Created</th>
                      <th className="px-4 py-2 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {group.authors.map((a) => {
                      const isKeep  = a.id === keepId;
                      const hasData = a.bookCount > 0 || a.coAuthorCount > 0 || a.ebookCount > 0;
                      return (
                        <tr key={a.id} className={`transition-colors ${isKeep ? "bg-green-50" : "hover:bg-gray-50"}`}>
                          <td className="px-4 py-3">
                            {isKeep
                              ? <ShieldCheck className="w-4 h-4 text-green-600" />
                              : hasData
                                ? <span className="text-amber-500 text-xs font-bold" title="Has books — will be re-pointed">↗</span>
                                : <span className="text-gray-300 text-xs">–</span>}
                          </td>
                          <td className="px-4 py-3 font-medium text-gray-900">{a.name}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-xs font-bold ${a.bookCount > 0 ? "text-blue-600" : "text-gray-300"}`}>{a.bookCount}</span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-xs font-bold ${a.coAuthorCount > 0 ? "text-indigo-600" : "text-gray-300"}`}>{a.coAuthorCount}</span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-xs font-bold ${a.ebookCount > 0 ? "text-teal-600" : "text-gray-300"}`}>{a.ebookCount}</span>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">{new Date(a.createdAt).toLocaleDateString()}</td>
                          <td className="px-4 py-3">
                            {isKeep ? (
                              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Keep</span>
                            ) : hasData ? (
                              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Re-point → merge</span>
                            ) : (
                              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">Delete</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50 text-xs text-gray-500">
                  Clicking <strong>Merge</strong> will re-point all books from duplicates to{" "}
                  <strong>"{group.authors.find((a) => a.id === keepId)?.name}"</strong> then delete the duplicates.
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
