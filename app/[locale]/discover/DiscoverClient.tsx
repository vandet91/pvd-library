"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import PublicFooter from "@/components/shared/PublicFooter";
import FontLoader from "@/components/shared/FontLoader";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Search, BookOpen, BookMarked, ChevronLeft, ChevronRight,
  ShoppingCart, CheckCircle, X, Star, PlusCircle, Send, Loader2,
  Flame, ShoppingBag, ArrowRight,
} from "lucide-react";
import MemberHeader from "@/components/shared/MemberHeader";
import Pagination from "@/components/shared/Pagination";
import BookSearchChat from "@/components/BookSearchChat";
import { StarDisplay, StarInput } from "@/components/shared/StarRating";
import { getOpacTheme } from "@/lib/opac-theme";
import { useLibraryName } from "@/context/library-name";
import { useLibraryLogo } from "@/context/library-logo";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";

/* ── Types ─────────────────────────────────────────────────────────────────── */

interface Book {
  id: string; title: string; subtitle?: string | null; edition?: string | null;
  isbn: string | null; availableCopies: number; totalCopies: number;
  referenceOnly?: boolean;
  author: { name: string } | null;
  coAuthors?: { id: string; name: string }[];
  category: { name: string } | null;
  description: string | null; publishYear: number | null; pages: number | null;
  language: string | null; coverImage?: string | null; materialType?: string | null;
  _count?: { loans: number };
  avgRating?: number | null;
  ratingCount?: number;
}

interface Category { id: string; name: string }


/* ── Helpers ────────────────────────────────────────────────────────────────── */

function allAuthors(b: Pick<Book, "author" | "coAuthors">): string {
  const names: string[] = [];
  if (b.author?.name) names.push(b.author.name);
  for (const ca of b.coAuthors ?? []) {
    if (ca.name && ca.name !== b.author?.name) names.push(ca.name);
  }
  return names.join(", ");
}

const COVER_GRADIENTS = [
  "from-blue-500 to-blue-700", "from-violet-500 to-violet-700",
  "from-emerald-500 to-emerald-700", "from-rose-500 to-rose-700",
  "from-amber-500 to-amber-600", "from-cyan-500 to-cyan-700",
  "from-indigo-500 to-indigo-700", "from-pink-500 to-pink-700",
];
function coverGradient(title: string) {
  return COVER_GRADIENTS[(title.charCodeAt(0) ?? 0) % COVER_GRADIENTS.length];
}

function BookCover({ coverImage, title, className = "" }: {
  coverImage?: string | null; title: string; className?: string;
}) {
  if (coverImage) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={coverImage} alt={title} className={`w-full h-full object-cover ${className}`} />;
  }
  const initials = title.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
  return (
    <div className={`w-full h-full bg-gradient-to-br ${coverGradient(title)} flex flex-col items-center justify-center gap-2 ${className}`}>
      <BookOpen className="w-10 h-10 text-white/50" />
      <span className="text-white/90 text-sm font-bold px-3 text-center leading-tight line-clamp-3">{title}</span>
      <span className="text-white/40 text-[10px] uppercase tracking-widest font-semibold">{initials}</span>
    </div>
  );
}

const MATERIAL_TYPE_KEYS = ["BOOK","MAGAZINE","JOURNAL","NEWSPAPER","DVD","AUDIO_CD","THESIS","MAP","OTHER"] as const;
const MAT_CLS: Record<string, string> = {
  BOOK:"bg-blue-50 text-blue-700", MAGAZINE:"bg-pink-50 text-pink-700",
  JOURNAL:"bg-purple-50 text-purple-700", NEWSPAPER:"bg-yellow-50 text-yellow-700",
  DVD:"bg-red-50 text-red-700", AUDIO_CD:"bg-orange-50 text-orange-700",
  THESIS:"bg-teal-50 text-teal-700", MAP:"bg-green-50 text-green-700",
  OTHER:"bg-gray-100 text-gray-600",
};
const MAT_KEY: Record<string, string> = {
  BOOK:"materialBook", MAGAZINE:"materialMagazine", JOURNAL:"materialJournal",
  NEWSPAPER:"materialNewspaper", DVD:"materialDvd", AUDIO_CD:"materialAudioCd",
  THESIS:"materialThesis", MAP:"materialMap", OTHER:"materialOther",
};

/* ── Main Component ─────────────────────────────────────────────────────────── */

export default function DiscoverClient({
  opacTheme,
  initialSaleEnabled,
  initialAiEnabled,
  paginationMode = "loadmore",
  paginationLimit = 20,
  initialCategories = [],
  footerEnabled = false,
  footerShow = [],
  footerPhone = "", footerEmail = "", footerAddress = "",
  footerTelegram = "", footerHours = "", footerWhatsapp = "", footerWebsite = "",
  footerDescription = "",
  pageBg = "light" as "light" | "white" | "dark",
  pageFont = "default",
  pageFontEn = "default",
  pageFontKm = "default",
  pageCustomFonts = [] as {name:string;url:string}[],
  fullWidth = false,
}: {
  opacTheme: string;
  initialSaleEnabled: boolean;
  initialAiEnabled: boolean;
  paginationMode?: "loadmore" | "numbers";
  paginationLimit?: number;
  initialCategories?: Category[];
  footerEnabled?: boolean;
  footerShow?: string[];
  footerPhone?: string; footerEmail?: string; footerAddress?: string;
  footerTelegram?: string; footerHours?: string; footerWhatsapp?: string; footerWebsite?: string;
  footerDescription?: string;
  pageBg?: "light" | "white" | "dark";
  pageFont?: string;
  pageFontEn?: string;
  pageFontKm?: string;
  pageCustomFonts?: {name:string;url:string}[];
  fullWidth?: boolean;
}) {
  const cx = fullWidth ? "w-full px-4" : "max-w-6xl mx-auto px-4";
  const t   = useTranslations("opac");
  const tb  = useTranslations("books");
  const tc  = useTranslations("common");
  const tr  = useTranslations("requests");
  const trt = useTranslations("ratings");
  const locale      = useLocale();
  const libraryName = useLibraryName();
  const libraryLogo = useLibraryLogo();
  const router      = useRouter();
  const { data: session, status } = useSession();

  /* ── State ── */
  const [books,             setBooks]             = useState<Book[]>([]);
  const [newArrivals,       setNewArrivals]        = useState<Book[]>([]);
  const [mostBorrowed,      setMostBorrowed]       = useState<Book[]>([]);
  const [sectionsLoading,   setSectionsLoading]    = useState(true);
  const [categories,        setCategories]         = useState<Category[]>(initialCategories);
  const [query,             setQuery]              = useState("");
  const [categoryId,        setCategoryId]         = useState("");
  const [materialType,      setMaterialType]       = useState("");
  const [audienceLevel,     setAudienceLevel]      = useState("");
  const [audienceLabels,    setAudienceLabels]     = useState<Record<string, string>>({});
  const [availableOnly,     setAvailableOnly]      = useState(false);
  const [sortBy,            setSortBy]             = useState("title");
  const [loading,           setLoading]            = useState(true);
  const [selected,          setSelected]           = useState<Book | null>(null);
  const [availability,      setAvailability]       = useState<{
    totalCopies: number; availableNow: number; borrowed: number;
    inQueue: number; onHoldShelf: number; canReserve: boolean;
    queueFull: boolean; nextPosition: number; queueCapacity: number;
  } | null>(null);
  const [basket,            setBasket]             = useState<Set<string>>(new Set());
  const [reserving,         setReserving]          = useState<string | null>(null);
  const [toast,             setToast]              = useState<string | null>(null);
  const [reqOpen,           setReqOpen]            = useState(false);
  const [reqForm,           setReqForm]            = useState({ title: "", author: "", isbn: "", notes: "" });
  const [reqLoading,        setReqLoading]         = useState(false);
  const [aiEnabled,         setAiEnabled]          = useState(initialAiEnabled);
  const [theme,             setTheme]              = useState(getOpacTheme(opacTheme));
  const [saleEnabled,       setSaleEnabled]        = useState(initialSaleEnabled);
  const [debouncedQuery,    setDebouncedQuery]     = useState("");
  const [page,              setPage]               = useState(1);
  const [pages,             setPages]              = useState(1);
  const [hasMore,           setHasMore]            = useState(false);
  const [loadingMore,       setLoadingMore]        = useState(false);
  const [total,             setTotal]              = useState(0);

  /* Rating state */
  const [ratingData,    setRatingData]    = useState<{
    avg: number | null; count: number;
    myRating: { id: string; score: number; review: string | null } | null;
  } | null>(null);
  const [ratingScore,   setRatingScore]   = useState(0);
  const [ratingReview,  setRatingReview]  = useState("");
  const [ratingLoading, setRatingLoading] = useState(false);
  const [ratingToast,   setRatingToast]   = useState<string | null>(null);

  const autoplay = useRef(Autoplay({ delay: 4000, stopOnInteraction: false }));
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true }, [autoplay.current]);

  /* ── Effects ── */
  useEffect(() => {
    // categories already loaded server-side via initialCategories prop
    Promise.all([
      fetch("/api/books?limit=8&sort=newest").then((r) => r.json()),
      fetch("/api/books?sort=popular&limit=8").then((r) => r.json()),
    ]).then(([newest, popular]: [Book[], Book[]]) => {
      setNewArrivals(newest.slice(0, 8));
      setMostBorrowed(popular.slice(0, 8));
      setSectionsLoading(false);
    }).catch(() => setSectionsLoading(false));
    fetch("/api/settings").then((r) => r.ok ? r.json() : {})
      .then((s: Record<string, string>) => {
        // Keep in sync if settings changed since the page was SSR'd
        if ("AI_SEARCH_MEMBER"  in s) setAiEnabled(s.AI_SEARCH_MEMBER !== "false");
        if ("BOOK_SALE_ENABLED" in s) setSaleEnabled(s.BOOK_SALE_ENABLED === "true");
        if ("OPAC_THEME"        in s) setTheme(getOpacTheme(s.OPAC_THEME));
        if ("AUDIENCE_LEVEL_LABELS" in s) {
          try { setAudienceLabels(JSON.parse(s.AUDIENCE_LEVEL_LABELS)); } catch { /* ignore */ }
        }
      }).catch(() => {});
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/reservations?status=PENDING")
      .then((r) => r.ok ? r.json() : [])
      .then((data: { bookId: string }[]) => {
        if (Array.isArray(data)) setBasket(new Set(data.map((r) => r.bookId)));
      }).catch(() => {});
  }, [status]);

  // Debounce the text query — filter/sort changes stay instant
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), 350);
    return () => clearTimeout(id);
  }, [query]);

  // Reset to page 1 when any filter/sort/mode changes
  useEffect(() => { setPage(1); setBooks([]); }, [debouncedQuery, categoryId, materialType, audienceLevel, availableOnly, sortBy, paginationMode]);

  const fetchBooks = useCallback(async (pageToLoad: number, append: boolean) => {
    if (append) setLoadingMore(true); else setLoading(true);
    const params = new URLSearchParams();
    if (debouncedQuery) params.set("q", debouncedQuery);
    if (categoryId)     params.set("categoryId", categoryId);
    if (materialType)   params.set("materialType", materialType);
    if (audienceLevel)  params.set("audienceLevel", audienceLevel);
    if (availableOnly)  params.set("available", "true");
    if (sortBy)         params.set("sort", sortBy);
    params.set("page",  String(pageToLoad));
    params.set("limit", String(paginationLimit));
    const data = await fetch(`/api/books?${params}`).then((r) => r.json());
    const newBooks: Book[] = Array.isArray(data) ? data : (data.books ?? []);
    setBooks((prev) => append ? [...prev, ...newBooks] : newBooks);
    setPages(data.pages ?? 1);
    setHasMore(pageToLoad < (data.pages ?? 1));
    setTotal(data.total ?? 0);
    if (append) setLoadingMore(false); else setLoading(false);
  }, [debouncedQuery, categoryId, materialType, audienceLevel, availableOnly, sortBy, paginationLimit]);

  useEffect(() => { fetchBooks(1, false); }, [fetchBooks]);

  useEffect(() => {
    if (!selected) { setAvailability(null); return; }
    let cancelled = false;
    fetch(`/api/books/${selected.id}/availability`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (!cancelled) setAvailability(d); })
      .catch(() => { if (!cancelled) setAvailability(null); });
    return () => { cancelled = true; };
  }, [selected]);

  useEffect(() => {
    if (!selected) { setRatingData(null); setRatingScore(0); setRatingReview(""); return; }
    fetch(`/api/ratings?bookId=${selected.id}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!d) return;
        setRatingData(d);
        if (d.myRating) { setRatingScore(d.myRating.score); setRatingReview(d.myRating.review ?? ""); }
      }).catch(() => {});
  }, [selected]);

  /* ── Handlers ── */
  function patchBookRating(bookId: string, avg: number | null, count: number) {
    const patch = (list: Book[]) =>
      list.map((b) => b.id === bookId ? { ...b, avgRating: avg, ratingCount: count } : b);
    setBooks(patch); setNewArrivals(patch); setMostBorrowed(patch);
  }

  async function handleRatingSubmit() {
    if (!selected || !ratingScore) return;
    setRatingLoading(true);
    const wasExisting = !!ratingData?.myRating;
    try {
      const res = await fetch("/api/ratings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId: selected.id, score: ratingScore, review: ratingReview }),
      });
      if (res.ok) {
        const updated = await fetch(`/api/ratings?bookId=${selected.id}`).then((r) => r.json());
        setRatingData(updated);
        patchBookRating(selected.id, updated.avg, updated.count);
        setRatingToast(wasExisting ? trt("ratingUpdated") : trt("ratingSubmitted"));
        setTimeout(() => setRatingToast(null), 3000);
      }
    } finally { setRatingLoading(false); }
  }

  async function handleRatingDelete() {
    if (!ratingData?.myRating || !selected) return;
    setRatingLoading(true);
    try {
      const res = await fetch(`/api/ratings/${ratingData.myRating.id}`, { method: "DELETE" });
      if (res.ok) {
        const updated = await fetch(`/api/ratings?bookId=${selected.id}`).then((r) => r.json());
        setRatingData(updated); setRatingScore(0); setRatingReview("");
        patchBookRating(selected.id, updated.avg, updated.count);
        setRatingToast(trt("ratingDeleted"));
        setTimeout(() => setRatingToast(null), 3000);
      }
    } finally { setRatingLoading(false); }
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000); }

  function openReqModal() {
    if (status === "loading") return;
    if (status !== "authenticated") { router.push(`/${locale}/member/login`); return; }
    setReqOpen(true);
  }

  async function handleBookRequest(e: React.FormEvent) {
    e.preventDefault(); setReqLoading(true);
    const res = await fetch("/api/book-requests", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(reqForm),
    });
    setReqLoading(false);
    if (res.ok) { showToast(tr("successToast")); setReqOpen(false); setReqForm({ title: "", author: "", isbn: "", notes: "" }); }
    else { const d = await res.json().catch(() => ({})); showToast(d.error ?? tr("errorToast")); }
  }

  async function handleReserve(bookId: string) {
    if (status === "loading") return;
    if (status !== "authenticated") { router.push(`/${locale}/member/login`); return; }
    setReserving(bookId);
    const res = await fetch("/api/reservations", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bookId }),
    });
    setReserving(null);
    if (res.ok) {
      setBasket((prev) => new Set([...prev, bookId]));
      const data = await res.json().catch(() => ({}));
      const pos: number | undefined = data?.queuePosition;
      const avail: number | undefined = data?.availableNow;
      if (typeof pos === "number" && pos > 1)
        showToast(typeof avail === "number" && avail > 0 ? t("reservedQueueAvail", { pos, avail }) : t("reservedQueue", { pos }));
      else showToast(t("addedToBasket"));
    } else if (res.status === 401) {
      router.push(`/${locale}/member/login`);
    } else if (res.status === 404) {
      showToast(t("noMemberLinked"));
    } else if (res.status === 409) {
      const data = await res.json().catch(() => ({}));
      const errMsg = typeof data.error === "string" ? data.error : "";
      if (errMsg === "Already in basket") setBasket((prev) => new Set([...prev, bookId]));
      else showToast(errMsg || t("basketError"));
    } else {
      const data = await res.json().catch(() => ({}));
      showToast(typeof data.error === "string" ? data.error : t("basketError"));
    }
  }

  /* ── Computed ── */
  const heroBooks    = newArrivals.length > 0 ? newArrivals : (sectionsLoading ? [] : books.slice(0, 8));
  const showSections = !query && !categoryId && !materialType && !audienceLevel && !availableOnly;
  const isStaff      = (session?.user as { role?: string })?.role && (session?.user as { role?: string })?.role !== "MEMBER";

  /* ── Render ── */
  return (
    <>
    <div className={`min-h-screen opac-font-root ${pageBg === "white" ? "bg-white" : pageBg === "dark" ? "bg-slate-950 page-dark" : "bg-gray-200"}`}>
      <FontLoader
        fonts={pageFontEn !== "default" || pageFontKm !== "default"
          ? { en: pageFontEn, km: pageFontKm }
          : undefined}
        font={pageFont}
        customFonts={pageCustomFonts}
      />

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-[60] flex items-center gap-3 bg-gray-900 text-white px-4 py-3 rounded-xl shadow-2xl text-sm">
          <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
          {toast}
          <button onClick={() => setToast(null)}><X className="w-4 h-4 text-white/60 hover:text-white" /></button>
        </div>
      )}

      {/* Top Nav */}
      <nav className="sticky top-0 z-30 backdrop-blur border-b border-white/10" style={{ background: 'var(--m-nav-bg)' }}>
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

            <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white ${theme.navActiveTab} cursor-default`}>
              <BookOpen className={`w-3.5 h-3.5 ${theme.navBrandIcon}`} />
              <span className="hidden sm:inline">{t("discover")}</span>
            </span>

            <Link href={`/${locale}/ebooks`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white/60 hover:text-white hover:bg-white/10 transition-colors">
              <BookMarked className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t("eLibrary")}</span>
            </Link>

            {saleEnabled && (
              <Link href={`/${locale}/shop`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white/60 hover:text-white hover:bg-white/10 transition-colors">
                <ShoppingBag className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t("shop")}</span>
              </Link>
            )}
          </div>

          <MemberHeader basketCount={basket.size} theme="dark" />
        </div>
      </nav>

        {/* ── Hero ── */}
        <header className="text-white px-4 py-8 overflow-hidden relative" style={{ background: 'var(--m-hero-bg)' }}>
          <div className="absolute inset-0 pointer-events-none"
            style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.055) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
          <div className={`absolute -top-10 right-1/3 w-80 h-80 ${theme.heroGlow1} rounded-full blur-3xl pointer-events-none`} />
          <div className={`absolute bottom-0 right-0 w-64 h-64 ${theme.heroGlow2} rounded-full blur-3xl pointer-events-none`} />

          <div className={`${fullWidth ? "w-full" : "max-w-6xl mx-auto"} relative`}>
            <div className="flex items-center gap-6">
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl sm:text-3xl font-bold leading-tight mb-1">{t("heroTitle")}</h1>
                <p className="text-white/60 text-sm mb-5">{t("heroSubtitle")}</p>

                {/* Auto-search bar */}
                <div className="max-w-2xl">
                  <div className="flex items-stretch bg-white rounded-2xl shadow-xl ring-2 ring-white/15 focus-within:ring-white/35 transition-all duration-200 overflow-hidden">
                    {/* Input section */}
                    <div className="relative flex-1 min-w-0 flex items-center">
                      <div className="absolute left-4 pointer-events-none text-gray-400">
                        {loading
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <Search className="w-4 h-4" />
                        }
                      </div>
                      <input
                        id="search-input"
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") setDebouncedQuery(query); }}
                        placeholder={t("searchPlaceholder")}
                        className="w-full pl-11 pr-8 py-3.5 text-gray-900 text-sm focus:outline-none bg-transparent"
                      />
                      {query && (
                        <button
                          onClick={() => { setQuery(""); setDebouncedQuery(""); }}
                          className="absolute right-2 p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    {/* Category select */}
                    <div className="border-l border-gray-200 flex-shrink-0 flex items-center">
                      <select
                        value={categoryId}
                        onChange={(e) => setCategoryId(e.target.value)}
                        className="h-full px-3 text-sm text-gray-600 bg-white focus:outline-none cursor-pointer min-w-[130px] max-w-[160px] sm:max-w-[200px]"
                      >
                        <option value="">{t("allCategories")}</option>
                        {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

              </div>

              {/* Hero right panel — bookstore card or decorative SVG (value known from SSR) */}
              {saleEnabled ? (
                <Link
                  href={`/${locale}/shop`}
                  className="hidden xl:block flex-shrink-0 select-none group"
                  style={{ width: 270 }}
                >
                  <div className="rounded-2xl overflow-hidden shadow-2xl border border-white/10 group-hover:-translate-y-1.5 group-hover:shadow-[0_24px_64px_rgba(0,0,0,0.55)] transition-all duration-300">

                    {/* Dark navy header */}
                    <div className="flex items-center justify-between px-4 py-2.5" style={{ background: "#16142e" }}>
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: "rgba(255,255,255,0.12)" }}>
                          <BookOpen className="w-3.5 h-3.5 text-white" />
                        </div>
                        <span className="font-black text-white text-sm tracking-tight">BOOK</span>
                        <span className="text-white/40 font-light text-sm tracking-[0.18em]">store</span>
                      </div>
                      <span className="text-white/35 text-[11px]">Browse &amp; Buy</span>
                    </div>

                    {/* Warm cream bookshelf */}
                    <div className="px-3 pt-4 pb-0" style={{ background: "#f5ead5" }}>
                      <div className="flex items-end gap-[3px]">
                        {[
                          { w: 14, h: 52, c: "#8b5e3c" }, { w: 13, h: 44, c: "#5c3d2e" },
                          { w: 16, h: 58, c: "#3b4a6b" }, { w: 13, h: 48, c: "#7a5c3b" },
                          { w: 17, h: 62, c: "#c4a882" }, { w: 12, h: 42, c: "#4a3728" },
                          { w: 14, h: 56, c: "#2d3f5c" }, { w: 16, h: 47, c: "#9b7c55" },
                          { w: 13, h: 60, c: "#3d2b1e" }, { w: 12, h: 45, c: "#8a7065" },
                          { w: 15, h: 53, c: "#1e3a5f" }, { w: 13, h: 50, c: "#7c6550" },
                          { w: 16, h: 57, c: "#c8b89a" }, { w: 12, h: 41, c: "#5c4535" },
                        ].map((book, i) => (
                          <div key={i} className="rounded-t-[2px] flex-shrink-0"
                            style={{ width: book.w, height: book.h, backgroundColor: book.c }} />
                        ))}
                        {/* Plant + stacked books */}
                        <div className="ml-2 flex-shrink-0 flex flex-col items-center">
                          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                            <ellipse cx="10" cy="14" rx="7" ry="5" fill="#4ade80" transform="rotate(-25 10 14)" />
                            <ellipse cx="18" cy="12" rx="7" ry="5" fill="#22c55e" transform="rotate(20 18 12)" />
                            <ellipse cx="14" cy="16" rx="5" ry="3.5" fill="#16a34a" />
                            <rect x="12" y="19" width="4" height="7" rx="2" fill="#78350f" />
                            <rect x="8" y="25" width="12" height="2.5" rx="1.25" fill="#92400e" />
                          </svg>
                          <div className="w-10 h-2.5 rounded-sm mb-0.5" style={{ backgroundColor: "#8b5e3c" }} />
                          <div className="w-9 h-2.5 rounded-sm" style={{ backgroundColor: "#c4a882" }} />
                        </div>
                      </div>
                      {/* Wooden shelf board */}
                      <div className="h-3 w-full rounded-sm" style={{ background: "#9b6b3e", boxShadow: "0 2px 6px rgba(0,0,0,0.25)" }} />
                    </div>

                    {/* Cream CTA footer */}
                    <div className="flex items-center justify-between px-4 py-2.5" style={{ background: "#f5ead5" }}>
                      <span className="text-xs font-medium" style={{ color: "#5c4535" }}>Books for purchase</span>
                      <span className="flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-bold text-gray-900 group-hover:gap-1.5 transition-all"
                        style={{ background: "#f5b731" }}>
                        Visit Store <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>

                  </div>
                </Link>
              ) : null}
            </div>
          </div>
        </header>

        {/* ── New Arrivals carousel ── */}
        {/* ══════════════════════════════════════════════════════════
            NEW ARRIVALS — bigger cards, 4 cols max, Embla carousel
        ══════════════════════════════════════════════════════════ */}
        {showSections && heroBooks.length > 0 && (
          <section id="new-arrivals" className={`${cx} pt-10 pb-2 w-full`}>

            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-yellow-400 to-amber-500
                  flex items-center justify-center shadow-md shadow-amber-200 flex-shrink-0">
                  <Star className="w-5 h-5 text-white fill-white" />
                </div>
                <div>
                  <h2 className="text-xl font-extrabold text-gray-900 leading-tight tracking-tight">
                    {t("newArrivals")}
                  </h2>
                  <p className="text-sm text-gray-400 mt-0.5">{t("freshlyAddedSubtitle", { count: heroBooks.length })}</p>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth" })}
                  className="hidden sm:flex items-center gap-1.5 text-sm font-semibold text-gray-600
                    hover:text-gray-900 px-4 py-2 rounded-xl border border-gray-200
                    hover:border-gray-300 hover:bg-gray-50 transition-all duration-150">
                  {t("viewAll")} <ChevronRight className="w-3.5 h-3.5" />
                </button>
                {/* Arrow pair */}
                <div className="flex items-center gap-1">
                  <button onClick={() => emblaApi?.scrollPrev()}
                    className="w-9 h-9 rounded-xl bg-white border border-gray-200 shadow-sm
                      flex items-center justify-center text-gray-600
                      hover:bg-gray-900 hover:text-white hover:border-gray-900 hover:shadow-md
                      active:scale-95 transition-all duration-150">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button onClick={() => emblaApi?.scrollNext()}
                    className="w-9 h-9 rounded-xl bg-white border border-gray-200 shadow-sm
                      flex items-center justify-center text-gray-600
                      hover:bg-gray-900 hover:text-white hover:border-gray-900 hover:shadow-md
                      active:scale-95 transition-all duration-150">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            <div ref={emblaRef} className="overflow-hidden py-3 -my-3">
              <div className="flex -ml-5">
                {heroBooks.map((book) => (
                  <div key={book.id}
                    className={`flex-[0_0_calc(50%+10px)] sm:flex-[0_0_calc(33.333%+7px)] md:flex-[0_0_calc(25%+5px)] lg:flex-[0_0_calc(20%+4px)] ${fullWidth ? "lg:flex-[0_0_calc(16.666%+3px)] xl:flex-[0_0_calc(14.285%+3px)] 2xl:flex-[0_0_calc(11.111%+2px)]" : ""} min-w-0 pl-5 flex flex-col`}>
                    <button className="w-full text-left group flex flex-col" onClick={() => setSelected(book)}>
                      {/* Cover */}
                      <div className="w-full aspect-[2/3] rounded-2xl overflow-hidden
                        shadow-[0_4px_16px_rgba(0,0,0,0.12)]
                        group-hover:shadow-[0_12px_32px_rgba(0,0,0,0.18)] group-hover:-translate-y-2
                        transition-all duration-300 bg-gray-100 flex-shrink-0 relative">
                        <BookCover coverImage={book.coverImage} title={book.title} />

                        {/* NEW badge */}
                        <div className="absolute top-2.5 left-2.5 bg-yellow-400 text-gray-900
                          text-[10px] font-extrabold px-2 py-0.5 rounded-md tracking-wide uppercase shadow-sm">
                          NEW
                        </div>

                        {/* Rating */}
                        {(book.avgRating || (book.ratingCount ?? 0) > 0) && (
                          <div className="absolute bottom-2.5 left-2.5 flex items-center gap-0.5
                            bg-black/60 backdrop-blur-sm text-white px-2 py-1 rounded-lg">
                            <span className="text-amber-400 text-xs">★</span>
                            <span className="text-xs font-bold">{book.avgRating?.toFixed(1)}</span>
                          </div>
                        )}

                        {/* Availability */}
                        <div className={`absolute top-2.5 right-2.5 w-3 h-3 rounded-full border-2 border-white shadow
                          ${book.availableCopies > 0 ? "bg-emerald-400" : "bg-red-400"}`} />
                      </div>

                      {/* Text */}
                      <div className="mt-3 h-[56px] overflow-hidden">
                        <p className="text-sm font-bold text-gray-900 line-clamp-2 leading-snug">{book.title}</p>
                        <p className="text-xs text-gray-400 truncate mt-0.5">{allAuthors(book) || " "}</p>
                      </div>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ══════════════════════════════════════════════════════════
            MOST BORROWED — ranked cards with rank numbers
        ══════════════════════════════════════════════════════════ */}
        {showSections && mostBorrowed.length > 0 && (
          <section id="most-borrowed" className={`${cx} pt-8 pb-2 w-full`}>

            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-orange-400 to-red-500
                  flex items-center justify-center shadow-md shadow-orange-200 flex-shrink-0">
                  <Flame className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-extrabold text-gray-900 leading-tight tracking-tight">
                    {t("mostBorrowed")}
                  </h2>
                  <p className="text-sm text-gray-400 mt-0.5">{t("trendingSubtitle")}</p>
                </div>
              </div>
              <button
                onClick={() => document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth" })}
                className="flex items-center gap-1.5 text-sm font-semibold text-gray-600
                  hover:text-gray-900 px-4 py-2 rounded-xl border border-gray-200
                  hover:border-gray-300 hover:bg-gray-50 transition-all duration-150">
                View all <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex gap-5 overflow-x-auto pt-3 -mt-3 pb-4 scrollbar-hide">
              {mostBorrowed.map((book, idx) => (
                <button key={book.id} onClick={() => setSelected(book)}
                  className={`flex-shrink-0 w-[calc(50%-10px)] sm:w-[calc(33.333%-14px)] md:w-[calc(25%-15px)] lg:w-[calc(20%-16px)] ${fullWidth ? "lg:w-[calc(16.666%-17px)] xl:w-[calc(14.285%-17px)] 2xl:w-[calc(11.111%-18px)]" : ""} text-left group flex flex-col`}>

                  {/* Cover */}
                  <div className="w-full aspect-[2/3] rounded-2xl overflow-hidden relative
                    shadow-[0_4px_16px_rgba(0,0,0,0.12)]
                    group-hover:shadow-[0_12px_32px_rgba(0,0,0,0.18)] group-hover:-translate-y-2
                    transition-all duration-300 bg-gray-100 flex-shrink-0">
                    <BookCover coverImage={book.coverImage} title={book.title} />

                    {/* Rank badge */}
                    <div className={`absolute top-2.5 left-2.5 w-7 h-7 rounded-lg flex items-center justify-center
                      text-xs font-extrabold shadow-md border border-white/30
                      ${idx === 0 ? "bg-yellow-400 text-gray-900"
                        : idx === 1 ? "bg-gray-300 text-gray-700"
                        : idx === 2 ? "bg-amber-600 text-white"
                        : "bg-black/60 backdrop-blur-sm text-white"}`}>
                      {idx + 1}
                    </div>

                    {/* Borrow count */}
                    {(book._count?.loans ?? 0) > 0 && (
                      <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1
                        bg-black/60 backdrop-blur-sm text-white px-2 py-1 rounded-lg">
                        <Flame className="w-3 h-3 text-orange-400" />
                        <span className="text-xs font-bold">
                          {(book._count!.loans) > 999
                            ? `${((book._count!.loans) / 1000).toFixed(1)}k`
                            : book._count!.loans}
                        </span>
                      </div>
                    )}

                    {/* Rating */}
                    {(book.avgRating || (book.ratingCount ?? 0) > 0) && (
                      <div className="absolute bottom-2.5 right-2.5 flex items-center gap-0.5
                        bg-black/60 backdrop-blur-sm text-white px-2 py-1 rounded-lg">
                        <span className="text-amber-400 text-xs">★</span>
                        <span className="text-xs font-bold">{book.avgRating?.toFixed(1)}</span>
                      </div>
                    )}

                    <div className={`absolute top-2.5 right-2.5 w-3 h-3 rounded-full border-2 border-white shadow
                      ${book.availableCopies > 0 ? "bg-emerald-400" : "bg-red-400"}`} />
                  </div>

                  {/* Text */}
                  <div className="mt-3 h-[56px] overflow-hidden">
                    <p className="text-sm font-bold text-gray-900 line-clamp-2 leading-snug">{book.title}</p>
                    <p className="text-xs text-gray-400 truncate mt-0.5">{allAuthors(book) || " "}</p>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ── Bookstore Banner (hidden on xl — shown in hero right panel there) ── */}
        {showSections && saleEnabled && (
          <section className={`${cx} pt-4 pb-2 w-full xl:hidden`}>
            <Link href={`/${locale}/shop`} className="block group">
              <div className="rounded-2xl overflow-hidden shadow-md hover:shadow-xl group-hover:-translate-y-0.5 transition-all duration-300 cursor-pointer">

                {/* Dark navy header */}
                <div className="flex items-center justify-between px-5 py-3" style={{ background: "#16142e" }}>
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "rgba(255,255,255,0.12)" }}>
                      <BookOpen className="w-4 h-4 text-white" />
                    </div>
                    <span className="font-black text-white text-base tracking-tight">BOOK</span>
                    <span className="text-white/40 font-light text-base tracking-[0.18em]">store</span>
                  </div>
                  <span className="text-white/35 text-xs">Browse &amp; Buy</span>
                </div>

                {/* Warm cream bookshelf */}
                <div className="px-4 pt-5 pb-0" style={{ background: "#f5ead5" }}>
                  <div className="flex items-end gap-[3px]">
                    {[
                      { w: 15, h: 54, c: "#8b5e3c" }, { w: 13, h: 46, c: "#5c3d2e" },
                      { w: 17, h: 60, c: "#3b4a6b" }, { w: 14, h: 50, c: "#7a5c3b" },
                      { w: 18, h: 65, c: "#c4a882" }, { w: 13, h: 44, c: "#4a3728" },
                      { w: 15, h: 58, c: "#2d3f5c" }, { w: 17, h: 49, c: "#9b7c55" },
                      { w: 14, h: 62, c: "#3d2b1e" }, { w: 13, h: 47, c: "#8a7065" },
                      { w: 16, h: 55, c: "#1e3a5f" }, { w: 14, h: 52, c: "#7c6550" },
                      { w: 17, h: 59, c: "#c8b89a" }, { w: 13, h: 43, c: "#5c4535" },
                      { w: 15, h: 56, c: "#3b5c8a" }, { w: 14, h: 48, c: "#6b4c35" },
                    ].map((book, i) => (
                      <div key={i} className="rounded-t-[2px] flex-shrink-0"
                        style={{ width: book.w, height: book.h, backgroundColor: book.c }} />
                    ))}
                    {/* Plant + stacked books */}
                    <div className="ml-auto flex-shrink-0 flex flex-col items-center">
                      <svg width="34" height="34" viewBox="0 0 28 28" fill="none">
                        <ellipse cx="10" cy="14" rx="7" ry="5" fill="#4ade80" transform="rotate(-25 10 14)" />
                        <ellipse cx="18" cy="12" rx="7" ry="5" fill="#22c55e" transform="rotate(20 18 12)" />
                        <ellipse cx="14" cy="16" rx="5" ry="3.5" fill="#16a34a" />
                        <rect x="12" y="19" width="4" height="7" rx="2" fill="#78350f" />
                        <rect x="8" y="25" width="12" height="2.5" rx="1.25" fill="#92400e" />
                      </svg>
                      <div className="w-12 h-3 rounded-sm mb-0.5" style={{ backgroundColor: "#8b5e3c" }} />
                      <div className="w-10 h-3 rounded-sm" style={{ backgroundColor: "#c4a882" }} />
                    </div>
                  </div>
                  {/* Wooden shelf board */}
                  <div className="h-3.5 w-full rounded-sm" style={{ background: "#9b6b3e", boxShadow: "0 2px 8px rgba(0,0,0,0.28)" }} />
                </div>

                {/* Cream CTA footer */}
                <div className="flex items-center justify-between px-5 py-3" style={{ background: "#f5ead5" }}>
                  <span className="text-sm font-medium" style={{ color: "#5c4535" }}>Books available for purchase</span>
                  <span className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold text-gray-900 group-hover:gap-2 transition-all"
                    style={{ background: "#f5b731" }}>
                    Visit Store <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>

              </div>
            </Link>
          </section>
        )}

        {/* ── Catalog ── */}
        <main id="catalog" className={`${cx} py-6 min-h-[60vh] w-full`}>
          <div id="catalog-filters" className="flex flex-wrap items-center gap-3 mb-6 pb-4 border-b border-gray-200 min-w-0">
            {/* Sort */}
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium">
              <option value="barcode">№ Number</option>
              <option value="title">Title A → Z</option>
              <option value="title_z">Title Z → A</option>
              <option value="newest">Newest</option>
              <option value="year">Year ↓</option>
              <option value="avail">Available first</option>
            </select>

            {/* Category */}
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-[180px] truncate">
              <option value="">{t("allCategories")}</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>

            {/* Material type */}
            <select value={materialType} onChange={(e) => setMaterialType(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">{t("allTypes")}</option>
              {MATERIAL_TYPE_KEYS.map((mt) => (
                <option key={mt} value={mt}>{tb(MAT_KEY[mt] as Parameters<typeof tb>[0])}</option>
              ))}
            </select>

            {/* Audience level */}
            <select value={audienceLevel} onChange={(e) => setAudienceLevel(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Audience — All</option>
              <option value="CHILDREN">{audienceLabels["CHILDREN"] ?? "Children"}</option>
              <option value="YOUTH">{audienceLabels["YOUTH"] ?? "Youth"}</option>
              <option value="ADULTS">{audienceLabels["ADULTS"] ?? "Adults"}</option>
            </select>

            {/* Available only */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={availableOnly} onChange={(e) => setAvailableOnly(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              <span className="text-sm text-gray-700">{t("availableOnly")}</span>
            </label>

            {/* Clear filters */}
            {(query || categoryId || materialType || audienceLevel || availableOnly) && (
              <button onClick={() => { setQuery(""); setCategoryId(""); setMaterialType(""); setAudienceLevel(""); setAvailableOnly(false); }}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2.5 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
                <X className="w-3 h-3" /> {t("allBooks") ? "Clear" : "Clear"}
              </button>
            )}

            <span className="ml-auto text-sm text-gray-400">{total} {t("allBooks").toLowerCase()}</span>
          </div>

          {loading ? (
            <div className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 ${fullWidth ? "xl:grid-cols-7 2xl:grid-cols-9" : ""}`}>
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="animate-pulse flex flex-col">
                  <div className="w-full aspect-[2/3] bg-gray-200 rounded-2xl flex-shrink-0" />
                  <div className="mt-2.5 h-[52px]">
                    <div className="h-3.5 bg-gray-200 rounded-full w-4/5 mb-1.5" />
                    <div className="h-3 bg-gray-100 rounded-full w-3/5" />
                  </div>
                </div>
              ))}
            </div>
          ) : books.length === 0 ? (
            <div className="text-center py-20">
              <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400">{t("noResults")}</p>
            </div>
          ) : (
            <div className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5 ${fullWidth ? "xl:grid-cols-7 2xl:grid-cols-9" : ""}`}>
              {books.map((book) => (
                <div key={book.id} className="group cursor-pointer flex flex-col" onClick={() => setSelected(book)}>
                  {/* ── Cover — fixed aspect, all identical ── */}
                  <div className="relative w-full aspect-[2/3] rounded-2xl overflow-hidden bg-gray-100
                    shadow-md group-hover:shadow-xl group-hover:-translate-y-1.5
                    transition-all duration-300 ease-out flex-shrink-0">
                    <BookCover coverImage={book.coverImage} title={book.title} />

                    <div className={`absolute top-2.5 right-2.5 w-3 h-3 rounded-full border-2 border-white shadow-sm
                      ${book.availableCopies > 0 ? "bg-emerald-400" : "bg-red-400"}`} />

                    {(book.avgRating || (book.ratingCount ?? 0) > 0) && (
                      <div className="absolute top-2.5 left-2.5 flex items-center gap-0.5
                        bg-black/55 backdrop-blur-sm text-white px-2 py-0.5 rounded-full">
                        <span className="text-amber-400 text-[11px] leading-none">★</span>
                        <span className="text-[11px] font-semibold leading-none">{book.avgRating?.toFixed(1)}</span>
                      </div>
                    )}

                    <div className="absolute inset-x-0 bottom-0 p-2.5
                      translate-y-full group-hover:translate-y-0 transition-transform duration-200">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleReserve(book.id); }}
                        disabled={status === "loading" || reserving === book.id || basket.has(book.id)}
                        className={`w-full flex items-center justify-center gap-1.5 text-xs py-2 rounded-xl font-semibold transition-colors shadow-lg
                          ${basket.has(book.id) ? "bg-emerald-500 text-white" : "bg-white text-gray-900 hover:bg-gray-50"}
                          disabled:opacity-70`}>
                        {basket.has(book.id)
                          ? <><CheckCircle className="w-3.5 h-3.5" />{t("alreadyInBasketBtn")}</>
                          : reserving === book.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <><ShoppingCart className="w-3.5 h-3.5" />{t("reserve")}</>}
                      </button>
                    </div>
                  </div>

                  {/* ── Text — fixed height so all cards align ── */}
                  <div className="mt-2.5 h-[52px] flex flex-col justify-start overflow-hidden">
                    <p className="text-sm font-semibold text-gray-900 line-clamp-2 leading-snug">
                      {book.title}
                    </p>
                    <p className="text-xs text-gray-400 truncate mt-0.5">
                      {allAuthors(book) || " "}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {paginationMode === "numbers" ? (
            pages > 1 && (
              <div className="mt-8">
                <Pagination page={page} pages={pages} total={total} limit={paginationLimit}
                  onPage={(p) => {
                    setPage(p); fetchBooks(p, false);
                    const el = document.getElementById("catalog-filters");
                    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 56, behavior: "instant" });
                  }} />
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

          {/* CTA */}
          <div className="mt-12">
            <div className={`${theme.ctaBg} rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4`}>
              <div>
                <h3 className="text-white font-semibold text-base">{t("ctaTitle")}</h3>
                <p className="text-blue-200 text-sm mt-0.5">{t("ctaSubtitle")}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={openReqModal}
                  className="flex items-center gap-2 bg-white text-gray-800 px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors">
                  <PlusCircle className="w-4 h-4" />{t("requestABook")}
                </button>
                <Link href={`/${locale}/requests`}
                  className="flex items-center gap-2 bg-white/15 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-white/25 transition-colors">
                  {t("myRequests")}
                </Link>
              </div>
            </div>
          </div>
        </main>

        {/* ── Book Detail Modal ── */}
        {selected && (
          <div className="animate-modal-backdrop fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={() => setSelected(null)}>
            <div className="animate-modal-in bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="flex gap-4 p-5">
                <div className="flex-shrink-0 w-28 aspect-[2/3] rounded-xl overflow-hidden shadow-md bg-gray-100">
                  <BookCover coverImage={selected.coverImage} title={selected.title} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <h2 className="text-base font-bold text-gray-900 leading-tight">{selected.title}</h2>
                      {selected.subtitle && <p className="text-xs text-gray-500 mt-0.5">{selected.subtitle}</p>}
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {selected.materialType && selected.materialType !== "BOOK" && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${MAT_CLS[selected.materialType] ?? "bg-gray-100 text-gray-600"}`}>
                            {tb((MAT_KEY[selected.materialType] ?? "materialOther") as Parameters<typeof tb>[0])}
                          </span>
                        )}
                        {selected.edition && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-semibold uppercase">
                            {selected.edition} {t("editionSuffix")}
                          </span>
                        )}
                        {selected.referenceOnly && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-bold uppercase">
                            {t("referenceOnlyBadge")}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => setSelected(null)}
                      className="flex-shrink-0 w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 hover:text-gray-800 transition-all duration-150 active:scale-90"
                    >
                      <X className="w-4.5 h-4.5" strokeWidth={2.5} />
                    </button>
                  </div>
                  <div className="space-y-1 text-xs">
                    {allAuthors(selected) && <div className="flex gap-2"><span className="text-gray-400 w-16 shrink-0">{t("author")}</span><span className="text-gray-700">{allAuthors(selected)}</span></div>}
                    {selected.isbn && <div className="flex gap-2"><span className="text-gray-400 w-16 shrink-0">{t("isbn")}</span><span className="text-gray-700 font-mono">{selected.isbn}</span></div>}
                    {selected.category && <div className="flex gap-2"><span className="text-gray-400 w-16 shrink-0">{t("category")}</span><span className="text-gray-700">{selected.category.name}</span></div>}
                    {selected.publishYear && <div className="flex gap-2"><span className="text-gray-400 w-16 shrink-0">{t("year")}</span><span className="text-gray-700">{selected.publishYear}</span></div>}
                    <div className="flex gap-2">
                      <span className="text-gray-400 w-16 shrink-0">{t("copies")}</span>
                      <span className={`font-semibold ${selected.availableCopies > 0 ? "text-green-600" : "text-red-500"}`}>
                        {selected.availableCopies}/{selected.totalCopies}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {selected.description && (
                <p className="px-5 pb-3 text-xs text-gray-500 leading-relaxed line-clamp-3">{selected.description}</p>
              )}

              {/* Rating */}
              <div className="px-5 pb-3 border-t border-gray-100 pt-3">
                <div className="flex items-center gap-2 mb-2">
                  <StarDisplay avg={ratingData?.avg ?? selected.avgRating ?? null} count={ratingData?.count ?? selected.ratingCount ?? 0} size="sm" />
                  {!ratingData && !selected.avgRating && <span className="text-xs text-gray-400">{trt("noRatings")}</span>}
                </div>
                {status === "authenticated" ? (
                  <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                    <p className="text-xs font-semibold text-gray-600">{trt("rateThisBook")}</p>
                    <StarInput value={ratingScore} onChange={setRatingScore} size="md" disabled={ratingLoading} />
                    {ratingScore > 0 && (
                      <textarea rows={2} value={ratingReview} onChange={(e) => setRatingReview(e.target.value)}
                        placeholder={trt("reviewPlaceholder")}
                        className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
                    )}
                    <div className="flex items-center gap-2">
                      <button onClick={handleRatingSubmit} disabled={!ratingScore || ratingLoading}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium ${theme.ratingBtn} text-white disabled:opacity-40 transition-colors`}>
                        {ratingLoading ? trt("loading") : ratingData?.myRating ? trt("updateRating") : trt("submitRating")}
                      </button>
                      {ratingData?.myRating && (
                        <button onClick={handleRatingDelete} disabled={ratingLoading}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40 transition-colors">
                          {trt("deleteRating")}
                        </button>
                      )}
                      {ratingToast && <span className="text-xs text-green-600 font-medium">{ratingToast}</span>}
                    </div>
                  </div>
                ) : (
                  <button onClick={() => router.push(`/${locale}/member/login`)} className="text-xs text-blue-600 hover:underline">
                    {trt("loginToRate")}
                  </button>
                )}
              </div>

              {/* Availability */}
              <div key={availability === null ? "loading" : "loaded"} className="px-5 pb-3 animate-fade-in">
                {selected.referenceOnly ? (
                  <div className="rounded-xl px-4 py-3 text-xs bg-amber-50 border border-amber-200 text-amber-800">
                    <p className="font-semibold">📖 {t("inLibraryUseOnly")}</p>
                    <p className="text-[11px] mt-0.5 opacity-80">{t("referenceOnlyDesc")}</p>
                  </div>
                ) : selected.totalCopies === 0 ? (
                  <div className="rounded-xl px-4 py-3 text-xs bg-gray-50 border border-gray-200 text-gray-500">
                    <p className="font-semibold">📭 {t("noCopiesMsg")}</p>
                  </div>
                ) : availability === null ? (
                  <div className="rounded-xl px-4 py-3 bg-gray-50 border border-gray-100 animate-pulse h-12" />
                ) : availability ? (
                  availability.totalCopies === 0 ? null : (
                  <div className={`rounded-xl px-4 py-3 text-xs border ${
                    availability.availableNow > 0 ? "bg-green-50 border-green-200 text-green-800"
                      : availability.queueFull ? "bg-red-50 border-red-200 text-red-700"
                      : "bg-amber-50 border-amber-200 text-amber-800"
                  }`}>
                    {availability.availableNow > 0
                      ? <p className="font-semibold">✓ {t("availableNowMsg", { count: availability.availableNow })}</p>
                      : availability.queueFull
                        ? <p className="font-semibold">✕ {t("queueFullMsg", { waiting: availability.inQueue + availability.onHoldShelf, max: availability.queueCapacity })}</p>
                        : <p className="font-semibold">{t("allCopiesOut", { pos: availability.nextPosition, ahead: availability.inQueue + availability.onHoldShelf })}</p>
                    }
                    <p className="text-[11px] mt-0.5 opacity-80">
                      {t("availabilityStats", { total: availability.totalCopies, borrowed: availability.borrowed ?? 0, onHoldShelf: availability.onHoldShelf, inQueue: availability.inQueue })}
                    </p>
                  </div>
                  )
                ) : null}
              </div>

              {/* Always render button area so modal height stays stable while availability loads */}
              {selected.totalCopies !== 0 && (
              <div className="px-5 pb-5">
                {availability === null ? (
                  <div className="w-full h-10 rounded-xl bg-gray-100 animate-pulse" />
                ) : (
                <button
                  onClick={() => { handleReserve(selected.id); setSelected(null); }}
                  disabled={basket.has(selected.id) || !!selected.referenceOnly || (availability.queueFull && availability.availableNow === 0)}
                  className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    basket.has(selected.id) ? "bg-green-100 text-green-700"
                      : selected.referenceOnly ? "bg-amber-100 text-amber-700 cursor-not-allowed"
                      : availability.queueFull && availability.availableNow === 0 ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                      : `${theme.btnPrimary} text-white`
                  }`}>
                  {basket.has(selected.id) ? <><CheckCircle className="w-4 h-4" /> {t("alreadyInBasketBtn")}</>
                    : selected.referenceOnly ? <>📖 {t("referenceOnlyBtn")}</>
                    : availability.queueFull && availability.availableNow === 0 ? <>{t("queueFullBtn")}</>
                    : <><ShoppingCart className="w-4 h-4" /> {t("reserve")}</>}
                </button>
                )}
              </div>
              )}
            </div>
          </div>
        )}

        {/* ── Book Request Modal ── */}
        {reqOpen && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={() => setReqOpen(false)}>
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold text-gray-900">{tr("requestBook")}</h2>
                <button onClick={() => setReqOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleBookRequest} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{tr("bookTitleRequired")}</label>
                  <input type="text" required value={reqForm.title}
                    onChange={(e) => setReqForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder={tr("bookTitlePlaceholder")}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{tr("author")}</label>
                  <input type="text" value={reqForm.author}
                    onChange={(e) => setReqForm((f) => ({ ...f, author: e.target.value }))}
                    placeholder={tr("authorPlaceholder")}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t("isbn")}</label>
                  <input type="text" value={reqForm.isbn}
                    onChange={(e) => setReqForm((f) => ({ ...f, isbn: e.target.value }))}
                    placeholder={tr("isbnPlaceholder")}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{tr("notes")}</label>
                  <textarea rows={3} value={reqForm.notes}
                    onChange={(e) => setReqForm((f) => ({ ...f, notes: e.target.value }))}
                    placeholder={tr("notesPlaceholder")}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                </div>
                <button type="submit" disabled={reqLoading}
                  className={`w-full flex items-center justify-center gap-2 ${theme.btnPrimary} text-white py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-60`}>
                  <Send className="w-4 h-4" />
                  {reqLoading ? tr("submitting") : tr("submitBtn")}
                </button>
              </form>
            </div>
          </div>
        )}

      {aiEnabled && <BookSearchChat locale={locale} />}

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
      whatsapp={footerWhatsapp}
      website={footerWebsite}
      description={footerDescription}
      fullWidth={fullWidth}
    />
    </>
  );
}
