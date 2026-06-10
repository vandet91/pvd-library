"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import PublicFooter from "@/components/shared/PublicFooter";
import FontLoader from "@/components/shared/FontLoader";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Search, BookOpen, FileText, BookMarked, Link2, Video, Music,
  Eye, ChevronLeft, ChevronRight, Flame, Lock, X, ShoppingBag, ArrowRight, Loader2,
} from "lucide-react";
import MemberHeader from "@/components/shared/MemberHeader";
import Pagination from "@/components/shared/Pagination";
import { StarDisplay, StarInput } from "@/components/shared/StarRating";
import { getOpacTheme } from "@/lib/opac-theme";
import { useLibraryName } from "@/context/library-name";
import { useLibraryLogo } from "@/context/library-logo";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import BookSearchChat from "@/components/BookSearchChat";
import { BookCover, type BookCoverStyle, type BookCoverFrame, coverFrameStyle } from "@/components/BookCover";

interface Ebook {
  id: string; title: string; titleKm?: string; description?: string;
  ebookType: string; coverImage?: string; views: number; language: string;
  isPublic: boolean; fileUrl: string | null;
  category?: { name: string } | null;
  author?:   { name: string } | null;
  avgRating?:   number | null;
  ratingCount?: number;
}

const TYPE_META: Record<string, { icon: React.ReactNode; labelKey: string; color: string; bg: string; gradFrom: string; gradTo: string }> = {
  PDF:   { icon: <FileText   className="w-4 h-4" />, labelKey: "pdf",   color: "text-red-600",     bg: "bg-red-50",     gradFrom: "from-red-600",    gradTo: "to-red-800" },
  EPUB:  { icon: <BookMarked className="w-4 h-4" />, labelKey: "epub",  color: "text-blue-600",    bg: "bg-blue-50",    gradFrom: "from-blue-600",   gradTo: "to-blue-800" },
  LINK:  { icon: <Link2      className="w-4 h-4" />, labelKey: "link",  color: "text-gray-600",    bg: "bg-gray-100",   gradFrom: "from-gray-500",   gradTo: "to-gray-700" },
  VIDEO: { icon: <Video      className="w-4 h-4" />, labelKey: "video", color: "text-violet-600",  bg: "bg-violet-50",  gradFrom: "from-violet-600", gradTo: "to-violet-900" },
  AUDIO: { icon: <Music      className="w-4 h-4" />, labelKey: "audio", color: "text-emerald-600", bg: "bg-emerald-50", gradFrom: "from-emerald-600",gradTo: "to-emerald-900" },
};

const ACTION_KEY: Record<string, string> = {
  PDF: "read", EPUB: "read", LINK: "open", VIDEO: "watch", AUDIO: "listen",
};

const TYPES = ["ALL", "PDF", "EPUB", "VIDEO", "AUDIO", "LINK"];

// ── EbookCoverAdapter — maps ebookType gradient → shared BookCover ───────────
function EbookCover({
  coverImage, title, ebookType, style, className = "",
}: {
  coverImage?: string | null;
  title: string;
  ebookType: string;
  style: BookCoverStyle;
  className?: string;
}) {
  const meta = TYPE_META[ebookType];
  // Strip Tailwind class prefix (e.g. "from-red-600" → "#dc2626")
  const gradMap: Record<string, string> = {
    "from-red-600": "#dc2626", "to-red-800": "#991b1b",
    "from-blue-600": "#2563eb", "to-blue-800": "#1e40af",
    "from-gray-500": "#6b7280", "to-gray-700": "#374151",
    "from-violet-600": "#7c3aed", "to-violet-900": "#4c1d95",
    "from-emerald-600": "#059669", "to-emerald-900": "#064e3b",
  };
  const gFrom = gradMap[meta?.gradFrom ?? ""] ?? "#4f46e5";
  const gTo   = gradMap[meta?.gradTo   ?? ""] ?? "#3730a3";

  return <BookCover coverImage={coverImage} title={title} style={style} gradFrom={gFrom} gradTo={gTo} className={className} />;
}

export default function EbooksClient({
  opacTheme,
  initialSaleEnabled,
  initialAiEnabled,
  paginationMode = "loadmore",
  paginationLimit = 20,
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
  coverStyle = "spine" as BookCoverStyle,
  coverFrame = "none" as BookCoverFrame,
}: {
  opacTheme: string;
  initialSaleEnabled: boolean;
  initialAiEnabled: boolean;
  paginationMode?: "loadmore" | "numbers";
  paginationLimit?: number;
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
  coverStyle?: BookCoverStyle;
  coverFrame?: BookCoverFrame;
}) {
  const cx = fullWidth ? "w-full px-4" : "max-w-6xl mx-auto px-4";
  const t   = useTranslations("ebooks");
  const tc  = useTranslations("common");
  const to  = useTranslations("opac");
  const trt = useTranslations("ratings");
  const locale = useLocale();
  const libraryName = useLibraryName();
  const libraryLogo = useLibraryLogo();
  const router = useRouter();
  const { data: session, status } = useSession();

  const [ebooks,      setEbooks]      = useState<Ebook[]>([]);
  const [featured,        setFeatured]        = useState<Ebook[]>([]);
  const [mostViewed,      setMostViewed]      = useState<Ebook[]>([]);
  const [sectionsLoading, setSectionsLoading] = useState(true);
  const [query,          setQuery]          = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [typeFilter,     setTypeFilter]     = useState("ALL");
  const [loading,        setLoading]        = useState(true);
  const [loadingMore,    setLoadingMore]    = useState(false);
  const [page,           setPage]           = useState(1);
  const [pages,          setPages]          = useState(1);
  const [hasMore,        setHasMore]        = useState(false);
  const [total,          setTotal]          = useState(0);
  const [aiEnabled,      setAiEnabled]      = useState(initialAiEnabled);
  const [saleEnabled,    setSaleEnabled]    = useState(initialSaleEnabled);
  // Initialise with the server-supplied theme key — no flash possible
  const [theme,          setTheme]          = useState(getOpacTheme(opacTheme));

  // ── Rating modal state ──
  const [ratingTarget,  setRatingTarget]  = useState<Ebook | null>(null);
  const [ratingData,    setRatingData]    = useState<{ avg: number | null; count: number; myRating: { id: string; score: number; review: string | null } | null } | null>(null);
  const [ratingScore,   setRatingScore]   = useState(0);
  const [ratingReview,  setRatingReview]  = useState("");
  const [ratingLoading, setRatingLoading] = useState(false);
  const [ratingToast,   setRatingToast]   = useState<string | null>(null);

  // Carousel
  const autoplay = useRef(Autoplay({ delay: 4500, stopOnInteraction: false }));
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true }, [autoplay.current]);

  // Keep in sync if settings changed since the page was SSR'd
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.ok ? r.json() : {})
      .then((d: Record<string, string>) => {
        if ("AI_SEARCH_MEMBER"  in d) setAiEnabled(d.AI_SEARCH_MEMBER !== "false");
        if ("BOOK_SALE_ENABLED" in d) setSaleEnabled(d.BOOK_SALE_ENABLED === "true");
        if ("OPAC_THEME"        in d) setTheme(getOpacTheme(d.OPAC_THEME));
      })
      .catch(() => {});
  }, []);

  // Load featured (newest) and most viewed once
  useEffect(() => {
    Promise.all([
      fetch("/api/ebooks?sort=newest&limit=6").then((r) => r.json()),
      fetch("/api/ebooks?sort=views&limit=10").then((r) => r.json()),
    ]).then(([newest, viewed]: [Ebook[], Ebook[]]) => {
      setFeatured(newest.slice(0, 6));
      setMostViewed(viewed.slice(0, 10));
      setSectionsLoading(false);
    }).catch(() => setSectionsLoading(false));
  }, []);

  // Debounce the text query — type filter changes stay instant
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), 350);
    return () => clearTimeout(id);
  }, [query]);

  // Reset on filter/mode change
  useEffect(() => { setPage(1); setEbooks([]); }, [debouncedQuery, typeFilter, paginationMode]);

  const fetchEbooks = useCallback(async (pageToLoad: number, append: boolean) => {
    if (append) setLoadingMore(true); else setLoading(true);
    const params = new URLSearchParams();
    if (debouncedQuery)       params.set("q", debouncedQuery);
    if (typeFilter !== "ALL") params.set("type", typeFilter);
    params.set("page",  String(pageToLoad));
    params.set("limit", String(paginationLimit));
    const data = await fetch(`/api/ebooks?${params}`).then((r) => r.json());
    const newItems: Ebook[] = Array.isArray(data) ? data : (data.ebooks ?? []);
    setEbooks((prev) => append ? [...prev, ...newItems] : newItems);
    setPages(data.pages ?? 1);
    setHasMore(pageToLoad < (data.pages ?? 1));
    setTotal(data.total ?? 0);
    if (append) setLoadingMore(false); else setLoading(false);
  }, [debouncedQuery, typeFilter, paginationLimit]);

  useEffect(() => { fetchEbooks(1, false); }, [fetchEbooks]);

  // Fetch ratings when rating modal opens; clear on close
  useEffect(() => {
    if (!ratingTarget) { setRatingData(null); setRatingScore(0); setRatingReview(""); return; }
    fetch(`/api/ratings?ebookId=${ratingTarget.id}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!d) return;
        setRatingData(d);
        if (d.myRating) { setRatingScore(d.myRating.score); setRatingReview(d.myRating.review ?? ""); }
      })
      .catch(() => {});
  }, [ratingTarget]);

  async function handleRatingSubmit() {
    if (!ratingTarget || !ratingScore) return;
    setRatingLoading(true);
    try {
      const res = await fetch("/api/ratings", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ ebookId: ratingTarget.id, score: ratingScore, review: ratingReview }),
      });
      if (res.ok) {
        const updated = await fetch(`/api/ratings?ebookId=${ratingTarget.id}`).then((r) => r.json());
        setRatingData(updated);
        const refresh = (list: Ebook[]) => list.map((e) =>
          e.id === ratingTarget.id
            ? { ...e, avgRating: updated.avg, ratingCount: updated.count }
            : e
        );
        setEbooks(refresh); setFeatured(refresh); setMostViewed(refresh);
        setRatingToast(ratingData?.myRating ? trt("ratingUpdated") : trt("ratingSubmitted"));
        setTimeout(() => setRatingToast(null), 3000);
      }
    } finally { setRatingLoading(false); }
  }

  async function handleRatingDelete() {
    if (!ratingData?.myRating || !ratingTarget) return;
    setRatingLoading(true);
    try {
      const res = await fetch(`/api/ratings/${ratingData.myRating.id}`, { method: "DELETE" });
      if (res.ok) {
        const updated = await fetch(`/api/ratings?ebookId=${ratingTarget.id}`).then((r) => r.json());
        setRatingData(updated); setRatingScore(0); setRatingReview("");
        const refresh = (list: Ebook[]) => list.map((e) =>
          e.id === ratingTarget.id
            ? { ...e, avgRating: updated.avg, ratingCount: updated.count }
            : e
        );
        setEbooks(refresh); setFeatured(refresh); setMostViewed(refresh);
        setRatingToast(trt("ratingDeleted"));
        setTimeout(() => setRatingToast(null), 3000);
      }
    } finally { setRatingLoading(false); }
  }

  const showHero = !query && typeFilter === "ALL";
  const displayFeatured = featured.length > 0 ? featured : (sectionsLoading ? [] : ebooks.slice(0, 6));
  const tLabel = (key: string) => t(key as Parameters<typeof t>[0]);

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

      {/* ── Sticky top nav ──────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-30 backdrop-blur border-b border-white/10" style={{ background: 'var(--m-nav-bg)' }}>
        <div className={`${cx} h-14 flex items-center justify-between gap-4`}>

          {/* Brand + page tabs */}
          <div className="flex items-center gap-1">
            <Link href={`/${locale}/discover`}
              className="flex items-center gap-2 pr-3 mr-2 border-r border-white/20">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden ${theme.navBrandBg}`}>
                {libraryLogo
                  ? <img src={libraryLogo} alt={libraryName} className="w-full h-full object-contain" /> // eslint-disable-line @next/next/no-img-element
                  : <BookMarked className={`w-4 h-4 ${theme.navBrandIcon}`} />}
              </div>
              <span className="text-sm font-bold text-white hidden sm:block leading-none">{libraryName}</span>
            </Link>

            <Link href={`/${locale}/discover`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white/60 hover:text-white hover:bg-white/10 transition-colors">
              <BookOpen className="w-3.5 h-3.5" />
              <span className="hidden sm:inline whitespace-nowrap">{to("discover")}</span>
            </Link>

            <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white ${theme.navActiveTab} cursor-default whitespace-nowrap`}>
              <BookMarked className={`w-3.5 h-3.5 ${theme.navBrandIcon}`} />
              {to("eLibrary")}
            </span>

            {saleEnabled && (
              <Link href={`/${locale}/shop`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white/60 hover:text-white hover:bg-white/10 transition-colors whitespace-nowrap">
                <ShoppingBag className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{to("shop")}</span>
              </Link>
            )}
          </div>

          {/* User actions */}
          <MemberHeader theme="dark" />
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <header className="text-white px-4 py-8 overflow-hidden relative" style={{ background: 'var(--m-hero-bg)' }}>

        {/* Subtle dot-grid background */}
        <div className="absolute inset-0 pointer-events-none select-none"
          style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.055) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
        {/* Glow blobs */}
        <div className={`absolute -top-10 right-1/3 w-80 h-80 ${theme.heroGlow1} rounded-full blur-3xl pointer-events-none`} />
        <div className={`absolute bottom-0 right-0 w-64 h-64 ${theme.heroGlow2} rounded-full blur-3xl pointer-events-none`} />

        <div className={`${fullWidth ? "w-full" : "max-w-6xl mx-auto"} relative`}>
          <div className="flex items-center gap-6">

            {/* ── Left: text + search ── */}
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold leading-tight mb-1">{t("title")}</h1>
              <p className="text-white/60 text-sm mb-5">{t("subtitle")}</p>

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
                  {/* Type select */}
                  <div className="border-l border-gray-200 flex-shrink-0">
                    <select
                      value={typeFilter}
                      onChange={(e) => setTypeFilter(e.target.value)}
                      className="h-full px-3 text-sm text-gray-600 bg-white focus:outline-none cursor-pointer w-[120px]"
                    >
                      {TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type === "ALL" ? t("allTypes") : tLabel(TYPE_META[type]?.labelKey ?? type)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Right: bookstore card (when sale on) or decorative SVG ── */}
            {saleEnabled ? (
              <Link
                href={`/${locale}/shop`}
                className="hidden lg:block flex-shrink-0 select-none group"
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
                    <span className="text-white/35 text-[11px]">{to("browseAndBuy")}</span>
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
                    <span className="text-xs font-medium" style={{ color: "#5c4535" }}>{to("booksForPurchase")}</span>
                    <span className="flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-bold text-gray-900 group-hover:gap-1.5 transition-all"
                      style={{ background: "#f5b731" }}>
                      {to("visitStore")} <ArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              </Link>
            ) : null}

          </div>
        </div>
      </header>

      {/* ── Featured carousel ────────────────────────────────────────────── */}
      {showHero && (sectionsLoading || displayFeatured.length > 0) && (
        <section className={`${cx} pt-10 pb-2 w-full`}>

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600
                flex items-center justify-center shadow-md shadow-blue-200 flex-shrink-0">
                <BookMarked className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-extrabold text-gray-900 leading-tight tracking-tight">
                  {t("featured")}
                </h2>
                <p className="text-sm text-gray-400 mt-0.5">{t("featuredSubtitle", { count: displayFeatured.length })}</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => document.getElementById("ebook-catalog")?.scrollIntoView({ behavior: "smooth" })}
                className="hidden sm:flex items-center gap-1.5 text-sm font-semibold text-gray-600
                  hover:text-gray-900 px-4 py-2 rounded-xl border border-gray-200
                  hover:border-gray-300 hover:bg-gray-50 transition-all duration-150">
                {t("viewAll")} <ChevronRight className="w-3.5 h-3.5" />
              </button>
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

          {/* Embla carousel — portrait cards */}
          {sectionsLoading ? (
            <div className="flex gap-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex-shrink-0 w-[calc(50%-10px)] sm:w-[calc(33.333%-14px)] md:w-[calc(25%-15px)] lg:w-[calc(20%-16px)] animate-pulse flex flex-col">
                  <div className="w-full aspect-[2/3] bg-gray-200 rounded-2xl flex-shrink-0" />
                  <div className="mt-3 h-[56px]">
                    <div className="h-3.5 bg-gray-200 rounded-full w-4/5 mb-1.5" />
                    <div className="h-3 bg-gray-100 rounded-full w-3/5" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
          <div
            ref={emblaRef}
            className="overflow-hidden py-3 -my-3"
          >
            <div className="flex -ml-5">
              {displayFeatured.map((ebook) => {
                const meta = TYPE_META[ebook.ebookType];
                return (
                  <Link key={ebook.id} href={`/${locale}/ebooks/${ebook.id}`}
                    className={`flex-[0_0_50%] sm:flex-[0_0_33.333%] md:flex-[0_0_25%] lg:flex-[0_0_20%] ${fullWidth ? "lg:flex-[0_0_16.666%] xl:flex-[0_0_14.285%] 2xl:flex-[0_0_11.111%]" : ""} min-w-0 pl-5 flex flex-col group`}>
                    <div className="w-full aspect-[2/3] rounded-2xl overflow-hidden
                      group-hover:-translate-y-2
                      transition-all duration-300 bg-gray-100 flex-shrink-0 relative"
                      style={coverFrame !== "none" ? coverFrameStyle(coverFrame) : undefined}>
                      <EbookCover coverImage={ebook.coverImage} title={ebook.title} ebookType={ebook.ebookType} style={coverStyle} />
                      {/* NEW badge */}
                      <div className="absolute top-2.5 left-2.5 bg-blue-500 text-white
                        text-[10px] font-extrabold px-2 py-0.5 rounded-md tracking-wide uppercase shadow-sm">
                        {to("newBadge")}
                      </div>
                      {/* Type badge */}
                      {meta && (
                        <span className={`absolute top-2.5 right-2.5 inline-flex items-center justify-center ${meta.bg} ${meta.color} p-1 rounded-full shadow-sm [&_svg]:w-3 [&_svg]:h-3`}>
                          {meta.icon}
                        </span>
                      )}
                      {/* Lock */}
                      {!ebook.isPublic && (
                        <div className="absolute bottom-2.5 right-2.5">
                          <span className="inline-flex items-center bg-amber-500 text-white p-0.5 rounded-full shadow">
                            <Lock className="w-2.5 h-2.5" />
                          </span>
                        </div>
                      )}
                      {/* Views */}
                      <div className="absolute bottom-2.5 left-2.5 flex items-center gap-0.5
                        bg-black/60 backdrop-blur-sm text-white px-2 py-1 rounded-lg">
                        <Eye className="w-3 h-3 text-white/70" />
                        <span className="text-xs font-bold">{ebook.views}</span>
                      </div>
                    </div>
                    <div className="mt-3 h-[56px] overflow-hidden">
                      <p className="text-sm font-bold text-gray-900 line-clamp-2 leading-snug">
                        {locale === "km" && ebook.titleKm ? ebook.titleKm : ebook.title}
                      </p>
                      <p className="text-xs text-gray-400 truncate mt-0.5">{ebook.author?.name || " "}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
          )}
        </section>
      )}

      {/* ── Most viewed ───────────────────────────────────────────────────── */}
      {showHero && (sectionsLoading || mostViewed.length > 0) && (
        <section className={`${cx} pt-8 pb-2 w-full`}>

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-orange-400 to-red-500
                flex items-center justify-center shadow-md shadow-orange-200 flex-shrink-0">
                <Flame className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-extrabold text-gray-900 leading-tight tracking-tight">
                  {t("mostViewed")}
                </h2>
                <p className="text-sm text-gray-400 mt-0.5">{t("mostViewedSubtitle")}</p>
              </div>
            </div>
          </div>

          {sectionsLoading ? (
            <div className="flex gap-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex-shrink-0 w-[calc(50%-10px)] sm:w-[calc(33.333%-14px)] md:w-[calc(25%-15px)] lg:w-[calc(20%-16px)] animate-pulse flex flex-col">
                  <div className="w-full aspect-[2/3] bg-gray-200 rounded-2xl flex-shrink-0" />
                  <div className="mt-3 h-[56px]">
                    <div className="h-3.5 bg-gray-200 rounded-full w-4/5 mb-1.5" />
                    <div className="h-3 bg-gray-100 rounded-full w-3/5" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
          <div className="flex gap-5 overflow-x-auto pt-3 -mt-3 pb-4 scrollbar-hide">
            {mostViewed.map((ebook, idx) => {
              const meta = TYPE_META[ebook.ebookType];
              return (
                <Link key={ebook.id} href={`/${locale}/ebooks/${ebook.id}`}
                  className={`flex-shrink-0 w-[calc(50%-10px)] sm:w-[calc(33.333%-14px)] md:w-[calc(25%-15px)] lg:w-[calc(20%-16px)] ${fullWidth ? "lg:w-[calc(16.666%-17px)] xl:w-[calc(14.285%-17px)] 2xl:w-[calc(11.111%-18px)]" : ""} group flex flex-col`}>
                  <div className="w-full aspect-[2/3] rounded-2xl overflow-hidden relative
                    group-hover:-translate-y-2
                    transition-all duration-300 bg-gray-100 flex-shrink-0"
                    style={coverFrame !== "none" ? coverFrameStyle(coverFrame) : undefined}>
                    <EbookCover coverImage={ebook.coverImage} title={ebook.title} ebookType={ebook.ebookType} style={coverStyle} />
                    {/* Rank badge */}
                    <div className={`absolute top-2.5 left-2.5 w-7 h-7 rounded-lg flex items-center justify-center
                      text-xs font-extrabold shadow-md border border-white/30
                      ${idx === 0 ? "bg-yellow-400 text-gray-900"
                        : idx === 1 ? "bg-gray-300 text-gray-700"
                        : idx === 2 ? "bg-amber-600 text-white"
                        : "bg-black/60 backdrop-blur-sm text-white"}`}>
                      {idx + 1}
                    </div>
                    {/* Type badge */}
                    {meta && (
                      <span className={`absolute top-2.5 right-2.5 inline-flex items-center justify-center ${meta.bg} ${meta.color} p-1 rounded-full shadow-sm [&_svg]:w-3 [&_svg]:h-3`}>
                        {meta.icon}
                      </span>
                    )}
                    {/* Views */}
                    <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1
                      bg-black/60 backdrop-blur-sm text-white px-2 py-1 rounded-lg">
                      <Eye className="w-3 h-3 text-white/70" />
                      <span className="text-xs font-bold">{ebook.views}</span>
                    </div>
                    {!ebook.isPublic && (
                      <div className="absolute bottom-2.5 right-2.5">
                        <span className="inline-flex items-center bg-amber-500 text-white p-0.5 rounded-full shadow">
                          <Lock className="w-2.5 h-2.5" />
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="mt-3 h-[56px] overflow-hidden">
                    <p className="text-sm font-bold text-gray-900 line-clamp-2 leading-snug">
                      {locale === "km" && ebook.titleKm ? ebook.titleKm : ebook.title}
                    </p>
                    <p className="text-xs text-gray-400 truncate mt-0.5">{ebook.author?.name || " "}</p>
                  </div>
                </Link>
              );
            })}
          </div>
          )}
        </section>
      )}

      {/* ── Bookstore Banner (hidden on lg — shown in hero right panel there) ── */}
      {showHero && saleEnabled && (
        <section className={`${cx} pt-4 pb-2 w-full lg:hidden`}>
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
                <span className="text-white/35 text-xs">{to("browseAndBuy")}</span>
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
                <div className="h-3.5 w-full rounded-sm" style={{ background: "#9b6b3e", boxShadow: "0 2px 8px rgba(0,0,0,0.28)" }} />
              </div>
              {/* Cream CTA footer */}
              <div className="flex items-center justify-between px-5 py-3" style={{ background: "#f5ead5" }}>
                <span className="text-sm font-medium" style={{ color: "#5c4535" }}>{to("booksAvailableForPurchase")}</span>
                <span className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold text-gray-900 group-hover:gap-2 transition-all"
                  style={{ background: "#f5b731" }}>
                  {to("visitStore")} <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          </Link>
        </section>
      )}

      {/* ── Main catalog ──────────────────────────────────────────────────── */}
      <main id="ebook-catalog" className={`${cx} py-6 min-h-[60vh]`}>

        {/* Type filter pills */}
        <div className="flex items-center gap-2 flex-wrap mb-4">
          {TYPES.map((type) => (
            <button
              key={type}
              onClick={() => setTypeFilter(type)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all duration-150
                ${typeFilter === type
                  ? `${theme.filterActive} text-white border-transparent shadow-sm`
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50"}`}
            >
              {type !== "ALL" && TYPE_META[type] && (
                <span className="[&_svg]:w-3 [&_svg]:h-3">{TYPE_META[type].icon}</span>
              )}
              {type === "ALL" ? t("allTypes") : tLabel(TYPE_META[type]?.labelKey ?? type)}
            </button>
          ))}
        </div>

        {/* Result count */}
        <div className="flex items-center justify-between mb-5">
          <p className="text-sm text-gray-500">
            {total || ebooks.length} {tc("total").toLowerCase()}
          </p>
        </div>

        {/* Grid */}
        {loading ? (
          /* Skeleton — portrait cards */
          <div className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 ${fullWidth ? "xl:grid-cols-6 2xl:grid-cols-8" : ""}`}>
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-[2/3] rounded-xl bg-gray-200 mb-2" />
                <div className="h-3 bg-gray-200 rounded w-3/4 mb-1" />
                <div className="h-3 bg-gray-100 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : ebooks.length === 0 ? (
          <div className="text-center py-20">
            <BookMarked className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">{t("noEbooks")}</p>
          </div>
        ) : (
          <div className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 ${fullWidth ? "xl:grid-cols-6 2xl:grid-cols-8" : ""}`}>
            {ebooks.map((ebook) => {
              const meta = TYPE_META[ebook.ebookType];
              const actionKey = ACTION_KEY[ebook.ebookType] ?? "read";

              return (
                <Link
                  key={ebook.id}
                  href={
                    !ebook.isPublic && !ebook.fileUrl
                      ? `/${locale}/member/login`
                      : `/${locale}/ebooks/${ebook.id}`
                  }
                  className="group flex flex-col"
                >
                  {/* Portrait cover */}
                  <div className="aspect-[2/3] rounded-xl overflow-hidden relative bg-gray-100 transition-all duration-200"
                    style={coverFrame !== "none" ? coverFrameStyle(coverFrame) : undefined}>
                    <EbookCover coverImage={ebook.coverImage} title={ebook.title} ebookType={ebook.ebookType} style={coverStyle} />

                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-200 flex items-center justify-center">
                      <span className={`opacity-0 group-hover:opacity-100 transition-opacity duration-200 inline-flex items-center gap-1 text-xs font-semibold text-white bg-white/20 backdrop-blur-sm border border-white/30 px-3 py-1.5 rounded-full shadow ${
                        !ebook.isPublic ? "bg-amber-500/80 border-amber-300/50" : ""
                      }`}>
                        {!ebook.isPublic
                          ? <><Lock className="w-3 h-3" /> {t("loginToAccess")}</>
                          : <>{meta && <span className="[&_svg]:w-3 [&_svg]:h-3">{meta.icon}</span>}{tLabel(actionKey)}</>
                        }
                      </span>
                    </div>

                    {/* Type badge — icon only */}
                    {meta && (
                      <span className={`absolute top-1.5 left-1.5 inline-flex items-center justify-center ${meta.bg} ${meta.color} p-1 rounded-full shadow-sm [&_svg]:w-3 [&_svg]:h-3`}>
                        {meta.icon}
                      </span>
                    )}

                    {/* Lock + views — top-right */}
                    <div className="absolute top-1.5 right-1.5 flex flex-col items-end gap-1">
                      {!ebook.isPublic && (
                        <span className="inline-flex items-center bg-amber-500 text-white p-0.5 rounded-full shadow">
                          <Lock className="w-2.5 h-2.5" />
                        </span>
                      )}
                      <span className="inline-flex items-center gap-0.5 text-[10px] bg-black/35 text-white px-1.5 py-0.5 rounded-full">
                        <Eye className="w-2.5 h-2.5" />{ebook.views}
                      </span>
                    </div>
                  </div>

                  {/* Text below cover */}
                  <div className="mt-2 flex-1 flex flex-col min-w-0">
                    <p className="text-xs font-semibold text-gray-900 line-clamp-2 leading-snug group-hover:text-gray-600 transition-colors">
                      {locale === "km" && ebook.titleKm ? ebook.titleKm : ebook.title}
                    </p>
                    {ebook.author && (
                      <p className="text-[11px] text-gray-400 mt-0.5 truncate">{ebook.author.name}</p>
                    )}
                    {/* Avg rating */}
                    {((ebook.avgRating) || (ebook.ratingCount ?? 0) > 0) && (
                      <div className="mt-0.5">
                        <StarDisplay avg={ebook.avgRating ?? null} count={ebook.ratingCount ?? 0} size="xs" />
                      </div>
                    )}
                    {ebook.category && (
                      <span className="mt-1 self-start text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full truncate max-w-full">
                        {ebook.category.name}
                      </span>
                    )}
                    {/* Rate button */}
                    <button
                      onClick={(e) => { e.preventDefault(); setRatingTarget(ebook); }}
                      className="mt-1.5 self-start text-[10px] text-amber-500 hover:text-amber-600 font-medium flex items-center gap-0.5 transition-colors"
                    >
                      ★ {trt("rateThisEbook")}
                    </button>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {paginationMode === "numbers" ? (
          pages > 1 && (
            <div className="mt-8">
              <Pagination page={page} pages={pages} total={total} limit={paginationLimit}
                onPage={(p) => { setPage(p); fetchEbooks(p, false); }} />
            </div>
          )
        ) : (
          hasMore && (
            <div className="mt-8 flex justify-center">
              <button
                onClick={() => { const next = page + 1; setPage(next); fetchEbooks(next, true); }}
                disabled={loadingMore}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all disabled:opacity-50">
                {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {loadingMore ? to("loadingMore") : to("loadMore")}
              </button>
            </div>
          )
        )}
      </main>

      {aiEnabled && <BookSearchChat locale={locale} mode="ebook" />}

      {/* ── Rating modal ─────────────────────────────────────────────────── */}
      {ratingTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50"
          onClick={() => setRatingTarget(null)}>
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-start justify-between p-5 pb-3">
              <div>
                <h3 className="text-sm font-bold text-gray-900 leading-snug line-clamp-2">
                  {locale === "km" && ratingTarget.titleKm ? ratingTarget.titleKm : ratingTarget.title}
                </h3>
                {ratingTarget.author && (
                  <p className="text-xs text-gray-400 mt-0.5">{ratingTarget.author.name}</p>
                )}
                {/* Aggregate */}
                <div className="mt-2">
                  <StarDisplay
                    avg={ratingData?.avg ?? ratingTarget.avgRating ?? null}
                    count={ratingData?.count ?? ratingTarget.ratingCount ?? 0}
                    size="sm"
                  />
                  {!ratingData?.avg && !(ratingTarget.avgRating) && (
                    <span className="text-xs text-gray-400 ml-1">{trt("noRatings")}</span>
                  )}
                </div>
              </div>
              <button onClick={() => setRatingTarget(null)} className="text-gray-400 hover:text-gray-600 ml-2 flex-shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Rate widget */}
            <div className="px-5 pb-5">
              {status === "authenticated" ? (
                <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                  <p className="text-xs font-semibold text-gray-600">{trt("rateThisEbook")}</p>
                  <StarInput value={ratingScore} onChange={setRatingScore} size="md" disabled={ratingLoading} />
                  {ratingScore > 0 && (
                    <textarea
                      rows={2}
                      value={ratingReview}
                      onChange={(e) => setRatingReview(e.target.value)}
                      placeholder={trt("reviewPlaceholder")}
                      className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                    />
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={handleRatingSubmit}
                      disabled={!ratingScore || ratingLoading}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium ${theme.ratingBtn} text-white disabled:opacity-40 transition-colors`}
                    >
                      {ratingLoading ? trt("loading") : ratingData?.myRating ? trt("updateRating") : trt("submitRating")}
                    </button>
                    {ratingData?.myRating && (
                      <button
                        onClick={handleRatingDelete}
                        disabled={ratingLoading}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40 transition-colors"
                      >
                        {trt("deleteRating")}
                      </button>
                    )}
                    {ratingToast && <span className="text-xs text-green-600 font-medium">{ratingToast}</span>}
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => router.push(`/${locale}/member/login`)}
                  className="text-sm text-blue-600 hover:underline"
                >
                  {trt("loginToRate")}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
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
