"use client";

import { useState, useEffect, useCallback } from "react";
import {
  BookOpen, RefreshCw, Loader2, Trash2, CheckCircle2,
  AlertCircle, ChevronDown, ChevronUp, ShieldCheck, Tag, Hash, GitMerge, Wand2,
} from "lucide-react";

interface DupBook {
  id:          string;
  title:       string;
  isbn:        string | null;
  authorName:  string | null;
  publishYear: number | null;
  totalCopies: number;
  loanCount:   number;
  createdAt:   string;
}

interface DupGroup {
  key:       string;
  groupType: "isbn" | "title";
  books:     DupBook[];
}

interface AiGroup {
  books:      DupBook[];
  confidence: "high" | "medium" | "low";
  reason:     string;
}

interface ApiResult {
  groups:          DupGroup[];
  totalDuplicates: number;
  totalGroups:     number;
}

export default function DedupBooksPage() {
  const [data,     setData]     = useState<ApiResult | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [busyBulk, setBusyBulk] = useState(false);
  const [busyIds,  setBusyIds]  = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toast,    setToast]    = useState<{ msg: string; ok: boolean } | null>(null);

  // AI duplicate detection state
  const [aiGroups,   setAiGroups]   = useState<AiGroup[] | null>(null);
  const [aiLoading,  setAiLoading]  = useState(false);
  const [aiPage,     setAiPage]     = useState(1);
  const [aiPages,    setAiPages]    = useState(1);
  const [showAi,     setShowAi]     = useState(false);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4500);
  };

  async function loadAiGroups(p: number) {
    setAiLoading(true); setShowAi(true);
    let res: Response | undefined;
    try {
      res = await fetch(`/api/books/ai-duplicates?page=${p}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? await res.text());
      const d = await res.json();
      setAiGroups(d.groups ?? []);
      setAiPages(d.pages ?? 1);
      setAiPage(p);
    } catch (e) {
      const { friendlyAiError } = await import("@/lib/ai-error");
      showToast(friendlyAiError(e, res), false);
      setShowAi(false);
    } finally { setAiLoading(false); }
  }

  const load = useCallback(async () => {
    setLoading(true); setSelected(new Set());
    try {
      const res = await fetch("/api/admin/tools/dedup-books");
      if (!res.ok) throw new Error(await res.text());
      const d: ApiResult = await res.json();
      setData(d);
      setExpanded(new Set(d.groups.slice(0, 5).map((g) => g.key)));
    } catch (e) {
      showToast(`Load failed: ${e instanceof Error ? e.message : "error"}`, false);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function deleteSelected() {
    if (!selected.size) return;
    if (!confirm(`Delete ${selected.size} selected book(s)? Books with loans or physical copies will be skipped.`)) return;
    setBusyIds(new Set(selected));
    try {
      const res = await fetch("/api/admin/tools/dedup-books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", deleteIds: [...selected] }),
      });
      const r = await res.json();
      if (!res.ok) throw new Error(r.error);
      let msg = `Deleted ${r.deleted} book(s).`;
      if (r.skipped > 0) msg += ` Skipped ${r.skipped} (have loans/copies).`;
      showToast(msg, r.deleted > 0);
      await load();
    } catch (e) {
      showToast(String(e instanceof Error ? e.message : e), false);
    } finally { setBusyIds(new Set()); }
  }

  async function deleteAllEmpty() {
    if (!confirm("Auto-delete ALL duplicate books that have 0 loans and 0 physical copies?\nThe best record in each group will be kept.")) return;
    setBusyBulk(true);
    try {
      const res = await fetch("/api/admin/tools/dedup-books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete-all-empty" }),
      });
      const r = await res.json();
      if (!res.ok) throw new Error(r.error);
      showToast(`Deleted ${r.deleted} duplicate(s). Skipped ${r.skipped} (have activity).`);
      await load();
    } catch (e) {
      showToast(String(e instanceof Error ? e.message : e), false);
    } finally { setBusyBulk(false); }
  }

  async function mergeAll() {
    if (!confirm(
      "MERGE ALL duplicate groups?\n\n" +
      "For each group the best book is kept (most loans → most copies → oldest).\n" +
      "All copies, loans and relations from duplicates are moved to the kept book,\n" +
      "then the duplicate is deleted.\n\n" +
      "This cannot be undone — back up first if needed."
    )) return;
    setBusyBulk(true);
    try {
      const res = await fetch("/api/admin/tools/dedup-books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "merge-all" }),
      });
      const r = await res.json();
      if (!res.ok) throw new Error(r.error);
      showToast(`Merged ${r.merged} duplicate(s). Skipped ${r.skipped}.`);
      await load();
    } catch (e) {
      showToast(String(e instanceof Error ? e.message : e), false);
    } finally { setBusyBulk(false); }
  }

  function toggleExpand(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function toggleSelect(id: string, keepId: string) {
    if (id === keepId) return;
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  /** The book to keep = most loans → most copies → oldest */
  function keepBook(group: DupGroup): string {
    return [...group.books].sort((a, b) => {
      if (b.loanCount   !== a.loanCount)   return b.loanCount   - a.loanCount;
      if (b.totalCopies !== a.totalCopies) return b.totalCopies - a.totalCopies;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    })[0].id;
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-blue-600" /> Duplicate Books
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Find and remove books imported multiple times. Grouped by matching ISBN first, then by title.
            Books with loans or physical copies are protected.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => loadAiGroups(1)} disabled={aiLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-violet-200 bg-violet-50 text-sm font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-50 transition-colors">
            {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            AI Scan
          </button>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Refresh
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium ${
          toast.ok
            ? "bg-green-50 border border-green-200 text-green-800"
            : "bg-red-50 border border-red-200 text-red-800"
        }`}>
          {toast.ok
            ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            : <AlertCircle  className="w-4 h-4 flex-shrink-0" />}
          {toast.msg}
        </div>
      )}

      {/* AI Duplicate Groups */}
      {showAi && (
        <div className="bg-violet-50 border border-violet-200 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-violet-200 bg-violet-100">
            <div className="flex items-center gap-2">
              <Wand2 className="w-4 h-4 text-violet-700" />
              <h3 className="font-semibold text-sm text-violet-800">AI Duplicate Analysis</h3>
              {aiGroups && <span className="text-xs text-violet-500">{aiGroups.length} groups on this page</span>}
            </div>
            <button onClick={() => { setShowAi(false); setAiGroups(null); }}
              className="text-violet-400 hover:text-violet-700 text-xs px-2 py-1 rounded">✕</button>
          </div>

          {aiLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-violet-500">
              <Loader2 className="w-5 h-5 animate-spin" /> Scanning for AI duplicates…
            </div>
          ) : aiGroups && aiGroups.length === 0 ? (
            <div className="text-center py-10 text-violet-500">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-violet-300" />
              <p className="text-sm">AI found no likely duplicates.</p>
            </div>
          ) : aiGroups && (
            <div className="divide-y divide-violet-100">
              {aiGroups.map((group, idx) => (
                <div key={idx} className="px-5 py-3.5">
                  <div className="flex items-start gap-3">
                    {/* Confidence badge */}
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 mt-0.5 ${
                      group.confidence === "high"   ? "bg-green-100 text-green-700" :
                      group.confidence === "medium" ? "bg-yellow-100 text-yellow-700" :
                      "bg-gray-100 text-gray-500"
                    }`}>
                      {group.confidence.toUpperCase()}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap gap-2 mb-1">
                        {group.books.map((b) => (
                          <span key={b.id} className="text-xs bg-white border border-violet-200 px-2 py-0.5 rounded-lg text-gray-700 truncate max-w-[200px]">
                            {b.title}{b.publishYear ? ` (${b.publishYear})` : ""}
                          </span>
                        ))}
                      </div>
                      <p className="text-xs text-violet-600 italic">{group.reason}</p>
                    </div>
                  </div>
                </div>
              ))}
              {/* Pagination */}
              {aiPages > 1 && (
                <div className="px-5 py-3 flex items-center justify-between text-xs text-violet-500 border-t border-violet-100">
                  <span>Page {aiPage} of {aiPages}</span>
                  <div className="flex gap-1">
                    <button onClick={() => loadAiGroups(aiPage - 1)} disabled={aiPage === 1 || aiLoading}
                      className="px-3 py-1.5 rounded-lg border border-violet-200 bg-white hover:bg-violet-50 disabled:opacity-40">←</button>
                    <button onClick={() => loadAiGroups(aiPage + 1)} disabled={aiPage === aiPages || aiLoading}
                      className="px-3 py-1.5 rounded-lg border border-violet-200 bg-white hover:bg-violet-50 disabled:opacity-40">→</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Stats + bulk actions */}
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
            <>
              <button onClick={mergeAll} disabled={busyBulk}
                className="flex items-center justify-center gap-2 px-3 py-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-50 transition-all shadow-sm">
                {busyBulk ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitMerge className="w-4 h-4" />}
                Merge All
              </button>
              <button onClick={deleteAllEmpty} disabled={busyBulk}
                className="flex items-center justify-center gap-2 px-3 py-3 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 active:scale-[0.98] disabled:opacity-50 transition-all shadow-sm">
                {busyBulk ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Auto-clean Empty
              </button>
              {selected.size > 0 && (
                <button onClick={deleteSelected} disabled={busyIds.size > 0}
                  className="flex items-center justify-center gap-2 px-3 py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50 transition-all shadow-sm">
                  {busyIds.size > 0 ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Delete {selected.size} Selected
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && !data && (
        <div className="flex items-center justify-center py-20 gap-3 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span className="text-sm">Scanning books…</span>
        </div>
      )}

      {/* No duplicates */}
      {data && data.totalDuplicates === 0 && (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
          <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
          <p className="font-semibold text-gray-700">No duplicate books found ✓</p>
          <p className="text-sm text-gray-400 mt-1">Every ISBN and title appears exactly once.</p>
        </div>
      )}

      {/* Duplicate groups */}
      {data && data.groups.length > 0 && (
        <div className="space-y-3">
          {data.groups.map((group) => {
            const keepId   = keepBook(group);
            const isOpen   = expanded.has(group.key);
            const selCount = group.books.filter((b) => selected.has(b.id)).length;

            return (
              <div key={group.key} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

                {/* Group header */}
                <button
                  onClick={() => toggleExpand(group.key)}
                  className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors text-left">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-100 text-red-700 text-xs font-bold flex-shrink-0">
                      {group.books.length}
                    </span>
                    {/* Group-type badge */}
                    <span className={`flex-shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      group.groupType === "isbn"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-amber-100 text-amber-700"
                    }`}>
                      {group.groupType === "isbn"
                        ? <><Hash className="w-2.5 h-2.5" /> ISBN</>
                        : <><Tag  className="w-2.5 h-2.5" /> Title</>}
                    </span>
                    <span className="font-semibold text-gray-900 truncate">
                      {group.groupType === "isbn"
                        ? group.books[0].title
                        : group.books[0].title}
                    </span>
                    {group.groupType === "isbn" && group.books[0].isbn && (
                      <span className="text-xs font-mono text-gray-400 flex-shrink-0">{group.books[0].isbn}</span>
                    )}
                    {selCount > 0 && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium flex-shrink-0">
                        {selCount} selected
                      </span>
                    )}
                  </div>
                  {isOpen
                    ? <ChevronUp   className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                </button>

                {/* Books table */}
                {isOpen && (
                  <div className="border-t border-gray-100 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                        <tr>
                          <th className="px-4 py-2 w-8"></th>
                          <th className="px-4 py-2 text-left">Title</th>
                          <th className="px-4 py-2 text-left">Author</th>
                          <th className="px-4 py-2 text-left">ISBN</th>
                          <th className="px-4 py-2 text-left">Year</th>
                          <th className="px-4 py-2 text-center">Copies</th>
                          <th className="px-4 py-2 text-center">Loans</th>
                          <th className="px-4 py-2 text-left">Imported</th>
                          <th className="px-4 py-2 text-left">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {group.books.map((b) => {
                          const isKeep  = b.id === keepId;
                          const isBusy  = busyIds.has(b.id);
                          const isSel   = selected.has(b.id);
                          const hasData = b.loanCount > 0 || b.totalCopies > 0;

                          return (
                            <tr key={b.id} className={`transition-colors ${
                              isKeep ? "bg-green-50" :
                              isSel  ? "bg-blue-50"  :
                              "hover:bg-gray-50"
                            }`}>
                              <td className="px-4 py-3">
                                {isKeep ? (
                                  <ShieldCheck className="w-4 h-4 text-green-600" title="Will be kept" />
                                ) : hasData ? (
                                  <span title="Has loans or copies — protected" className="text-amber-500 text-xs font-bold">!</span>
                                ) : (
                                  <input
                                    type="checkbox"
                                    checked={isSel}
                                    disabled={isBusy}
                                    onChange={() => toggleSelect(b.id, keepId)}
                                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                  />
                                )}
                              </td>
                              <td className="px-4 py-3 font-medium text-gray-900 max-w-[200px] truncate">{b.title}</td>
                              <td className="px-4 py-3 text-xs text-gray-500">{b.authorName ?? "—"}</td>
                              <td className="px-4 py-3 text-xs font-mono text-gray-500">{b.isbn ?? "—"}</td>
                              <td className="px-4 py-3 text-xs text-gray-500">{b.publishYear ?? "—"}</td>
                              <td className="px-4 py-3 text-center">
                                <span className={`text-xs font-bold ${b.totalCopies > 0 ? "text-blue-600" : "text-gray-300"}`}>
                                  {b.totalCopies}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className={`text-xs font-bold ${b.loanCount > 0 ? "text-violet-600" : "text-gray-300"}`}>
                                  {b.loanCount}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-xs text-gray-500">
                                {new Date(b.createdAt).toLocaleDateString()}
                              </td>
                              <td className="px-4 py-3">
                                {isKeep ? (
                                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Keep</span>
                                ) : hasData ? (
                                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Protected</span>
                                ) : (
                                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">Can delete</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {/* Quick action for this group */}
                    <div className="px-4 py-2.5 border-t border-gray-100 flex items-center gap-2 bg-gray-50 flex-wrap">
                      <span className="text-xs text-gray-500">Quick:</span>
                      {group.books
                        .filter((b) => b.id !== keepId && b.loanCount === 0 && b.totalCopies === 0)
                        .map((b) => (
                          <button key={b.id}
                            onClick={async () => {
                              setBusyIds((p) => new Set([...p, b.id]));
                              const res = await fetch("/api/admin/tools/dedup-books", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ action: "delete", deleteIds: [b.id] }),
                              });
                              const r = await res.json();
                              showToast(
                                r.deleted > 0 ? `Deleted "${b.title}"` : (r.errors?.[0] ?? "Skipped"),
                                r.deleted > 0,
                              );
                              setBusyIds((p) => { const n = new Set(p); n.delete(b.id); return n; });
                              await load();
                            }}
                            disabled={busyIds.has(b.id)}
                            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-white border border-gray-200 text-gray-600 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors disabled:opacity-40">
                            {busyIds.has(b.id)
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <Trash2  className="w-3 h-3" />}
                            Delete this copy
                          </button>
                        ))}
                      {group.books.filter((b) => b.id !== keepId && b.loanCount === 0 && b.totalCopies === 0).length === 0 && (
                        <span className="text-xs text-amber-600">All duplicates are protected (have loans or copies)</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
