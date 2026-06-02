"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Printer, Loader2, ArrowLeft, BookOpen, RefreshCw, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

interface BookLabel {
  id:         string;
  title:      string;
  barcode:    string | null;
  isbn:       string | null;
  copyNumber?: number;
}

interface CopyApiRow {
  id:         string;
  copyNumber: number;
  barcode:    string | null;
  book: { id: string; title: string; isbn: string | null };
}

const SIZES = [
  { id: "small",  label: "Small  (38 × 21 mm)",  desc: "5 per row" },
  { id: "medium", label: "Medium (63 × 38 mm)",  desc: "3 per row" },
  { id: "large",  label: "Large  (99 × 57 mm)",  desc: "2 per row" },
] as const;

export default function LabelsLauncherPage() {
  const locale = useLocale();
  const t      = useTranslations("labels");
  const searchParams = useSearchParams();
  const idsParam     = searchParams.get("ids")     ?? "";
  const copyIdsParam = searchParams.get("copyIds") ?? "";
  const isCopyMode   = !!copyIdsParam;

  const [books,    setBooks]    = useState<BookLabel[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [size,     setSize]     = useState<"small" | "medium" | "large">("medium");
  const [copies,   setCopies]   = useState(1);
  const [genBusy,  setGenBusy]  = useState(false);

  const fetchBooks = useCallback(async () => {
    setLoading(true);
    try {
      // Copy mode — fetch from /api/copies
      if (isCopyMode) {
        const res  = await fetch(`/api/copies?ids=${encodeURIComponent(copyIdsParam)}`);
        const data = await res.json().catch(() => []) as CopyApiRow[];
        setBooks((Array.isArray(data) ? data : []).map((c) => ({
          id:         c.id,
          title:      c.book.title,
          barcode:    c.barcode,
          isbn:       c.book.isbn,
          copyNumber: c.copyNumber,
        })));
        return;
      }
      // Book mode (legacy)
      const res  = await fetch("/api/books?limit=50000");
      const data = await res.json().catch(() => []) as BookLabel[];
      const list = Array.isArray(data) ? data : [];
      if (idsParam) {
        const ids = new Set(idsParam.split(",").filter(Boolean));
        setBooks(list.filter((b) => ids.has(b.id)));
      } else {
        setBooks(list.filter((b) => b.barcode));
      }
    } catch { setBooks([]); }
    finally { setLoading(false); }
  }, [idsParam, copyIdsParam, isCopyMode]);

  useEffect(() => { fetchBooks(); }, [fetchBooks]);

  /* Generate barcodes for books that are missing them */
  async function generateMissing() {
    const missing = books.filter((b) => !b.barcode);
    if (missing.length === 0) return;
    setGenBusy(true);
    for (const book of missing) {
      const res  = await fetch(`/api/books/${book.id}/barcode`, { method: "POST" });
      const data = await res.json().catch(() => ({})) as { barcode?: string };
      if (data.barcode) {
        setBooks((prev) => prev.map((b) => b.id === book.id ? { ...b, barcode: data.barcode! } : b));
      }
    }
    setGenBusy(false);
  }

  function openPrintWindow() {
    let url: string;
    if (isCopyMode) {
      const ids = books.map((b) => b.id).join(",");
      url = `/${locale}/print/labels?copyIds=${ids}&size=${size}&copies=${copies}`;
    } else if (!idsParam) {
      // "all barcoded books" mode — avoid a URL with thousands of IDs
      url = `/${locale}/print/labels?filter=barcoded&size=${size}&copies=${copies}`;
    } else {
      const ids = books.map((b) => b.id).join(",");
      url = `/${locale}/print/labels?ids=${ids}&size=${size}&copies=${copies}`;
    }
    window.open(url, "_blank", "width=900,height=700,menubar=yes,toolbar=yes");
  }

  const missingCount = books.filter((b) => !b.barcode).length;
  const readyCount   = books.filter((b) =>  b.barcode).length;

  return (
    <div className="space-y-5 max-w-2xl">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/${locale}/admin/books`}
          className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Printer className="w-6 h-6 text-indigo-600" />
            {t("title")} {isCopyMode && <span className="text-xs px-2 py-1 bg-indigo-50 text-indigo-700 rounded font-medium">{t("copyMode")}</span>}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isCopyMode ? t("subtitleCopy") : t("subtitleBook")}
          </p>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-4">

        {loading ? (
          <div className="flex items-center gap-2 text-gray-400 py-4 justify-center">
            <Loader2 className="w-5 h-5 animate-spin" /> {t("loading")}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1.5 text-gray-700">
                <BookOpen className="w-4 h-4 text-gray-400" />
                <strong>{books.length}</strong> {t("booksSelected")}
              </span>
              {readyCount > 0 && (
                <span className="text-green-600 font-medium">✓ {t("readyToPrint", { count: readyCount })}</span>
              )}
              {missingCount > 0 && (
                <span className="text-amber-600 font-medium">⚠ {t("missingBarcode", { count: missingCount })}</span>
              )}
            </div>

            {missingCount > 0 && !isCopyMode && (
              <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                <p className="flex-1 text-sm text-amber-700">
                  {t("missingWarn", { count: missingCount })}
                </p>
                <button onClick={generateMissing} disabled={genBusy}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-medium hover:bg-amber-700 disabled:opacity-60 transition-colors">
                  {genBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  {t("generate")}
                </button>
              </div>
            )}
          </>
        )}

        {/* Size picker */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">{t("labelSize")}</p>
          <div className="grid grid-cols-3 gap-2">
            {SIZES.map((s) => (
              <button key={s.id} onClick={() => setSize(s.id)}
                className={`px-3 py-3 rounded-xl border-2 text-left transition-colors ${
                  size === s.id
                    ? "border-indigo-500 bg-indigo-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}>
                <p className={`text-sm font-semibold ${size === s.id ? "text-indigo-700" : "text-gray-700"}`}>
                  {s.id.charAt(0).toUpperCase() + s.id.slice(1)}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
                <p className="text-xs text-gray-400">{s.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Copies */}
        <div className="flex items-center gap-3">
          <label htmlFor="label-copies" className="text-sm font-medium text-gray-700">{t("copiesPerLabel")}</label>
          <input id="label-copies" type="number" min={1} max={10} value={copies}
            onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-20 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <span className="text-xs text-gray-400">
            {t("totalLabels", { count: books.length * copies })}
          </span>
        </div>

        {/* Print button */}
        <button
          onClick={openPrintWindow}
          disabled={loading || books.length === 0}
          className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
          {t("openPrint")}
        </button>

        <p className="text-xs text-gray-400 text-center">
          {t("printHint")}
        </p>
      </div>
    </div>
  );
}
