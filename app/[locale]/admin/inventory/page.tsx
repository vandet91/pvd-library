"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import {
  ClipboardList, Plus, CheckCircle2, XCircle, Clock, Search,
  ShoppingBasket, Barcode, AlertTriangle,
  Loader2, X, Package, Eye, EyeOff, Trash2, ChevronDown,
} from "lucide-react";

/* ── Utility: parse JSON safely (returns fallback on empty / HTML body) ── */
async function safeJson<T>(res: Response, fallback: T): Promise<T> {
  try { return (await res.json()) as T; } catch { return fallback; }
}

/* ── Types ──────────────────────────────────────────────────────── */
interface ScannedBook {
  id:        string;
  scannedAt: string;
  book: {
    id:            string;
    title:         string;
    isbn:          string | null;
    location:      string | null;
    shelfLocation?: { name: string } | null;
  };
}

interface InventorySession {
  id:          string;
  name:        string;
  notes:       string | null;
  status:      "ACTIVE" | "COMPLETED" | "CANCELLED";
  startedAt:   string;
  completedAt: string | null;
  items:       ScannedBook[];
  totalBooks:  number;
  _count:      { items: number };
}

/* ── Status chip ────────────────────────────────────────────────── */
function StatusChip({ status, label }: { status: string; label: string }) {
  const map: Record<string, string> = {
    ACTIVE:    "bg-green-100 text-green-700",
    COMPLETED: "bg-blue-100  text-blue-700",
    CANCELLED: "bg-gray-100  text-gray-500",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[status] ?? "bg-gray-100 text-gray-600"}`}>
      {label}
    </span>
  );
}

interface BasketSummary { id: string; name: string; total: number; items?: { bookId: string }[] }

export default function InventoryPage() {
  const t  = useTranslations("inventory");
  const tc = useTranslations("common");

  const STATUS_LABEL: Record<string, string> = {
    ACTIVE:    t("statusActive"),
    COMPLETED: t("statusCompleted"),
    CANCELLED: t("statusCancelled"),
  };

  /* ── List state ── */
  const [sessions,     setSessions]     = useState<InventorySession[]>([]);
  const [listLoading,  setListLoading]  = useState(true);

  /* ── Active session detail ── */
  const [active,       setActive]       = useState<InventorySession | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  /* ── Scan ── */
  const [scanQuery,    setScanQuery]    = useState("");
  const [scanBusy,     setScanBusy]     = useState(false);
  const [scanMsg,      setScanMsg]      = useState<{ text: string; ok: boolean } | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  /* ── Missing books toggle ── */
  const [showMissing,  setShowMissing]  = useState(false);
  const [missingBooks, setMissingBooks] = useState<{ id: string; title: string; isbn: string | null; location: string | null }[]>([]);
  const [missingLoading, setMissingLoading] = useState(false);

  /* ── Create session modal ── */
  const [creating,   setCreating]   = useState(false);
  const [newName,    setNewName]    = useState("");
  const [newNotes,   setNewNotes]   = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [createErr,  setCreateErr]  = useState("");

  /* ── DB basket import ── */
  const [baskets,      setBaskets]      = useState<BasketSummary[]>([]);
  const [basketOpen,   setBasketOpen]   = useState(false);
  const [basketBusy,   setBasketBusy]   = useState(false);

  /* ── Toast ── */
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  /* ── Fetch session list ── */
  const fetchList = useCallback(async () => {
    setListLoading(true);
    try {
      const res  = await fetch("/api/inventory");
      const data = await safeJson<InventorySession[]>(res, []);
      setSessions(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    } finally {
      setListLoading(false);
    }
  }, []);

  /* ── Fetch active session detail ── */
  const fetchActive = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const res  = await fetch(`/api/inventory/${id}`);
      if (!res.ok) { setDetailLoading(false); return; }
      const data = await safeJson<InventorySession | null>(res, null);
      if (data) setActive(data);
    } catch (e) {
      console.error(e);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  /* ── Fetch missing books ── */
  const fetchMissing = useCallback(async (id: string) => {
    setMissingLoading(true);
    try {
      const [invRes, booksRes] = await Promise.all([
        fetch(`/api/inventory/${id}`),
        fetch("/api/books?limit=2000"),
      ]);
      const inv   = invRes.ok   ? await safeJson<{ items: ScannedBook[] }>(invRes,   { items: [] }) : { items: [] };
      const books = booksRes.ok ? await safeJson<{ id: string; title: string; isbn: string | null; location: string | null; condition: string }[]>(booksRes, []) : [];
      const scannedIds = new Set(inv.items.map((i) => i.book.id));
      const missing = books.filter((b) => !["WITHDRAWN", "ARCHIVED"].includes(b.condition) && !scannedIds.has(b.id));
      setMissingBooks(missing);
    } catch (e) {
      console.error(e);
    } finally {
      setMissingLoading(false);
    }
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);

  /* ── Fetch DB baskets for import ── */
  useEffect(() => {
    fetch("/api/baskets")
      .then((r) => r.json())
      .then((d) => setBaskets(Array.isArray(d) ? d : []))
      .catch(() => setBaskets([]));
  }, []);

  useEffect(() => {
    const act = sessions.find((s) => s.status === "ACTIVE");
    if (act) fetchActive(act.id);
    else setActive(null);
  }, [sessions, fetchActive]);

  /* ── Create session ── */
  async function handleCreate() {
    if (!newName.trim()) { setCreateErr(t("nameRequired")); return; }
    setCreateBusy(true);
    setCreateErr("");
    try {
      const res  = await fetch("/api/inventory", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name: newName.trim(), notes: newNotes.trim() || null }),
      });
      const data = await safeJson<{ error?: string }>(res, {});
      if (res.ok) {
        setCreating(false);
        setNewName("");
        setNewNotes("");
        fetchList();
      } else {
        setCreateErr(data.error ?? t("createFailed"));
      }
    } catch (e) {
      setCreateErr(String(e));
    } finally {
      setCreateBusy(false);
    }
  }

  /* ── Scan a book ── */
  async function handleScan() {
    if (!active || !scanQuery.trim()) return;
    setScanBusy(true);
    setScanMsg(null);
    try {
      const q      = scanQuery.trim();
      const body   = q.startsWith("PVD-")
        ? { barcode: q }
        : /^[\d\-X]{9,}$/.test(q)
        ? { isbn: q }
        : { bookId: q };

      const res  = await fetch(`/api/inventory/${active.id}/scan`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      const data = await safeJson<{ book?: { title: string }; error?: string }>(res, {});
      if (res.ok) {
        setScanMsg({ text: `✓ ${data.book?.title ?? t("bookFallback")}`, ok: true });
        setScanQuery("");
        fetchActive(active.id);
        setTimeout(() => setScanMsg(null), 2500);
      } else {
        setScanMsg({ text: data.error ?? t("bookNotFound"), ok: false });
      }
    } catch (e) {
      setScanMsg({ text: String(e), ok: false });
    } finally {
      setScanBusy(false);
      scanRef.current?.focus();
    }
  }

  /* ── Import books from a DB basket into active inventory session ── */
  async function importFromDbBasket(basketId: string) {
    if (!active) return;
    setBasketBusy(true);
    setBasketOpen(false);
    try {
      /* Fetch basket items */
      const res  = await fetch(`/api/baskets/${basketId}`);
      const data = await safeJson<{ items?: { bookId: string }[] }>(res, {});
      const bookIds = (data.items ?? []).map((i) => i.bookId);
      if (bookIds.length === 0) { showToast(t("basketEmpty"), false); return; }

      let success = 0;
      for (const bookId of bookIds) {
        const r = await fetch(`/api/inventory/${active.id}/scan`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ bookId }),
        });
        if (r.ok) success++;
      }
      showToast(t("importedFromBasket", { count: success }));
      fetchActive(active.id);
    } catch (e) {
      showToast(String(e), false);
    } finally {
      setBasketBusy(false);
    }
  }

  /* ── Remove a scan ── */
  async function removeScan(bookId: string) {
    if (!active) return;
    await fetch(`/api/inventory/${active.id}/scan`, {
      method:  "DELETE",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ bookId }),
    });
    fetchActive(active.id);
  }

  /* ── Complete / Cancel session ── */
  async function setSessionStatus(status: "COMPLETED" | "CANCELLED") {
    if (!active) return;
    if (!confirm(status === "COMPLETED" ? t("confirmComplete") : t("confirmCancel"))) return;
    const res  = await fetch(`/api/inventory/${active.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ status }),
    });
    if (res.ok) {
      showToast(t(status === "COMPLETED" ? "sessionCompleted" : "sessionCancelled"));
      fetchList();
    } else {
      showToast(t("updateFailed"), false);
    }
  }

  /* ── Delete a session ── */
  async function deleteSession(id: string) {
    if (!confirm(t("confirmDelete"))) return;
    await fetch(`/api/inventory/${id}`, { method: "DELETE" });
    fetchList();
  }

  const hasActive = sessions.some((s) => s.status === "ACTIVE");
  const scannedCount = active?.items.length ?? 0;
  const totalBooks   = active?.totalBooks    ?? 0;
  const progress     = totalBooks > 0 ? Math.round((scannedCount / totalBooks) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-indigo-600" />
            {t("title")}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{t("subtitle")}</p>
        </div>
        <button
          onClick={() => { setCreating(true); setCreateErr(""); setNewName(""); setNewNotes(""); }}
          disabled={hasActive}
          title={hasActive ? t("activeSessionFirst") : ""}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Plus className="w-4 h-4" />
          {t("newSession")}
        </button>
      </div>

      {/* ── Active Session Panel ────────────────────────────────── */}
      {active && (
        <div className="bg-white rounded-2xl shadow-sm border-2 border-indigo-200">
          {/* session header */}
          <div className="px-6 py-4 border-b border-indigo-100 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <h2 className="font-bold text-gray-900 text-lg">{active.name}</h2>
                <StatusChip status="ACTIVE" label={STATUS_LABEL["ACTIVE"]} />
              </div>
              {active.notes && <p className="text-sm text-gray-500 mt-0.5">{active.notes}</p>}
              <p className="text-xs text-gray-400 mt-1">{t("started")} {new Date(active.startedAt).toLocaleDateString()}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setSessionStatus("CANCELLED")}
                className="flex items-center gap-1.5 px-3 py-2 border border-red-200 text-red-600 rounded-lg text-sm hover:bg-red-50 transition-colors"
              >
                <XCircle className="w-4 h-4" />
                {tc("cancel")}
              </button>
              <button
                onClick={() => setSessionStatus("COMPLETED")}
                className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" />
                {t("complete")}
              </button>
            </div>
          </div>

          {/* Progress */}
          <div className="px-6 py-4 border-b border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">
                {t("progress")} {scannedCount} / {totalBooks} {t("progressBooks")}
              </span>
              <span className="text-sm font-bold text-indigo-600">{progress}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-3">
              <div
                className="bg-indigo-600 h-3 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Scan input */}
          <div className="px-6 py-4 border-b border-gray-100 space-y-3">
            <p className="text-sm font-semibold text-gray-700">{t("scanSearch")}</p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  ref={scanRef}
                  type="text"
                  value={scanQuery}
                  onChange={(e) => setScanQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleScan()}
                  placeholder={t("scanHint")}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  autoFocus
                />
              </div>
              <button
                onClick={handleScan}
                disabled={scanBusy || !scanQuery.trim()}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {scanBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                {t("scan")}
              </button>
            </div>

            {scanMsg && (
              <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${
                scanMsg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
              }`}>
                {scanMsg.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
                {scanMsg.text}
              </div>
            )}

            {/* Import from DB basket */}
            <div className="relative">
              <button
                onClick={() => setBasketOpen((o) => !o)}
                disabled={scanBusy || basketBusy || baskets.length === 0}
                className="flex items-center gap-2 w-full justify-center py-2 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 text-sm font-medium hover:bg-indigo-100 transition-colors disabled:opacity-60"
              >
                {basketBusy
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <ShoppingBasket className="w-4 h-4" />
                }
                {baskets.length === 0 ? t("noBaskets") : t("importFromBasket")}
                {baskets.length > 0 && <ChevronDown className="w-4 h-4 ml-auto" />}
              </button>
              {basketOpen && baskets.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden">
                  {baskets.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => importFromDbBasket(b.id)}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left hover:bg-indigo-50 transition-colors"
                    >
                      <ShoppingBasket className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      <span className="flex-1 truncate">{b.name}</span>
                      <span className="text-xs text-gray-400">{b.total} {t("booksInBasket")}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Scanned books list */}
          {detailLoading ? (
            <div className="px-6 py-8 text-center text-gray-400 flex items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" /> {t("loading")}
            </div>
          ) : (
            <>
              <div className="px-6 py-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-700">
                  {t("scannedBooks", { count: scannedCount })}
                </p>
                <button
                  onClick={async () => {
                    if (!showMissing) {
                      setShowMissing(true);
                      await fetchMissing(active.id);
                    } else {
                      setShowMissing(false);
                    }
                  }}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-indigo-600 transition-colors"
                >
                  {showMissing ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  {showMissing ? t("hideMissing") : t("showMissing")} {t("missingCount", { count: Math.max(0, totalBooks - scannedCount) })}
                </button>
              </div>

              {active.items.length === 0 ? (
                <div className="px-6 pb-6 text-center text-gray-400 text-sm">
                  {t("noBooksScanned")}
                </div>
              ) : (
                <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
                  {active.items.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 px-6 py-2.5">
                      <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{item.book.title}</p>
                        <p className="text-xs text-gray-400">
                          {item.book.isbn ?? t("noIsbn")}
                          {(item.book.shelfLocation?.name ?? item.book.location) ? ` · ${item.book.shelfLocation?.name ?? item.book.location}` : ""}
                          {" · "}{t("scannedAt")} {new Date(item.scannedAt).toLocaleTimeString()}
                        </p>
                      </div>
                      <button
                        onClick={() => removeScan(item.book.id)}
                        title={t("undoScan")}
                        className="p-1 text-gray-300 hover:text-red-500 transition-colors shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Missing books */}
              {showMissing && (
                <div className="border-t border-amber-100 bg-amber-50">
                  <div className="px-6 py-3 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <p className="text-sm font-semibold text-amber-700">
                      {t("notYetScanned", { count: missingLoading ? "…" : missingBooks.length })}
                    </p>
                  </div>
                  {missingLoading ? (
                    <div className="px-6 pb-4 text-sm text-amber-600 flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> {t("loading")}
                    </div>
                  ) : missingBooks.length === 0 ? (
                    <p className="px-6 pb-4 text-sm text-green-700 font-medium">{t("allScanned")}</p>
                  ) : (
                    <div className="divide-y divide-amber-100 max-h-60 overflow-y-auto">
                      {missingBooks.map((b) => (
                        <div key={b.id} className="flex items-center gap-3 px-6 py-2">
                          <Package className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-800 truncate">{b.title}</p>
                            <p className="text-xs text-gray-500">
                              {b.isbn ?? t("noIsbn")}{b.location ? ` · ${b.location}` : ""}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Session History ──────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">{t("sessionHistory")}</h2>
        </div>

        {listLoading ? (
          <div className="p-8 text-center text-gray-400">{t("loading")}</div>
        ) : sessions.length === 0 ? (
          <div className="p-10 text-center">
            <ClipboardList className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-400 text-sm">{t("noSessions")}</p>
            <p className="text-gray-400 text-xs mt-1">{t("noSessionsDesc")}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center gap-4 px-5 py-3">
                <div className="shrink-0">
                  {s.status === "ACTIVE"     && <Clock       className="w-5 h-5 text-green-500" />}
                  {s.status === "COMPLETED"  && <CheckCircle2 className="w-5 h-5 text-blue-500" />}
                  {s.status === "CANCELLED"  && <XCircle     className="w-5 h-5 text-gray-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{s.name}</p>
                  <p className="text-xs text-gray-400">
                    {new Date(s.startedAt).toLocaleDateString()}
                    {s.completedAt && ` → ${new Date(s.completedAt).toLocaleDateString()}`}
                    {" · "}
                    {t("booksScannedCount", { count: s._count.items })}
                  </p>
                </div>
                <StatusChip status={s.status} label={STATUS_LABEL[s.status] ?? s.status} />
                {s.status !== "ACTIVE" && (
                  <button
                    onClick={() => deleteSession(s.id)}
                    className="p-1.5 text-gray-300 hover:text-red-500 transition-colors"
                    title={t("deleteSession")}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Create Session Modal ─────────────────────────────────── */}
      {creating && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          onClick={() => setCreating(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-gray-900 text-lg">{t("newSessionTitle")}</h2>
              <button onClick={() => setCreating(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="inv-session-name" className="block text-sm font-medium text-gray-700 mb-1">
                  {t("sessionName")}
                </label>
                <input
                  id="inv-session-name"
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  placeholder={`Annual Inventory ${new Date().getFullYear()}`}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  autoFocus
                />
              </div>
              <div>
                <label htmlFor="inv-session-notes" className="block text-sm font-medium text-gray-700 mb-1">{t("notesOptional")}</label>
                <textarea
                  id="inv-session-notes"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="e.g. Mid-year audit, 2nd floor only…"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                />
              </div>
              {createErr && (
                <p className="text-sm text-red-600 flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" /> {createErr}
                </p>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setCreating(false)}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  {tc("cancel")}
                </button>
                <button
                  onClick={handleCreate}
                  disabled={createBusy || !newName.trim()}
                  className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-60 flex items-center justify-center gap-2 transition-colors"
                >
                  {createBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                  {t("startSession")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ───────────────────────────────────────────────── */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium
          ${toast.ok ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
