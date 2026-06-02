"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import {
  ShoppingCart, BookOpen, Search, Tag,
  AlertCircle, ShoppingBag, Loader2, BookMarked,
  Plus, Minus, Star, X,
} from "lucide-react";
import PublicFooter from "@/components/shared/PublicFooter";
import FontLoader from "@/components/shared/FontLoader";
import MemberHeader from "@/components/shared/MemberHeader";
import Pagination from "@/components/shared/Pagination";
import { useLibraryName } from "@/context/library-name";
import { useLibraryLogo } from "@/context/library-logo";
import { formatPrice, formatSecondary } from "@/lib/price-format";
import { getOpacTheme } from "@/lib/opac-theme";

/* ── Types ─────────────────────────────────────────────────────────────────── */

interface CopyItem {
  copyId:     string;
  copyNumber: number;
  condition:  string;
  price:      number | null;
  barcode:    string | null;
}

interface ForSaleBook {
  id:         string;
  title:      string;
  isbn:       string | null;
  coverImage: string | null;
  author:     { name: string } | null;
  category:   { name: string } | null;
  copies:     CopyItem[];
  lowestPrice: number | null;
}

const CONDITION_COLOR: Record<string, string> = {
  EXCELLENT: "text-emerald-700 bg-emerald-50 border-emerald-200",
  GOOD:      "text-green-700   bg-green-50   border-green-200",
  FAIR:      "text-amber-700   bg-amber-50   border-amber-200",
  POOR:      "text-orange-700  bg-orange-50  border-orange-200",
  DAMAGED:   "text-red-700     bg-red-50     border-red-200",
};

const CONDITION_ORDER: Record<string, number> = {
  EXCELLENT: 0, GOOD: 1, FAIR: 2, POOR: 3, DAMAGED: 4,
};

interface RawCopy {
  id: string; copyId: string; copyNumber: number; barcode: string | null;
  condition: string; price: number | null;
  title: string; isbn: string | null; coverImage: string | null;
  author: { name: string } | null; category: { name: string } | null;
}

function groupBooks(raw: RawCopy[]): ForSaleBook[] {
  const map = new Map<string, ForSaleBook>();
  for (const c of raw) {
    let entry = map.get(c.id);
    if (!entry) {
      entry = {
        id: c.id, title: c.title, isbn: c.isbn, coverImage: c.coverImage,
        author: c.author, category: c.category,
        copies: [], lowestPrice: null,
      };
      map.set(c.id, entry);
    }
    entry.copies.push({
      copyId: c.copyId, copyNumber: c.copyNumber,
      condition: c.condition, price: c.price, barcode: c.barcode,
    });
    if (c.price != null && (entry.lowestPrice == null || c.price < entry.lowestPrice)) {
      entry.lowestPrice = c.price;
    }
  }
  for (const book of map.values()) {
    book.copies.sort((a, b) =>
      (CONDITION_ORDER[a.condition] ?? 9) - (CONDITION_ORDER[b.condition] ?? 9),
    );
  }
  return Array.from(map.values());
}

/* ── Main Component ─────────────────────────────────────────────────────────── */

export default function ShopClient({
  opacTheme,
  initialEnabled,
  initialCurrency,
  initialSecCur,
  initialSecRate,
  paginationMode = "loadmore",
  paginationLimit = 20,
  footerEnabled = false,
  footerShow = [],
  footerPhone = "", footerEmail = "", footerAddress = "",
  footerTelegram = "", footerHours = "", footerFacebook = "", footerWebsite = "",
  pageBg = "light" as "light" | "white" | "dark",
  pageFont = "default",
  pageCustomFonts = [] as {name:string;url:string}[],
  fullWidth = false,
}: {
  opacTheme:       string;
  initialEnabled:  boolean;
  initialCurrency: string;
  initialSecCur:   string;
  initialSecRate:  number;
  paginationMode?: "loadmore" | "numbers";
  paginationLimit?: number;
  footerEnabled?: boolean;
  footerShow?: string[];
  footerPhone?: string; footerEmail?: string; footerAddress?: string;
  footerTelegram?: string; footerHours?: string; footerFacebook?: string; footerWebsite?: string;
  pageBg?: "light" | "white" | "dark";
  pageFont?: string;
  pageCustomFonts?: {name:string;url:string}[];
  fullWidth?: boolean;
}) {
  const cx = fullWidth ? "w-full px-4" : "max-w-6xl mx-auto px-4";
  const t                 = useTranslations("shop");
  const { data: session } = useSession();
  const locale            = useLocale();
  const libraryName       = useLibraryName();
  const libraryLogo       = useLibraryLogo();

  const [books,       setBooks]       = useState<ForSaleBook[]>([]);
  const [query,       setQuery]       = useState("");
  const [debouncedQ,  setDebouncedQ]  = useState("");
  const [page,        setPage]        = useState(1);
  const [pages,       setPages]       = useState(1);
  const [hasMore,     setHasMore]     = useState(false);
  const [total,       setTotal]       = useState(0);
  const [loading,     setLoading]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cartIds,     setCartIds]     = useState<Set<string>>(new Set());
  const [adding,      setAdding]      = useState<string | null>(null);
  const [addError,    setAddError]    = useState<string | null>(null);
  const [enabled,     setEnabled]     = useState(initialEnabled);
  const [currency,    setCurrency]    = useState(initialCurrency);
  const [secCur,      setSecCur]      = useState(initialSecCur);
  const [secRate,     setSecRate]     = useState(initialSecRate);
  const [cartCount,   setCartCount]   = useState(0);
  const [theme,       setTheme]       = useState(() => getOpacTheme(opacTheme));

  // Condition label map
  const CONDITION_LABEL: Record<string, string> = {
    EXCELLENT: t("conditionExcellent"),
    GOOD:      t("conditionGood"),
    FAIR:      t("conditionFair"),
    POOR:      t("conditionPoor"),
    DAMAGED:   t("conditionDamaged"),
  };

  // Debounce search query
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(query), 350);
    return () => clearTimeout(id);
  }, [query]);

  // Reset on filter/mode change
  useEffect(() => { setPage(1); setBooks([]); }, [debouncedQ, paginationMode]);

  const fetchBooks = useCallback(async (pageToLoad: number, append: boolean) => {
    if (append) setLoadingMore(true); else setLoading(true);
    const params = new URLSearchParams();
    if (debouncedQ) params.set("q", debouncedQ);
    params.set("page",  String(pageToLoad));
    params.set("limit", String(paginationLimit));
    const [booksRes, settingsRes] = await Promise.all([
      fetch(`/api/shop/books?${params}`),
      pageToLoad === 1 ? fetch("/api/settings") : Promise.resolve(null),
    ]);
    if (settingsRes?.ok) {
      const s: Record<string, string> = await settingsRes.json();
      if ("BOOK_SALE_ENABLED"        in s) setEnabled(s.BOOK_SALE_ENABLED === "true");
      if ("STOCK_CURRENCY"           in s) setCurrency(s.STOCK_CURRENCY ?? "USD");
      if ("STOCK_SECONDARY_CURRENCY" in s) setSecCur(s.STOCK_SECONDARY_CURRENCY ?? "");
      if ("STOCK_SECONDARY_RATE"     in s) setSecRate(parseFloat(s.STOCK_SECONDARY_RATE ?? "0") || 0);
      if ("OPAC_THEME"               in s) setTheme(getOpacTheme(s.OPAC_THEME));
    }
    const data = booksRes.ok ? await booksRes.json() : {};
    const newBooks = groupBooks(Array.isArray(data) ? data : (data.forSale ?? []));
    setBooks((prev) => append ? [...prev, ...newBooks] : newBooks);
    setPages(data.pages ?? 1);
    setHasMore(pageToLoad < (data.pages ?? 1));
    setTotal(data.total ?? 0);
    if (pageToLoad === 1 && session) {
      const cartRes  = await fetch("/api/sale/cart");
      const cartData = cartRes.ok ? await cartRes.json() : {};
      const ids = new Set<string>((cartData.items ?? []).map((i: { copyId: string }) => i.copyId));
      setCartIds(ids);
      setCartCount(ids.size);
    }
    if (append) setLoadingMore(false); else setLoading(false);
  }, [debouncedQ, paginationLimit, session]);

  useEffect(() => { fetchBooks(1, false); }, [fetchBooks]);

  async function addToCart(bookId: string, copies: CopyItem[]) {
    if (!session) return;
    setAddError(null);
    const available = copies.filter((c) => !cartIds.has(c.copyId));
    if (available.length === 0) {
      setAddError(t("allCopiesReserved"));
      setTimeout(() => setAddError(null), 4000);
      return;
    }
    setAdding(bookId);
    for (const copy of available) {
      const res = await fetch("/api/sale/cart/items", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ copyId: copy.copyId }),
      });
      if (res.ok) {
        setCartIds((prev) => new Set([...prev, copy.copyId]));
        setCartCount((c) => c + 1);
        setAdding(null);
        return;
      }
      if (res.status !== 409) break;
    }
    setAdding(null);
    setAddError(t("allCopiesReserved"));
    setTimeout(() => setAddError(null), 4000);
  }

  async function removeFromCart(bookId: string, copyId: string) {
    if (!session) return;
    setAdding(bookId);
    await fetch("/api/sale/cart/items", {
      method:  "DELETE",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ copyId }),
    });
    setCartIds((prev) => { const n = new Set(prev); n.delete(copyId); return n; });
    setCartCount((c) => Math.max(0, c - 1));
    setAdding(null);
  }

  const priceLabel = (price: number | null) =>
    price != null ? formatPrice(price, currency) : null;
  const secLabel = (price: number | null) =>
    price != null ? formatSecondary(price, secCur, secRate) : null;

  /* ── Nav ── */
  const ThemedNav = (
    <nav className="sticky top-0 z-30 backdrop-blur border-b border-white/10" style={{ background: "var(--m-nav-bg)" }}>
      <div className={`${cx} h-14 flex items-center justify-between gap-4`}>
        <div className="flex items-center gap-1">
          <Link href={`/${locale}/discover`} className="flex items-center gap-2 pr-3 mr-2 border-r border-white/20">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden ${theme.navBrandBg}`}>
              {libraryLogo
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={libraryLogo} alt={libraryName} className="w-full h-full object-contain" />
                : <BookOpen className={`w-4 h-4 ${theme.navBrandIcon}`} />}
            </div>
            <span className="text-sm font-bold text-white hidden sm:block leading-none">{libraryName}</span>
          </Link>
          <Link href={`/${locale}/discover`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white/60 hover:text-white hover:bg-white/10 transition-colors">
            <BookOpen className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t("discover")}</span>
          </Link>
          <Link href={`/${locale}/ebooks`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white/60 hover:text-white hover:bg-white/10 transition-colors">
            <BookMarked className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t("eLibrary")}</span>
          </Link>
          <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white ${theme.navActiveTab} cursor-default`}>
            <ShoppingBag className={`w-3.5 h-3.5 ${theme.navBrandIcon}`} />
            <span className="hidden sm:inline">{t("bookstore")}</span>
          </span>
        </div>
        <div className="flex items-center gap-1">
          {session && cartCount > 0 && (
            <Link href={`/${locale}/shop/cart`}
              className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white/60 hover:text-white hover:bg-white/10 transition-colors">
              <ShoppingCart className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t("cart")}</span>
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-white text-gray-900 text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                {cartCount}
              </span>
            </Link>
          )}
          <MemberHeader theme="dark" basketCount={0} />
        </div>
      </div>
    </nav>
  );

  /* ── Not available ── */
  if (!loading && !enabled) {
    return (
      <div className={`min-h-screen opac-font-root ${pageBg === "white" ? "bg-white" : pageBg === "dark" ? "bg-slate-950 page-dark" : "bg-gray-200"}`}>
      <FontLoader font={pageFont} customFonts={pageCustomFonts} />
        {ThemedNav}
        <div className="max-w-md mx-auto mt-24 text-center px-4">
          <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
            <ShoppingBag className="w-8 h-8 text-amber-300" />
          </div>
          <h1 className="text-xl font-bold text-gray-700 mb-2">{t("notAvailable")}</h1>
          <p className="text-sm text-gray-500">{t("notAvailableDesc")}</p>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className={`min-h-screen opac-font-root ${pageBg === "white" ? "bg-white" : pageBg === "dark" ? "bg-slate-950 page-dark" : "bg-gray-200"}`}>
      <FontLoader font={pageFont} customFonts={pageCustomFonts} />
      {ThemedNav}

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <header className="relative bg-[#1e1208] overflow-hidden">
        <div className="absolute inset-0 opacity-[0.06] pointer-events-none"
          style={{ backgroundImage: "repeating-linear-gradient(transparent 0,transparent 17px,rgba(255,190,80,0.9) 17px,rgba(255,190,80,0.9) 18px),repeating-linear-gradient(90deg,transparent 0,transparent 42px,rgba(255,190,80,0.35) 42px,rgba(255,190,80,0.35) 43px)" }} />
        <div className="absolute top-0 left-1/2 w-[600px] h-56 bg-amber-600/20 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/3 pointer-events-none" />
        <div className="absolute top-0 right-0 w-64 h-64 bg-orange-800/15 rounded-full blur-3xl pointer-events-none" />

        <div className={`${cx} py-8 relative z-10`}>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">

            {/* Left: title + subtitle */}
            <div>
              <div className="inline-flex items-center gap-2 bg-amber-500/15 border border-amber-500/25 text-amber-300 px-3 py-1 rounded-full text-xs font-semibold mb-3 tracking-wide uppercase">
                <ShoppingBag className="w-3 h-3" /> {t("booksForPurchase")}
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-white mb-1 tracking-tight">
                {t("heroStoreTitle")}
              </h1>
              <p className="text-white/50 text-sm">{t("heroStoreSubtitle")}</p>
            </div>

            {/* Right: search bar */}
            <div className="w-full sm:w-80 flex-shrink-0">
              <div className="flex items-stretch bg-white rounded-2xl shadow-xl ring-2 ring-white/15 focus-within:ring-white/35 transition-all duration-200 overflow-hidden">
                <div className="relative flex-1 flex items-center">
                  <Search className="absolute left-4 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t("searchPlaceholder")}
                    className="w-full pl-11 pr-4 py-3.5 text-gray-900 text-sm focus:outline-none bg-transparent"
                  />
                </div>
                {query && (
                  <button onClick={() => { setQuery(""); setDebouncedQ(""); }}
                    className="px-3 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Decorative book spines */}
        <div className="relative z-10 flex items-end justify-center gap-[3px] px-6 mt-4 h-12 overflow-hidden select-none pointer-events-none" aria-hidden>
          {["bg-red-400","bg-blue-500","bg-emerald-400","bg-amber-400","bg-violet-500","bg-pink-400","bg-teal-400","bg-orange-400","bg-indigo-400","bg-lime-500","bg-rose-400","bg-cyan-400","bg-yellow-400","bg-purple-500","bg-green-400","bg-sky-400","bg-red-500","bg-blue-400","bg-amber-500","bg-emerald-500","bg-pink-500","bg-teal-500","bg-violet-400","bg-orange-500","bg-lime-400","bg-indigo-500","bg-rose-500","bg-cyan-500"].map((color, i) => (
            <div key={i} className={`${color} rounded-t-sm opacity-50 flex-shrink-0`}
              style={{ width: `${12 + (i % 3) * 4}px`, height: `${16 + (i % 7) * 6}px` }} />
          ))}
        </div>
      </header>

      {/* ── Body ─────────────────────────────────────────────────────── */}
      <main className={`${cx} pt-10 pb-12`}>

        {/* Error toast */}
        {addError && (
          <div className="mb-5 flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl shadow-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {addError}
            <button onClick={() => setAddError(null)} className="ml-auto text-red-400 hover:text-red-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {loading ? (
          /* ── Skeleton ── */
          <div className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5 ${fullWidth ? "xl:grid-cols-6 2xl:grid-cols-8" : ""}`}>
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-[2/3] rounded-2xl bg-gray-200 mb-3" />
                <div className="h-3 bg-gray-200 rounded w-3/4 mb-1.5" />
                <div className="h-3 bg-gray-100 rounded w-1/2 mb-3" />
                <div className="h-8 bg-gray-200 rounded-xl" />
              </div>
            ))}
          </div>

        ) : books.length === 0 ? (
          /* ── Empty ── */
          <div className="text-center py-28">
            <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
              <BookOpen className="w-8 h-8 text-amber-300" />
            </div>
            <p className="text-gray-700 font-semibold">{t("noBooksTitle")}</p>
            <p className="text-sm text-gray-400 mt-1">{t("noBooksDesc")}</p>
          </div>

        ) : (
          <>
            {/* Section header — same style as Discover's New Arrivals */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500
                  flex items-center justify-center shadow-md shadow-amber-200 flex-shrink-0">
                  <ShoppingBag className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-extrabold text-gray-900 leading-tight tracking-tight">
                    {t("availableTitles")}
                  </h2>
                  <p className="text-sm text-gray-400 mt-0.5">
                    {t("titlesReady", { count: total || books.length })}
                  </p>
                </div>
              </div>
            </div>

            {/* Grid */}
            <div className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5 ${fullWidth ? "xl:grid-cols-6 2xl:grid-cols-8" : ""}`}>
              {books.map((book) => {
                const sel         = book.copies.find((c) => !cartIds.has(c.copyId)) ?? book.copies[0];
                const cartCopies  = book.copies.filter((c) => cartIds.has(c.copyId));
                const inCartCount = cartCopies.length;
                const canAddMore  = book.copies.some((c) => !cartIds.has(c.copyId));
                const busy        = adding === book.id;
                const condColor   = CONDITION_COLOR[sel.condition] ?? "text-gray-600 bg-gray-50 border-gray-200";
                const condLabel   = CONDITION_LABEL[sel.condition] ?? sel.condition;
                const bookHasPrice = book.lowestPrice != null && book.lowestPrice > 0;
                const allInCart   = book.copies.every((c) => cartIds.has(c.copyId));

                return (
                  <div key={book.id} className="group flex flex-col">
                    {/* Cover */}
                    <div className="w-full aspect-[2/3] rounded-2xl overflow-hidden relative
                      shadow-[0_4px_16px_rgba(0,0,0,0.12)]
                      group-hover:shadow-[0_12px_32px_rgba(0,0,0,0.18)] group-hover:-translate-y-2
                      transition-all duration-300 bg-gray-100 flex-shrink-0">

                      {book.coverImage ? (
                        <Image src={book.coverImage} alt={book.title} fill className="object-cover" />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-amber-100 to-stone-200 flex items-center justify-center">
                          <BookOpen className="w-10 h-10 text-stone-300" />
                        </div>
                      )}

                      {/* Condition badge — top right */}
                      <span className={`absolute top-2.5 right-2.5 text-[10px] font-bold px-2 py-0.5 rounded-md border ${condColor}`}>
                        {condLabel}
                      </span>

                      {/* Copies badge — top left */}
                      {book.copies.length > 1 && (
                        <span className="absolute top-2.5 left-2.5 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-black/55 text-white backdrop-blur-sm">
                          {t("copies", { count: book.copies.length })}
                        </span>
                      )}

                      {/* In-cart badge */}
                      {inCartCount > 0 && (
                        <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1
                          bg-amber-500 text-white px-2 py-1 rounded-lg shadow">
                          <ShoppingCart className="w-3 h-3" />
                          <span className="text-xs font-bold">{t("inCart", { count: inCartCount })}</span>
                        </div>
                      )}

                      {/* Price — bottom right */}
                      {bookHasPrice && (
                        <div className="absolute bottom-2.5 right-2.5 text-right">
                          <div className="bg-black/60 backdrop-blur-sm rounded-lg px-2 py-1">
                            <p className="text-white font-bold text-xs leading-none">
                              {book.copies.length > 1 && (
                                <span className="text-white/60 text-[9px] mr-0.5 font-normal">{t("from")} </span>
                              )}
                              {priceLabel(book.lowestPrice)}
                            </p>
                            {secLabel(book.lowestPrice) && (
                              <p className="text-white/60 text-[9px] leading-none mt-0.5">
                                ≈ {secLabel(book.lowestPrice)}
                              </p>
                            )}
                          </div>
                        </div>
                      )}

                      {/* No-price overlay */}
                      {!bookHasPrice && (
                        <div className="absolute bottom-2.5 right-2.5">
                          <span className="text-[10px] font-medium text-amber-300 bg-black/55 backdrop-blur-sm px-2 py-1 rounded-lg">
                            {t("askLibrary")}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Info + action */}
                    <div className="mt-3 flex flex-col flex-1">
                      <p className="text-sm font-bold text-gray-900 line-clamp-2 leading-snug">
                        {book.title}
                      </p>
                      <p className="text-xs text-gray-400 truncate mt-0.5">
                        {book.author?.name ?? t("unknownAuthor")}
                      </p>
                      {book.category && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-amber-700 bg-amber-50
                          px-1.5 py-0.5 rounded-full mt-1.5 w-fit border border-amber-100">
                          <Tag className="w-2 h-2" />{book.category.name}
                        </span>
                      )}

                      {/* Action button */}
                      <div className="mt-2.5">
                        {!bookHasPrice ? (
                          <div className="w-full text-center text-[11px] text-gray-400 bg-white border border-gray-200 px-2 py-2 rounded-xl">
                            {t("contactLibraryForPrice")}
                          </div>
                        ) : session ? (
                          allInCart ? (
                            <div className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold bg-amber-50 text-amber-600 border border-amber-200">
                              <ShoppingCart className="w-3.5 h-3.5" />
                              {t("allInCart")}
                            </div>
                          ) : inCartCount > 0 ? (
                            <div className="flex items-center gap-1.5 justify-between bg-white border border-amber-200 rounded-xl px-2 py-1">
                              <button
                                onClick={() => {
                                  const last = cartCopies[cartCopies.length - 1];
                                  if (last) removeFromCart(book.id, last.copyId);
                                }}
                                disabled={busy}
                                className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200
                                  flex items-center justify-center transition-colors disabled:opacity-50">
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="flex-1 text-center text-xs font-bold text-amber-700">
                                {busy ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : inCartCount}
                              </span>
                              <button
                                onClick={() => addToCart(book.id, book.copies)}
                                disabled={busy || !canAddMore}
                                className="w-7 h-7 rounded-lg bg-amber-500 text-white hover:bg-amber-600
                                  flex items-center justify-center transition-colors disabled:opacity-40">
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => addToCart(book.id, book.copies)}
                              disabled={busy}
                              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl
                                text-xs font-semibold bg-amber-500 text-white hover:bg-amber-600
                                active:scale-95 transition-all duration-150 disabled:opacity-50 shadow-sm">
                              {busy
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <ShoppingCart className="w-3.5 h-3.5" />}
                              {t("addToCart")}
                            </button>
                          )
                        ) : (
                          <Link
                            href={`/${locale}/member/login`}
                            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl
                              text-xs font-semibold bg-amber-500 text-white hover:bg-amber-600
                              transition-colors shadow-sm">
                            <Star className="w-3.5 h-3.5" />
                            {t("signInToBuy")}
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {paginationMode === "numbers" ? (
              pages > 1 && (
                <div className="mt-8">
                  <Pagination page={page} pages={pages} total={total} limit={paginationLimit}
                    onPage={(p) => { setPage(p); fetchBooks(p, false); }} />
                </div>
              )
            ) : (
              hasMore && (
                <div className="mt-8 flex justify-center">
                  <button
                    onClick={() => { const next = page + 1; setPage(next); fetchBooks(next, true); }}
                    disabled={loadingMore}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all disabled:opacity-50">
                    {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {loadingMore ? "Loading…" : "Load more"}
                  </button>
                </div>
              )
            )}

            {/* Sign-in CTA */}
            {!session && (
              <div className="mt-10 flex items-center gap-5 bg-gradient-to-r from-amber-50 to-orange-50
                border border-amber-200 rounded-2xl p-6 shadow-sm">
                <div className="w-12 h-12 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl
                  flex items-center justify-center flex-shrink-0 shadow-md shadow-amber-200">
                  <ShoppingBag className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-extrabold text-amber-900 text-base">{t("readyToBuy")}</p>
                  <p className="text-sm text-amber-700 mt-0.5">
                    <Link href={`/${locale}/member/login`}
                      className="font-bold underline underline-offset-2 hover:text-amber-900 transition-colors">
                      {t("signIn")}
                    </Link>{" "}{t("signInPrompt")}
                  </p>
                </div>
                <Link
                  href={`/${locale}/member/login`}
                  className="hidden sm:flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500
                    text-white text-sm font-semibold hover:bg-amber-600 active:scale-95
                    transition-all duration-150 shadow-sm flex-shrink-0">
                  <ShoppingCart className="w-4 h-4" />
                  {t("signInToBuy")}
                </Link>
              </div>
            )}
          </>
        )}
      </main>
    </div>

    <PublicFooter
      enabled={footerEnabled}
      show={footerShow}
      navCss={theme.navCss}
      accentHex={theme.accentHex}
      phone={footerPhone}
      email={footerEmail}
      address={footerAddress}
      telegram={footerTelegram}
      hours={footerHours}
      facebook={footerFacebook}
      website={footerWebsite}
      fullWidth={fullWidth}
    />
    </>
  );
}
