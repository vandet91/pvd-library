"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  Barcode, Settings2, RefreshCw, Printer, CheckCircle2,
  AlertTriangle, Loader2, BookOpen, ChevronRight, Info,
} from "lucide-react";
import BarcodeDisplay from "@/components/admin/BarcodeDisplay";

async function safeJson<T>(res: Response, fallback: T): Promise<T> {
  try { return (await res.json()) as T; } catch { return fallback; }
}

interface BarcodeSettings { BARCODE_PREFIX: string; BARCODE_PADDING: string; }
interface BookRow { id: string; title: string; barcode: string | null; isbn: string | null; location: string | null; shelfLocation?: { name: string } | null; }

/* ─── small sub-components ─────────────────────────────────────── */
function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
        <Icon className="w-5 h-5 text-indigo-600" />
        <h2 className="font-semibold text-gray-800">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

export default function BarcodePage() {
  const locale = useLocale();
  const t      = useTranslations("barcode");

  /* ── Settings ── */
  const [prefix,      setPrefix]      = useState("PVD");
  const [padding,     setPadding]     = useState(6);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsMsg,  setSettingsMsg]  = useState<{ text: string; ok: boolean } | null>(null);

  /* ── Books without barcode ── */
  const [missing,     setMissing]     = useState<BookRow[]>([]);
  const [allBooks,    setAllBooks]    = useState<BookRow[]>([]);
  const [booksLoading, setBooksLoading] = useState(true);

  /* ── Bulk generate ── */
  const [genBusy,     setGenBusy]     = useState(false);
  const [genProgress, setGenProgress] = useState<{ done: number; total: number } | null>(null);

  /* ── Toast ── */
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  /* ── Load settings ── */
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d: BarcodeSettings) => {
        setPrefix(d.BARCODE_PREFIX ?? "PVD");
        setPadding(parseInt(d.BARCODE_PADDING ?? "6", 10) || 6);
      })
      .catch(() => {});
  }, []);

  /* ── Load books ── */
  const fetchBooks = useCallback(async () => {
    setBooksLoading(true);
    try {
      const res  = await fetch("/api/books?limit=2000");
      const data = await safeJson<BookRow[]>(res, []);
      const list = Array.isArray(data) ? data : [];
      setAllBooks(list);
      setMissing(list.filter((b) => !b.barcode));
    } catch { /* ignore */ }
    finally { setBooksLoading(false); }
  }, []);

  useEffect(() => { fetchBooks(); }, [fetchBooks]);

  /* ── Save settings ── */
  async function saveSettings() {
    if (!prefix.trim()) { setSettingsMsg({ text: t("prefixRequired"), ok: false }); return; }
    if (padding < 1 || padding > 10) { setSettingsMsg({ text: t("paddingRange"), ok: false }); return; }
    setSettingsBusy(true); setSettingsMsg(null);
    const res = await fetch("/api/settings", {
      method:  "PUT",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        BARCODE_PREFIX:  prefix.trim().toUpperCase(),
        BARCODE_PADDING: String(padding),
      }),
    });
    setSettingsBusy(false);
    if (res.ok) setSettingsMsg({ text: t("settingsSaved"), ok: true });
    else        setSettingsMsg({ text: t("settingsFailed"), ok: false });
  }

  /* ── Bulk generate barcodes for books without one ── */
  async function bulkGenerate(bookList: BookRow[]) {
    if (bookList.length === 0) return;
    setGenBusy(true);
    setGenProgress({ done: 0, total: bookList.length });
    let done = 0;
    let failed = 0;
    for (const book of bookList) {
      const res  = await fetch(`/api/books/${book.id}/barcode`, { method: "POST" });
      const data = await safeJson<{ barcode?: string; error?: string }>(res, {});
      if (data.barcode) {
        done++;
        setAllBooks((prev) => prev.map((b) => b.id === book.id ? { ...b, barcode: data.barcode! } : b));
        setMissing((prev)  => prev.filter((b) => b.id !== book.id));
      } else {
        failed++;
        console.error(`Barcode generation failed for "${book.title}":`, data.error ?? res.status);
      }
      setGenProgress({ done, total: bookList.length });
    }
    setGenBusy(false);
    setGenProgress(null);
    if (done > 0)   showToast(`✓ ${done} barcode${done !== 1 ? "s" : ""} generated`);
    if (failed > 0) showToast(`✗ ${failed} book${failed !== 1 ? "s" : ""} failed — check console`, false);
  }

  const preview = `${prefix.trim().toUpperCase() || "PVD"}-${"1".padStart(padding, "0")}`;
  const withBarcode = allBooks.filter((b) => b.barcode);

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Barcode className="w-6 h-6 text-indigo-600" />
            {t("title")}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {t("subtitle")}
          </p>
        </div>
        <Link
          href={`/${locale}/admin/books/labels`}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          <Printer className="w-4 h-4" /> {t("printAllLabels")}
        </Link>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: t("totalBooks"),    value: booksLoading ? "…" : allBooks.length,   color: "text-gray-800"  },
          { label: t("withBarcode"),   value: booksLoading ? "…" : withBarcode.length, color: "text-green-600" },
          { label: t("missingBarcode"),value: booksLoading ? "…" : missing.length,     color: "text-amber-600" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 text-center">
            <p className={`text-3xl font-bold ${color}`}>{value}</p>
            <p className="text-sm text-gray-500 mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* ── Barcode Settings ──────────────────────────────────────── */}
      <Section title={t("formatSettings")} icon={Settings2}>
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Prefix */}
            <div>
              <label htmlFor="barcode-prefix" className="block text-sm font-medium text-gray-700 mb-1">
                {t("prefix")}
                <span className="ml-1 text-xs text-gray-400 font-normal">{t("prefixHint")}</span>
              </label>
              <input
                id="barcode-prefix"
                type="text"
                value={prefix}
                onChange={(e) => setPrefix(e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 8))}
                placeholder="PVD"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>

            {/* Padding */}
            <div>
              <label htmlFor="barcode-padding" className="block text-sm font-medium text-gray-700 mb-1">
                {t("numberPadding")}
                <span className="ml-1 text-xs text-gray-400 font-normal">{t("paddingHint")}</span>
              </label>
              <input
                id="barcode-padding"
                type="number"
                min={1} max={10}
                value={padding}
                onChange={(e) => setPadding(Math.max(1, Math.min(10, parseInt(e.target.value) || 6)))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
          </div>

          {/* Live preview */}
          <div className="bg-gray-50 rounded-xl p-4 flex flex-col items-center gap-2">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t("preview")}</p>
            <BarcodeDisplay value={preview} height={60} width={2} fontSize={14} />
            <p className="text-sm font-mono text-gray-600">{preview}</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-start gap-2 flex-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {t("changeWarning")}
            </div>
            <button
              onClick={saveSettings}
              disabled={settingsBusy}
              className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-60 transition-colors"
            >
              {settingsBusy && <Loader2 className="w-4 h-4 animate-spin" />}
              {t("saveSettings")}
            </button>
          </div>

          {settingsMsg && (
            <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${
              settingsMsg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
            }`}>
              {settingsMsg.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
              {settingsMsg.text}
            </div>
          )}
        </div>
      </Section>

      {/* ── Books Missing Barcode ─────────────────────────────────── */}
      <Section title={`${t("booksMissing")} (${booksLoading ? "…" : missing.length})`} icon={AlertTriangle}>
        {booksLoading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" /> {t("loading")}
          </div>
        ) : missing.length === 0 ? (
          <div className="text-center py-8">
            <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-2" />
            <p className="text-gray-500 font-medium">{t("allHaveBarcodes")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">{t("needBarcode", { count: missing.length })}</p>
              <button
                onClick={() => bulkGenerate(missing)}
                disabled={genBusy}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-60 transition-colors"
              >
                {genBusy
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> {t("generating")}</>
                  : <><RefreshCw className="w-4 h-4" /> {t("generateAll")}</>
                }
              </button>
            </div>

            {/* Progress bar */}
            {genProgress && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>{t("generatingProgress")}</span>
                  <span>{genProgress.done} / {genProgress.total}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div
                    className="bg-indigo-600 h-2 rounded-full transition-all"
                    style={{ width: `${Math.round((genProgress.done / genProgress.total) * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Book list */}
            <div className="border border-gray-100 rounded-xl overflow-hidden divide-y divide-gray-50 max-h-72 overflow-y-auto">
              {missing.map((book) => (
                <div key={book.id} className="flex items-center gap-3 px-4 py-2.5">
                  <BookOpen className="w-4 h-4 text-gray-300 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{book.title}</p>
                    <p className="text-xs text-gray-400">
                      {book.isbn ? `ISBN: ${book.isbn}` : t("noIsbn")}
                      {(book.shelfLocation?.name ?? book.location) ? ` · ${book.shelfLocation?.name ?? book.location}` : ""}
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      const res  = await fetch(`/api/books/${book.id}/barcode`, { method: "POST" });
                      const data = await safeJson<{ barcode?: string; error?: string }>(res, {});
                      if (data.barcode) {
                        setMissing((prev)  => prev.filter((b) => b.id !== book.id));
                        setAllBooks((prev) => prev.map((b) => b.id === book.id ? { ...b, barcode: data.barcode! } : b));
                        showToast(`✓ ${data.barcode}`);
                      } else {
                        showToast(data.error ?? `Failed (${res.status})`, false);
                      }
                    }}
                    className="text-xs px-3 py-1 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 font-medium transition-colors shrink-0"
                  >
                    {t("generate")}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>

      {/* ── Books with Barcode ────────────────────────────────────── */}
      <Section title={`${t("booksWithBarcode")} (${booksLoading ? "…" : withBarcode.length})`} icon={Barcode}>
        {booksLoading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" /> {t("loading")}
          </div>
        ) : withBarcode.length === 0 ? (
          <p className="text-center text-gray-400 py-6 text-sm">{t("noBarcodes")}</p>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-end">
              <Link
                href={`/${locale}/admin/books/labels?ids=${withBarcode.map((b) => b.id).join(",")}`}
                className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition-colors"
              >
                <Printer className="w-4 h-4" /> {t("printAllLabels")}
              </Link>
            </div>
            <div className="border border-gray-100 rounded-xl overflow-hidden divide-y divide-gray-50 max-h-80 overflow-y-auto">
              {withBarcode.map((book) => (
                <div key={book.id} className="flex items-center gap-3 px-4 py-2.5">
                  <Barcode className="w-4 h-4 text-indigo-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{book.title}</p>
                    <p className="text-xs font-mono text-indigo-600">{book.barcode}</p>
                  </div>
                  <Link
                    href={`/${locale}/admin/books/labels?ids=${book.id}`}
                    title="Print label"
                    className="p-1.5 text-gray-300 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors shrink-0"
                  >
                    <Printer className="w-4 h-4" />
                  </Link>
                  <Link
                    href={`/${locale}/admin/books/${book.id}`}
                    title="Edit book"
                    className="p-1.5 text-gray-300 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors shrink-0"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium
          ${toast.ok ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
