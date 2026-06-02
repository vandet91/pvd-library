"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Search, AlertCircle, CheckCircle2, Trash2, Edit2, X,
  RefreshCw, Loader2, Hash, Check, Wrench,
} from "lucide-react";
import Pagination from "@/components/shared/Pagination";

interface BookRow {
  id:         string;
  title:      string;
  author:     string | null;
  isbn:       string | null;
  isValidLen: boolean;   // digit count is 10 or 13
  isClean:    boolean;   // digit count OK AND hyphens match formatter
  suggestion: string | null; // correctly formatted version
}

interface ApiResult {
  totalWithIsbn: number;
  issueCount:    number;
  total:         number;
  page:          number;
  pages:         number;
  books:         BookRow[];
}

type Tab = "issues" | "all";

export default function FixIsbnPage() {
  const [tab,      setTab]      = useState<Tab>("issues");
  const [data,     setData]     = useState<ApiResult | null>(null);
  const [page,     setPage]     = useState(1);
  const [loading,  setLoading]  = useState(false);
  const [query,    setQuery]    = useState("");
  const [editing,  setEditing]  = useState<string | null>(null);
  const [editVal,  setEditVal]  = useState("");
  const [busyId,   setBusyId]   = useState<string | null>(null);
  const [busyBulk, setBusyBulk] = useState<string | null>(null);
  const [toast,    setToast]    = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  };

  const load = useCallback(async (t: Tab, p: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/tools/fix-isbn?mode=${t}&page=${p}`);
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json());
    } catch (e) {
      showToast(`Load failed: ${e instanceof Error ? e.message : "error"}`, false);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(tab, page); }, [tab, page, load]);

  async function bulkAction(action: "fix-all" | "clear-invalid") {
    const label = action === "fix-all"
      ? `Fix all ${data?.issueCount ?? 0} ISBN issues? Wrong hyphens will be corrected, truly invalid codes will be cleared.`
      : `Clear ${data?.issueCount ?? 0} invalid ISBNs (wrong digit count)?`;
    if (!confirm(label)) return;
    setBusyBulk(action);
    try {
      const res = await fetch("/api/admin/tools/fix-isbn", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ action }),
      });
      const r = await res.json();
      if (!res.ok) throw new Error(r.error);
      const msg = action === "fix-all"
        ? `Fixed ${r.fixed ?? 0} hyphenation issue(s), cleared ${r.cleared ?? 0} invalid ISBN(s).`
        : `Cleared ${r.cleared ?? 0} invalid ISBN(s).`;
      showToast(msg);
      load(tab, page);
    } catch (e) {
      showToast(`${e instanceof Error ? e.message : "error"}`, false);
    } finally { setBusyBulk(null); }
  }

  async function clearOne(bookId: string) {
    setBusyId(bookId);
    try {
      const res = await fetch("/api/admin/tools/fix-isbn", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ action: "clear", bookId }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      showToast("ISBN cleared.");
      load(tab, page);
    } catch (e) {
      showToast(`${e instanceof Error ? e.message : "error"}`, false);
    } finally { setBusyId(null); }
  }

  async function saveEdit(bookId: string) {
    setBusyId(bookId);
    try {
      const res = await fetch("/api/admin/tools/fix-isbn", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ action: "update", bookId, isbn: editVal }),
      });
      const r = await res.json();
      if (!res.ok) throw new Error(r.error);
      showToast(`Saved as ${r.isbn ?? "(cleared)"}.`);
      setEditing(null);
      load(tab, page);
    } catch (e) {
      showToast(`${e instanceof Error ? e.message : "error"}`, false);
    } finally { setBusyId(null); }
  }

  const filtered = (data?.books ?? []).filter(
    (b) => !query ||
      b.title.toLowerCase().includes(query.toLowerCase()) ||
      (b.isbn ?? "").includes(query),
  );

  const issueLabel = (b: BookRow) =>
    !b.isValidLen ? "Invalid (wrong digit count)" : "Wrong hyphenation";

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Hash className="w-6 h-6 text-indigo-600" /> ISBN Manager
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Detects both <strong>invalid ISBNs</strong> (wrong digit count) and
            <strong> wrong hyphenation</strong> (e.g.&nbsp;
            <code className="bg-gray-100 px-1 rounded text-xs">978-99963-0176--6</code>
            &nbsp;→&nbsp;
            <code className="bg-gray-100 px-1 rounded text-xs">978-99963-01-76-6</code>).
          </p>
        </div>
        <button onClick={() => load(tab, page)} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Refresh
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium shadow-sm ${
          toast.ok ? "bg-green-50 border border-green-200 text-green-800" : "bg-red-50 border border-red-200 text-red-800"
        }`}>
          {toast.ok ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
          {toast.msg}
        </div>
      )}

      {/* Stats + bulk actions */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-2xl font-extrabold text-gray-900">{data.totalWithIsbn.toLocaleString()}</p>
            <p className="text-xs text-gray-500 mt-0.5">Books with ISBN</p>
          </div>
          <div className={`rounded-xl border p-4 ${data.issueCount > 0 ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}`}>
            <p className={`text-2xl font-extrabold ${data.issueCount > 0 ? "text-red-700" : "text-green-700"}`}>
              {data.issueCount.toLocaleString()}
            </p>
            <p className={`text-xs mt-0.5 ${data.issueCount > 0 ? "text-red-500" : "text-green-600"}`}>
              {data.issueCount > 0 ? "Need fixing" : "All clean ✓"}
            </p>
          </div>
          {data.issueCount > 0 && (
            <>
              <button onClick={() => bulkAction("fix-all")} disabled={!!busyBulk}
                className="flex items-center justify-center gap-2 px-3 py-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 active:scale-[0.98] transition-all disabled:opacity-50 shadow-sm">
                {busyBulk === "fix-all" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
                Fix All {data.issueCount}
              </button>
              <button onClick={() => bulkAction("clear-invalid")} disabled={!!busyBulk}
                className="flex items-center justify-center gap-2 px-3 py-3 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 active:scale-[0.98] transition-all disabled:opacity-50 shadow-sm">
                {busyBulk === "clear-invalid" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Clear Invalid Only
              </button>
            </>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {(["issues", "all"] as Tab[]).map((t) => (
          <button key={t} onClick={() => { setTab(t); setPage(1); }}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              tab === t ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
            }`}>
            {t === "issues"
              ? `Issues${data ? ` (${data.issueCount})` : ""}`
              : `All ISBNs${data ? ` (${data.totalWithIsbn})` : ""}`}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading && !data ? (
        <div className="flex items-center justify-center py-20 gap-3 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span className="text-sm">Scanning…</span>
        </div>
      ) : data && data.total === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
          <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
          <p className="font-semibold text-gray-700">
            {tab === "issues" ? "All ISBNs are clean ✓" : "No books with ISBNs"}
          </p>
          <p className="text-sm text-gray-400 mt-1">
            {tab === "issues" ? "Digit counts are correct and hyphens are properly placed." : ""}
          </p>
        </div>
      ) : data ? (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

          {/* Search */}
          <div className="p-4 border-b border-gray-100">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by title or ISBN…"
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 text-left">Title</th>
                  <th className="px-4 py-3 text-left">Author</th>
                  <th className="px-4 py-3 text-left">Stored ISBN</th>
                  <th className="px-4 py-3 text-left">Issue / Suggestion</th>
                  <th className="px-4 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((book) => (
                  <tr key={book.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 max-w-xs truncate">{book.title}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                      {book.author ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-mono text-xs px-2 py-0.5 rounded border ${
                        book.isClean
                          ? "bg-green-50 text-green-700 border-green-200"
                          : book.isValidLen
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : "bg-red-50 text-red-700 border-red-200"
                      }`}>
                        {book.isbn ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {book.isClean ? (
                        <span className="text-xs text-green-600 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Clean
                        </span>
                      ) : book.suggestion ? (
                        <span className="font-mono text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded">
                          → {book.suggestion}
                        </span>
                      ) : (
                        <span className="text-xs text-red-500">{issueLabel(book)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editing === book.id ? (
                        <div className="flex items-center gap-1.5">
                          <input type="text" value={editVal}
                            onChange={(e) => setEditVal(e.target.value)}
                            placeholder="e.g. 978-99963-01-76-6"
                            className="w-44 px-2 py-1 text-xs border border-gray-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveEdit(book.id);
                              if (e.key === "Escape") setEditing(null);
                            }}
                            autoFocus />
                          <button onClick={() => saveEdit(book.id)} disabled={busyId === book.id}
                            className="p-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">
                            {busyId === book.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          </button>
                          <button onClick={() => setEditing(null)}
                            className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          {/* Apply suggestion */}
                          {!book.isClean && book.suggestion && (
                            <button onClick={() => { setEditing(book.id); setEditVal(book.suggestion!); }}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors">
                              <Wrench className="w-3 h-3" /> Fix
                            </button>
                          )}
                          {/* Manual edit */}
                          <button onClick={() => { setEditing(book.id); setEditVal(book.isbn ?? ""); }}
                            title="Edit manually"
                            className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          {/* Clear */}
                          {!book.isClean && (
                            <button onClick={() => clearOne(book.id)} disabled={busyId === book.id}
                              title="Clear ISBN"
                              className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40">
                              {busyId === book.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="px-4 py-3 border-t border-gray-100">
            <Pagination page={data.page} pages={data.pages} onPage={setPage} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
