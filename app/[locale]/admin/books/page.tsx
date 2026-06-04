"use client";

import { useState, useEffect, useCallback } from "react";
import { useAudienceLabels, AUDIENCE_VALUES } from "@/hooks/useAudienceLabels";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import {
  Plus, Search, Edit, Trash2, BookOpen, BookMarked, Upload, Download,
  CheckSquare, X, FileText, ShoppingBasket, Loader2, ChevronRight,
  Printer, Barcode, Image, ArrowUpDown, SlidersHorizontal, Sparkles, ImageOff, ShieldAlert,
} from "lucide-react";
import Pagination from "@/components/shared/Pagination";

/* ── Material type badge ────────────────────────────────────────── */
const MAT: Record<string, { label: string; cls: string }> = {
  BOOK:      { label: "Book",      cls: "bg-blue-50   text-blue-700"   },
  MAGAZINE:  { label: "Magazine",  cls: "bg-pink-50   text-pink-700"   },
  JOURNAL:   { label: "Journal",   cls: "bg-purple-50 text-purple-700" },
  NEWSPAPER: { label: "Newspaper", cls: "bg-yellow-50 text-yellow-700" },
  DVD:       { label: "DVD",       cls: "bg-red-50    text-red-700"    },
  AUDIO_CD:  { label: "Audio CD",  cls: "bg-orange-50 text-orange-700" },
  THESIS:    { label: "Thesis",    cls: "bg-teal-50   text-teal-700"   },
  MAP:       { label: "Map",       cls: "bg-green-50  text-green-700"  },
  OTHER:     { label: "Other",     cls: "bg-gray-100  text-gray-600"   },
};


interface BranchOption { id: string; name: string; isActive: boolean }

interface Book {
  id:              string;
  title:           string;
  subtitle:        string | null;
  edition:         string | null;
  isbn:            string | null;
  barcode:         string | null;
  availableCopies: number;
  totalCopies:     number;
  callNumber:      string | null;
  location:        string | null;
  shelfLocation:   { name: string; description?: string | null } | null;
  materialType:    string;
  audienceLevel:   string;
  author:          { name: string } | null;
  coAuthors:       { id: string; name: string }[];
  category:        { name: string } | null;
  coverImage:      string | null;
  _count?:         { loans: number; ebooks: number };
}

/** Format all author names: "Primary, Co-1, Co-2" */
function authorList(book: Pick<Book, "author" | "coAuthors">): string {
  const names: string[] = [];
  if (book.author?.name) names.push(book.author.name);
  for (const ca of book.coAuthors ?? []) {
    if (ca.name && ca.name !== book.author?.name) names.push(ca.name);
  }
  return names.length > 0 ? names.join(", ") : "—";
}

interface BasketSummary {
  id:         string;
  name:       string;
  total:      number;
  tagged:     number;
  basketType: string;
}

interface CopyRow { id: string; copyNumber: number; barcode: string | null; condition: string; status: string; }

/* ── Add to Basket Modal ─────────────────────────────────────────── */
function AddToBasketModal({ bookIds, onClose, locale }: {
  bookIds: string[];
  onClose: () => void;
  locale:  string;
}) {
  /* Basket picker */
  const [baskets,    setBaskets]    = useState<BasketSummary[]>([]);
  const [baskLoading, setBaskLoading] = useState(true);
  const [busy,        setBusy]       = useState<string | null>(null);
  const [done,        setDone]       = useState<{ basketId: string; basketName: string; count: number } | null>(null);
  const [newName,     setNewName]    = useState("");
  const [creating,    setCreating]   = useState(false);
  const [createBusy,  setCreateBusy] = useState(false);
  const [error,       setError]      = useState<string | null>(null);

  /* Load baskets — ITEM type only */
  useEffect(() => {
    fetch("/api/baskets")
      .then((r) => r.json())
      .then((d) => setBaskets(Array.isArray(d) ? d.filter((b: BasketSummary) => b.basketType === "ITEM") : []))
      .catch(() => setBaskets([]))
      .finally(() => setBaskLoading(false));
  }, []);

  async function addToBasket(basketId: string, basketName: string) {
    setBusy(basketId);
    setError(null);
    const res = await fetch(`/api/baskets/${basketId}/items`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ bookIds, mode: "all-available" }),
    });
    setBusy(null);
    if (res.ok) {
      const data = await res.json() as { added?: number };
      setDone({ basketId, basketName, count: data.added ?? 0 });
    } else {
      const errData = await res.json().catch(() => ({})) as { error?: string };
      setError(errData.error ?? "Failed to add to basket");
    }
  }

  async function createAndAdd() {
    if (!newName.trim()) return;
    setCreateBusy(true);
    const res = await fetch("/api/baskets", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ name: newName.trim(), basketType: "ITEM" }),
    });
    if (res.ok) {
      const basket = await res.json() as BasketSummary;
      setBaskets((prev) => [basket, ...prev]);
      setCreating(false); setNewName("");
      await addToBasket(basket.id, basket.name);
    }
    setCreateBusy(false);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <h2 className="font-bold text-gray-900 text-lg flex items-center gap-2">
            <ShoppingBasket className="w-5 h-5 text-indigo-600" />
            Add to basket
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        {done ? (
          <div className="px-6 pb-6 text-center space-y-4">
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <CheckSquare className="w-7 h-7 text-green-600" />
            </div>
            <p className="font-semibold text-gray-800">
              {done.count} cop{done.count !== 1 ? "ies" : "y"} added to <span className="text-indigo-600">{done.basketName}</span>
            </p>
            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors">Close</button>
              <Link href={`/${locale}/admin/baskets/${done.basketId}`} onClick={onClose}
                className="flex-1 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium text-center hover:bg-indigo-700 transition-colors flex items-center justify-center gap-1">
                Open Basket <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        ) : (
          <div className="px-6 pb-6 space-y-4">

            <p className="text-sm text-gray-500 bg-indigo-50 rounded-lg px-4 py-3">
              All <span className="font-semibold text-indigo-700">available copies</span> of {bookIds.length === 1 ? "this book" : `${bookIds.length} books`} will be added.
            </p>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2">{error}</p>
            )}

            {/* Basket picker */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Choose basket:</p>
              {baskLoading ? (
                <div className="flex items-center gap-2 py-4 text-gray-400 text-sm justify-center">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading baskets…
                </div>
              ) : baskets.length === 0 && !creating ? (
                <p className="text-sm text-gray-500 text-center py-3">No baskets yet. Create one below.</p>
              ) : (
                <div className="divide-y divide-gray-50 border border-gray-100 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                  {baskets.map((basket) => (
                    <button key={basket.id} onClick={() => addToBasket(basket.id, basket.name)}
                      disabled={!!busy}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-indigo-50 transition-colors text-left disabled:opacity-50">
                      <ShoppingBasket className="w-4 h-4 text-indigo-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{basket.name}</p>
                        <p className="text-xs text-gray-400">{basket.total} copies · {basket.tagged} tagged</p>
                      </div>
                      {busy === basket.id ? <Loader2 className="w-4 h-4 animate-spin text-indigo-500 shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />}
                    </button>
                  ))}
                </div>
              )}

              {creating ? (
                <div className="flex gap-2 mt-2">
                  <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && createAndAdd()}
                    placeholder="New basket name…" autoFocus
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  <button onClick={createAndAdd} disabled={createBusy || !newName.trim()}
                    className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-60 transition-colors">
                    {createBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create"}
                  </button>
                  <button onClick={() => setCreating(false)} className="px-2 py-2 text-gray-400 hover:text-gray-600 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button onClick={() => setCreating(true)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 mt-2 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-500 hover:border-indigo-300 hover:text-indigo-600 transition-colors">
                  <Plus className="w-4 h-4" /> Create new basket
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════ */
export default function BooksPage() {
  const t      = useTranslations("books");
  const tc     = useTranslations("common");
  const locale = useLocale();
  const audienceLabels = useAudienceLabels();

  const [books,        setBooks]        = useState<Book[]>([]);
  const [total,        setTotal]        = useState(0);
  const [page,         setPage]         = useState(1);
  const [pages,        setPages]        = useState(1);
  const PAGE_SIZE = 50;

  const [query,        setQuery]        = useState("");
  const [sort,         setSort]         = useState("newest");
  const [materialType, setMaterialType] = useState("");
  const [audienceLevel,setAudienceLevel]= useState("");
  const [categoryId,   setCategoryId]   = useState("");
  const [language,     setLanguage]     = useState("");
  const [availableOnly,setAvailableOnly]= useState(false);
  const [branchFilter, setBranchFilter] = useState("");
  const [branchOptions,  setBranchOptions]  = useState<BranchOption[]>([]);
  const [categoryOptions,setCategoryOptions]= useState<{ id: string; name: string }[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [selected,     setSelected]     = useState<Set<string>>(new Set());
  const [showFilters,  setShowFilters]  = useState(false);

  // Load branches + categories for filter dropdowns
  useEffect(() => {
    fetch("/api/branches")
      .then((r) => r.ok ? r.json() : [])
      .then((brs: BranchOption[]) => { if (Array.isArray(brs)) setBranchOptions(brs.filter((b) => b.isActive)); })
      .catch(() => {});
    fetch("/api/categories")
      .then((r) => r.ok ? r.json() : [])
      .then((cats: { id: string; name: string }[]) => { if (Array.isArray(cats)) setCategoryOptions(cats); })
      .catch(() => {});
  }, []);

  /* Basket picker */
  const [basketTargetIds, setBasketTargetIds] = useState<string[] | null>(null);

  /* Import modal */
  const [importing,     setImporting]     = useState(false);
  const [importFile,    setImportFile]    = useState<File | null>(null);
  const [importResult,  setImportResult]  = useState<{ created: number; skipped: number } | null>(null);
  const [importLoading, setImportLoading] = useState(false);

  const fetchBooks = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page",  String(page));
      params.set("limit", String(PAGE_SIZE));
      if (query)        params.set("q",            query);
      if (sort)         params.set("sort",          sort);
      if (materialType)  params.set("materialType",  materialType);
      if (audienceLevel) params.set("audienceLevel", audienceLevel);
      if (categoryId)    params.set("categoryId",    categoryId);
      if (language)     params.set("language",      language);
      if (availableOnly) params.set("available",    "true");
      if (branchFilter) params.set("branchId",      branchFilter);
      const res  = await fetch(`/api/books?${params}`);
      if (!res.ok) { setBooks([]); return; }
      const data = await res.json().catch(() => ({}));
      // API returns { books, total, page, pages } when paginating
      if (data && Array.isArray(data.books)) {
        setBooks(data.books);
        setTotal(data.total ?? 0);
        setPages(data.pages ?? 1);
      } else {
        setBooks(Array.isArray(data) ? data : []);
      }
    } catch {
      setBooks([]);
    } finally {
      setLoading(false);
    }
  }, [query, sort, materialType, audienceLevel, categoryId, language, availableOnly, branchFilter, page]);

  // Reset to page 1 when any filter/sort changes (but not when page itself changes)
  useEffect(() => { setPage(1); }, [query, sort, materialType, audienceLevel, categoryId, language, availableOnly, branchFilter]);

  useEffect(() => { fetchBooks(); }, [fetchBooks]);

  async function handleDelete(id: string) {
    if (!confirm(t("confirmDelete"))) return;
    await fetch(`/api/books/${id}`, { method: "DELETE" });
    fetchBooks();
  }

  async function handleBulkDelete() {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} book(s)?`)) return;
    await Promise.all([...selected].map((id) => fetch(`/api/books/${id}`, { method: "DELETE" })));
    setSelected(new Set());
    fetchBooks();
  }

  function handleBulkExport(fmt: "xlsx" | "csv") {
    const ids = [...selected].join(",");
    window.location.href = `/api/books/export?format=${fmt}&ids=${ids}`;
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === books.length) setSelected(new Set());
    else setSelected(new Set(books.map((b) => b.id)));
  }

  async function handleImport() {
    if (!importFile) return;
    setImportLoading(true);
    const fd = new FormData();
    fd.append("file", importFile);
    const res  = await fetch("/api/books/import", { method: "POST", body: fd });
    const data = await res.json();
    setImportResult(data);
    setImportLoading(false);
    fetchBooks();
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => { setImporting(true); setImportResult(null); setImportFile(null); }}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Upload className="w-4 h-4" /> Import
          </button>

          <div className="relative group">
            <button className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
              <Download className="w-4 h-4" /> Export
            </button>
            <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 hidden group-hover:block min-w-[120px]">
              <a href="/api/books/export?format=xlsx" className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-t-lg">
                <FileText className="w-4 h-4" /> Excel
              </a>
              <a href="/api/books/export?format=csv" className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-b-lg">
                <FileText className="w-4 h-4" /> CSV
              </a>
            </div>
          </div>

          <Link
            href={`/${locale}/admin/books/labels`}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Printer className="w-4 h-4" /> Print Labels
          </Link>

          <Link
            href={`/${locale}/admin/books/enrich`}
            className="flex items-center gap-1.5 px-3 py-2 border border-violet-200 bg-violet-50 text-violet-700 rounded-lg text-sm font-medium hover:bg-violet-100 transition-colors"
          >
            <Sparkles className="w-4 h-4" /> ISBN Auto-Fill
          </Link>

          <Link
            href={`/${locale}/admin/books/covers`}
            className="flex items-center gap-1.5 px-3 py-2 border border-rose-200 bg-rose-50 text-rose-700 rounded-lg text-sm font-medium hover:bg-rose-100 transition-colors"
          >
            <ImageOff className="w-4 h-4" /> Cover Audit
          </Link>

          <Link
            href={`/${locale}/admin/books/quality`}
            className="flex items-center gap-1.5 px-3 py-2 border border-amber-200 bg-amber-50 text-amber-700 rounded-lg text-sm font-medium hover:bg-amber-100 transition-colors"
          >
            <ShieldAlert className="w-4 h-4" /> Data Quality
          </Link>

          <Link
            href={`/${locale}/admin/baskets`}
            className="flex items-center gap-1.5 px-3 py-2 border border-indigo-200 bg-indigo-50 text-indigo-700 rounded-lg text-sm font-medium hover:bg-indigo-100 transition-colors"
          >
            <ShoppingBasket className="w-4 h-4" /> Baskets
          </Link>

          <Link
            href={`/${locale}/admin/books/new`}
            className="flex items-center gap-2 bg-blue-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 transition-colors"
          >
            <Plus className="w-4 h-4" /> {t("addBook")}
          </Link>
        </div>
      </div>

      {/* Search + sort + filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-3">
        {/* Row 1: search + sort + filter toggle */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder={`${tc("search")} ${t("title").toLowerCase()}...`}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {/* Sort */}
          <div className="flex items-center gap-1.5">
            <ArrowUpDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <select value={sort} onChange={(e) => setSort(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="title">Title A → Z</option>
              <option value="title_z">Title Z → A</option>
              <option value="year">Year (newest)</option>
              <option value="year_asc">Year (oldest)</option>
              <option value="avail">Most available</option>
            </select>
          </div>

          {/* Filter toggle */}
          <button onClick={() => setShowFilters((v) => !v)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
              showFilters || materialType || audienceLevel || categoryId || language || availableOnly || branchFilter
                ? "bg-blue-50 border-blue-300 text-blue-700"
                : "border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}>
            <SlidersHorizontal className="w-4 h-4" />
            Filters
            {(materialType || audienceLevel || categoryId || language || availableOnly || branchFilter) && (
              <span className="inline-flex items-center justify-center w-4 h-4 bg-blue-600 text-white text-[10px] rounded-full font-bold">
                {[materialType, audienceLevel, categoryId, language, availableOnly, branchFilter].filter(Boolean).length}
              </span>
            )}
          </button>

          {/* Clear all filters */}
          {(materialType || audienceLevel || categoryId || language || availableOnly || branchFilter) && (
            <button onClick={() => { setMaterialType(""); setAudienceLevel(""); setCategoryId(""); setLanguage(""); setAvailableOnly(false); setBranchFilter(""); }}
              className="flex items-center gap-1 px-3 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
              <X className="w-3.5 h-3.5" /> Clear filters
            </button>
          )}
        </div>

        {/* Row 2: extra filters (collapsible) */}
        {showFilters && (
          <div className="flex flex-wrap gap-3 pt-2 border-t border-gray-100">
            {/* Material type */}
            <select value={materialType} onChange={(e) => setMaterialType(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="">{t("materialType")} — All</option>
              <option value="BOOK">{t("materialBook")}</option>
              <option value="MAGAZINE">{t("materialMagazine")}</option>
              <option value="JOURNAL">{t("materialJournal")}</option>
              <option value="NEWSPAPER">{t("materialNewspaper")}</option>
              <option value="DVD">{t("materialDvd")}</option>
              <option value="AUDIO_CD">{t("materialAudioCd")}</option>
              <option value="THESIS">{t("materialThesis")}</option>
              <option value="MAP">{t("materialMap")}</option>
              <option value="OTHER">{t("materialOther")}</option>
            </select>

            {/* Audience level */}
            <select value={audienceLevel} onChange={(e) => setAudienceLevel(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="">Audience — All</option>
              {AUDIENCE_VALUES.map((v) => (
                <option key={v} value={v}>{audienceLabels[v] ?? v}</option>
              ))}
            </select>

            {/* Category */}
            {categoryOptions.length > 0 && (
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white max-w-[200px]">
                <option value="">{t("category")} — All</option>
                {categoryOptions.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}

            {/* Language */}
            <select value={language} onChange={(e) => setLanguage(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="">Language — All</option>
              <option value="en">English</option>
              <option value="km">Khmer</option>
              <option value="fr">French</option>
              <option value="zh">Chinese</option>
              <option value="ja">Japanese</option>
              <option value="ko">Korean</option>
              <option value="th">Thai</option>
              <option value="vi">Vietnamese</option>
            </select>

            {/* Availability */}
            <label className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm cursor-pointer hover:bg-gray-50 transition-colors">
              <input type="checkbox" checked={availableOnly} onChange={(e) => setAvailableOnly(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              Available only
            </label>

            {/* Branch */}
            {branchOptions.length > 0 && (
              <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                <option value="">{t("allBranches")}</option>
                {branchOptions.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 bg-gray-950 border border-white/10 px-5 py-3 rounded-2xl shadow-2xl">
          <CheckSquare className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-semibold text-white">{selected.size} selected</span>
          <div className="h-4 w-px bg-white/20" />
          <button
            onClick={() => setBasketTargetIds([...selected])}
            className="flex items-center gap-1.5 text-sm font-semibold text-white hover:text-indigo-300 transition-colors"
          >
            <ShoppingBasket className="w-3.5 h-3.5 text-indigo-400" /> Add to basket
          </button>
          <div className="h-4 w-px bg-white/20" />
          <Link
            href={`/${locale}/admin/books/labels?ids=${[...selected].join(",")}`}
            className="flex items-center gap-1.5 text-sm font-semibold text-white hover:text-green-300 transition-colors"
          >
            <Printer className="w-3.5 h-3.5 text-green-400" /> Print labels
          </Link>
          <div className="h-4 w-px bg-white/20" />
          <button onClick={() => handleBulkExport("xlsx")} className="text-sm font-semibold text-white hover:text-sky-300 transition-colors">Excel</button>
          <button onClick={() => handleBulkExport("csv")}  className="text-sm font-semibold text-white hover:text-sky-300 transition-colors">CSV</button>
          <div className="h-4 w-px bg-white/20" />
          <button onClick={handleBulkDelete} className="text-sm font-semibold text-red-400 hover:text-red-300 transition-colors">{tc("delete")}</button>
          <button onClick={() => setSelected(new Set())} className="ml-1 p-1 text-white/50 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        {loading ? (
          <div className="p-8 text-center text-gray-400">{tc("loading")}</div>
        ) : books.length === 0 ? (
          <div className="p-8 text-center">
            <BookOpen className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-400">{t("noBooks")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="pl-4 pr-2 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={selected.size === books.length && books.length > 0}
                      onChange={toggleAll}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <th className="px-4 py-3 text-left">{t("bookTitle")}</th>
                  <th className="px-4 py-3 text-left">{t("author")}</th>
                  <th className="px-4 py-3 text-left">Barcode / ISBN</th>
                  <th className="px-4 py-3 text-left">{t("category")}</th>
                  <th className="px-4 py-3 text-left">{t("availableCopies")}</th>
                  <th className="px-4 py-3 text-left">{tc("actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {books.map((book) => {
                  return (
                    <tr
                      key={book.id}
                      className={`hover:bg-gray-50 transition-colors ${selected.has(book.id) ? "bg-blue-50" : ""}`}
                    >
                      {/* checkbox */}
                      <td className="pl-4 pr-2 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(book.id)}
                          onChange={() => toggleSelect(book.id)}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>

                      {/* title + type + location */}
                      <td className="px-4 py-3">
                        <div className="flex items-start gap-2.5">
                          {/* Mini cover */}
                          <div className="flex-shrink-0 w-8 h-10 rounded overflow-hidden bg-gray-100 border border-gray-200 shadow-sm">
                            {book.coverImage
                              // eslint-disable-next-line @next/next/no-img-element
                              ? <img src={book.coverImage} alt="" className="w-full h-full object-cover" />
                              : <div className="w-full h-full flex items-center justify-center">
                                  <Image className="w-3.5 h-3.5 text-gray-300" />
                                </div>
                            }
                          </div>
                          {/* Text */}
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="font-medium text-gray-900 text-sm">
                                {book.title}
                                {book.subtitle && <span className="text-gray-400 font-normal">: {book.subtitle}</span>}
                                {book.edition  && <span className="ml-1 text-[10px] text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded font-medium uppercase tracking-wide">{book.edition}</span>}
                              </p>
                              {book.materialType && book.materialType !== "BOOK" && (() => {
                                const mat = MAT[book.materialType] ?? { label: book.materialType, cls: "bg-gray-100 text-gray-600" };
                                return (
                                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${mat.cls}`}>
                                    {mat.label}
                                  </span>
                                );
                              })()}
                              {book.audienceLevel && book.audienceLevel !== "UNSPECIFIED" && (() => {
                                const AUD_CLS: Record<string, string> = {
                                  CHILDREN: "bg-pink-50 text-pink-700",
                                  YOUTH:    "bg-purple-50 text-purple-700",
                                  ADULTS:   "bg-blue-50 text-blue-700",
                                };
                                const cls = AUD_CLS[book.audienceLevel];
                                return cls ? (
                                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${cls}`}>
                                    {audienceLabels[book.audienceLevel] ?? book.audienceLevel}
                                  </span>
                                ) : null;
                              })()}
                              {(book._count?.ebooks ?? 0) > 0 && (
                                <span title="Linked to e-resource" className="inline-flex items-center gap-0.5 text-[10px] text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded font-medium border border-teal-100">
                                  <BookMarked className="w-2.5 h-2.5" /> E-Link
                                </span>
                              )}
                            </div>
                            {(book.shelfLocation?.name ?? book.callNumber ?? book.location) && (
                              <p className="text-xs text-gray-400 mt-0.5">{book.shelfLocation?.name ?? book.callNumber ?? book.location}</p>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3 text-sm text-gray-600">{authorList(book)}</td>
                      <td className="px-4 py-3">
                        {book.barcode
                          ? <span className="inline-flex items-center gap-1 text-xs font-mono bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded">
                              <Barcode className="w-3 h-3" />{book.barcode}
                            </span>
                          : book.isbn
                          ? <span className="text-xs text-gray-500 font-mono">{book.isbn}</span>
                          : <span className="text-xs text-gray-300">—</span>
                        }
                      </td>

                      {/* category */}
                      <td className="px-4 py-3">
                        {book.category && (
                          <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full">
                            {book.category.name}
                          </span>
                        )}
                      </td>

                      {/* availability */}
                      <td className="px-4 py-3">
                        <span className={`text-sm font-medium ${book.availableCopies > 0 ? "text-green-600" : "text-red-500"}`}>
                          {book.availableCopies}/{book.totalCopies}
                        </span>
                      </td>

                      {/* actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {/* ── Print label ── */}
                          <Link
                            href={`/${locale}/admin/books/labels?ids=${book.id}`}
                            title="Print barcode label"
                            className="p-1.5 text-gray-300 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                          >
                            <Printer className="w-4 h-4" />
                          </Link>

                          {/* ── Add to basket ── */}
                          <button
                            onClick={() => setBasketTargetIds([book.id])}
                            title="Add to basket"
                            className="p-1.5 text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors"
                          >
                            <ShoppingBasket className="w-4 h-4" />
                          </button>

                          <Link
                            href={`/${locale}/admin/books/${book.id}`}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            <Edit className="w-4 h-4" />
                          </Link>

                          <button
                            onClick={() => handleDelete(book.id)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination footer */}
        {total > 0 && (
          <div className="px-4 py-3 border-t border-gray-100">
            <Pagination
              page={page}
              pages={pages}
              total={total}
              limit={PAGE_SIZE}
              onPage={setPage}
            />
          </div>
        )}
      </div>

      {/* ── Add to Basket Modal ─────────────────────────────────────── */}
      {basketTargetIds && (
        <AddToBasketModal
          bookIds={basketTargetIds}
          locale={locale}
          onClose={() => setBasketTargetIds(null)}
        />
      )}

      {/* Import modal */}
      {importing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setImporting(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">Import Books</h2>
              <button onClick={() => setImporting(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {!importResult ? (
              <div className="space-y-4">
                <p className="text-sm text-gray-500">
                  Upload an Excel (.xlsx) or CSV file. Columns: Title, TitleKm, ISBN, Author, Category, Publisher, PublishYear, Pages, Language, CallNumber, Location, TotalCopies, Description
                </p>
                <a href="/api/books/import" className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
                  <Download className="w-4 h-4" /> Download template
                </a>
                <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center">
                  <input
                    type="file"
                    accept=".xlsx,.csv"
                    onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                    className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                </div>
                <button
                  onClick={handleImport}
                  disabled={!importFile || importLoading}
                  className="w-full flex items-center justify-center gap-2 bg-blue-900 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {importLoading ? "Importing…" : "Import"}
                </button>
              </div>
            ) : (
              <div className="space-y-4 text-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                  <CheckSquare className="w-8 h-8 text-green-600" />
                </div>
                <div>
                  <p className="text-lg font-bold text-gray-900">Import Complete</p>
                  <p className="text-sm text-gray-500 mt-1">
                    <span className="text-green-600 font-semibold">{importResult.created} created</span>
                    {" · "}
                    <span className="text-gray-400">{importResult.skipped} skipped</span>
                  </p>
                </div>
                <button
                  onClick={() => setImporting(false)}
                  className="w-full bg-gray-100 text-gray-700 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors"
                >
                  {tc("close")}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
