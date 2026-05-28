"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Search, BookOpen, BookMarked, ChevronLeft, ChevronRight,
  ShoppingCart, CheckCircle, X, Star, PlusCircle, Send, Loader2,
  Flame, ShoppingBag, Tag,
} from "lucide-react";
import MemberHeader from "@/components/shared/MemberHeader";
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

interface ForSaleBook {
  copyId: string;
  id:     string;          // book ID — used for deduplication
  title: string; price: number | null;
  coverImage: string | null; condition: string;
  author: { name: string } | null;
}


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
    return <img src={coverImage} alt={title} className={`w-full h-full object-contain ${className}`} />;
  }
  const initials = title.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
  return (
    <div className={`w-full h-full bg-gradient-to-br ${coverGradient(title)} flex flex-col items-center justify-center gap-1 ${className}`}>
      <BookOpen className="w-8 h-8 text-white/40" />
      <span className="text-white/80 text-xs font-bold px-2 text-center leading-tight">{initials}</span>
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

export default function DiscoverClient({ opacTheme }: { opacTheme: string }) {
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
  const [categories,        setCategories]         = useState<Category[]>([]);
  const [query,             setQuery]              = useState("");
  const [categoryId,        setCategoryId]         = useState("");
  const [materialType,      setMaterialType]       = useState("");
  const [availableOnly,     setAvailableOnly]      = useState(false);
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
  const [aiEnabled,         setAiEnabled]          = useState(false);
  const [theme,             setTheme]              = useState(getOpacTheme(opacTheme));
  const [saleEnabled,       setSaleEnabled]        = useState(false);
  const [forSaleBooks,      setForSaleBooks]       = useState<ForSaleBook[]>([]);
  const [saleCurrency,      setSaleCurrency]       = useState("USD");

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
    fetch("/api/categories").then((r) => r.json()).then(setCategories);
    fetch("/api/books?limit=8&sort=newest").then((r) => r.json()).then((d: Book[]) => setNewArrivals(d.slice(0, 8)));
    fetch("/api/books?sort=popular&limit=8").then((r) => r.json()).then((d: Book[]) => setMostBorrowed(d.slice(0, 8)));
    fetch("/api/settings").then((r) => r.ok ? r.json() : {})
      .then((s: Record<string, string>) => {
        setAiEnabled(s.AI_SEARCH_MEMBER !== "false");
        setTheme(getOpacTheme(s.OPAC_THEME));
        if (s.BOOK_SALE_ENABLED === "true") {
          setSaleEnabled(true);
          setSaleCurrency(s.STOCK_CURRENCY ?? "USD");
          fetch("/api/shop/books")
            .then((r) => r.ok ? r.json() : [])
            .then((data: ForSaleBook[]) => {
              if (!Array.isArray(data)) { setForSaleBooks([]); return; }
              // One card per unique book — keep the copy with the lowest price
              const seen = new Map<string, ForSaleBook>();
              for (const copy of data) {
                const existing = seen.get(copy.id);
                if (
                  !existing ||
                  (copy.price != null && (existing.price == null || copy.price < existing.price))
                ) {
                  seen.set(copy.id, copy);
                }
              }
              setForSaleBooks(Array.from(seen.values()).slice(0, 8));
            })
            .catch(() => {});
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

  const fetchBooks = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (query)         params.set("q", query);
    if (categoryId)    params.set("categoryId", categoryId);
    if (materialType)  params.set("materialType", materialType);
    if (availableOnly) params.set("available", "true");
    const data = await fetch(`/api/books?${params}`).then((r) => r.json());
    setBooks(data);
    setLoading(false);
  }, [query, categoryId, materialType, availableOnly]);

  useEffect(() => { fetchBooks(); }, [fetchBooks]);

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
  const heroBooks    = newArrivals.length > 0 ? newArrivals : books.slice(0, 8);
  const showSections = !query && !categoryId && !materialType && !availableOnly;
  const isStaff      = (session?.user as { role?: string })?.role && (session?.user as { role?: string })?.role !== "MEMBER";

  /* ── Render ── */
  return (
    <div className="min-h-screen bg-gray-50">

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-[60] flex items-center gap-3 bg-gray-900 text-white px-4 py-3 rounded-xl shadow-2xl text-sm">
          <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
          {toast}
          <button onClick={() => setToast(null)}><X className="w-4 h-4 text-white/60 hover:text-white" /></button>
        </div>
      )}

      {/* Top Nav */}
      <nav className={`sticky top-0 z-30 ${theme.navBg} backdrop-blur border-b border-white/10`}>
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
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
        <header className={`${theme.heroBg} text-white px-4 py-8 overflow-hidden relative`}>
          <div className="absolute inset-0 pointer-events-none"
            style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.055) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
          <div className={`absolute -top-10 right-1/3 w-80 h-80 ${theme.heroGlow1} rounded-full blur-3xl pointer-events-none`} />
          <div className={`absolute bottom-0 right-0 w-64 h-64 ${theme.heroGlow2} rounded-full blur-3xl pointer-events-none`} />

          <div className="max-w-6xl mx-auto relative">
            <div className="flex items-center gap-6">
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl md:text-3xl font-bold leading-tight mb-1">Discover Your Next Great Read</h1>
                <p className="text-white/60 text-sm mb-5">Search, explore and borrow from our vast collection.</p>

                {/* Search bar with integrated category filter */}
                <div className="flex gap-2 max-w-2xl">
                  <div className="flex-1 flex bg-white rounded-xl overflow-hidden shadow-lg ring-1 ring-white/20">
                    <div className="relative flex-1 flex items-center">
                      <Search className="absolute left-4 w-4 h-4 text-gray-400 pointer-events-none" />
                      <input
                        id="search-input"
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && fetchBooks()}
                        placeholder={t("searchPlaceholder")}
                        className="w-full pl-11 pr-4 py-3 text-gray-900 text-sm focus:outline-none bg-transparent"
                      />
                    </div>
                    <select
                      value={categoryId}
                      onChange={(e) => setCategoryId(e.target.value)}
                      className="border-l border-gray-100 px-3 py-2.5 text-sm text-gray-600 bg-white focus:outline-none cursor-pointer min-w-[120px] max-w-[150px]"
                    >
                      <option value="">{t("allCategories")}</option>
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <button
                    onClick={fetchBooks}
                    className={`px-5 py-3 ${theme.btnPrimary} text-white rounded-xl font-semibold text-sm flex-shrink-0 flex items-center gap-2 hover:opacity-90 transition-opacity shadow-lg`}
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{tc("search")}</span>
                  </button>
                </div>

              </div>

              {/* SVG illustration */}
              <div className="hidden xl:block flex-shrink-0 select-none pointer-events-none" aria-hidden>
                <svg width="300" height="140" viewBox="0 0 420 180" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="210" cy="130" r="100" fill="white" fillOpacity="0.02"/>
                  <rect x="16" y="158" width="130" height="5" rx="2" fill="white" fillOpacity="0.22"/>
                  <rect x="20"  y="120" width="13" height="38" rx="2" fill="#ef4444" fillOpacity="0.75"/>
                  <rect x="35"  y="126" width="11" height="32" rx="2" fill="#3b82f6" fillOpacity="0.75"/>
                  <rect x="48"  y="122" width="13" height="36" rx="2" fill="#10b981" fillOpacity="0.75"/>
                  <rect x="63"  y="129" width="10" height="29" rx="2" fill="#f59e0b" fillOpacity="0.75"/>
                  <rect x="75"  y="121" width="14" height="37" rx="2" fill="#8b5cf6" fillOpacity="0.75"/>
                  <rect x="91"  y="130" width="10" height="28" rx="2" fill="#ec4899" fillOpacity="0.75"/>
                  <rect x="103" y="124" width="12" height="34" rx="2" fill="#14b8a6" fillOpacity="0.75"/>
                  <rect x="117" y="127" width="12" height="31" rx="2" fill="#f97316" fillOpacity="0.75"/>
                  <rect x="160" y="168" width="62" height="11" rx="3" fill="#6366f1" fillOpacity="0.85"/>
                  <rect x="165" y="155" width="54" height="11" rx="3" fill="#3b82f6" fillOpacity="0.85"/>
                  <rect x="170" y="143" width="46" height="10" rx="3" fill="#8b5cf6" fillOpacity="0.85"/>
                  <circle cx="252" cy="94" r="50" stroke="white" strokeOpacity="0.28" strokeWidth="5" fill="white" fillOpacity="0.05"/>
                  <line x1="289" y1="131" x2="318" y2="160" stroke="white" strokeOpacity="0.35" strokeWidth="8" strokeLinecap="round"/>
                  <path d="M 230,104 C 228,68 240,53 249,47 L 254,47 L 254,104 Z" fill="white" fillOpacity="0.18" stroke="white" strokeOpacity="0.28" strokeWidth="1"/>
                  <path d="M 274,104 C 276,68 264,53 255,47 L 254,47 L 254,104 Z" fill="white" fillOpacity="0.12" stroke="white" strokeOpacity="0.28" strokeWidth="1"/>
                  <line x1="254" y1="47" x2="254" y2="104" stroke="white" strokeOpacity="0.4" strokeWidth="1.5" strokeLinecap="round"/>
                  <g>
                    <path d="M 340,16 L 350,16 L 350,44 L 345,38 L 340,44 Z" fill="#f59e0b" fillOpacity="0.8" stroke="#fcd34d" strokeOpacity="0.5" strokeWidth="1"/>
                    <animateTransform attributeName="transform" type="translate" values="0,0;0,-5;0,0" dur="2.6s" repeatCount="indefinite" calcMode="ease-in-out"/>
                  </g>
                  <path d="M 36,20 L 38.5,12 L 41,20 L 49,22 L 41,24 L 38.5,32 L 36,24 L 28,22 Z" fill="#fcd34d" fillOpacity="0.7">
                    <animate attributeName="opacity" values="0.7;1;0.7" dur="2.2s" repeatCount="indefinite"/>
                  </path>
                </svg>
              </div>
            </div>
          </div>
        </header>

        {/* ── New Arrivals carousel ── */}
        {showSections && heroBooks.length > 0 && (
          <section id="new-arrivals" className="max-w-6xl mx-auto px-4 pt-8 pb-2 w-full">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                {t("newArrivals")}
              </h2>
              <div className="flex items-center gap-2">
                <button onClick={() => document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth" })}
                  className="text-xs text-blue-600 hover:underline">View all →</button>
                <button onClick={() => emblaApi?.scrollPrev()}
                  className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors">
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => emblaApi?.scrollNext()}
                  className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors">
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="overflow-hidden" ref={emblaRef}>
              <div className="flex gap-3">
                {heroBooks.map((book) => (
                  <div key={book.id} className="flex-[0_0_130px] min-w-0">
                    <button className="w-full text-left group" onClick={() => setSelected(book)}>
                      <div className="aspect-[2/3] rounded-xl overflow-hidden shadow-sm group-hover:shadow-md transition-shadow bg-gray-100 mb-2 relative">
                        <BookCover coverImage={book.coverImage} title={book.title} />
                        {(book.avgRating || (book.ratingCount ?? 0) > 0) && (
                          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 pt-4 pb-1.5 flex items-center gap-1">
                            <span className="text-amber-400 text-[11px] leading-none">★</span>
                            <span className="text-white text-[11px] font-semibold leading-none">{book.avgRating?.toFixed(1)}</span>
                            {(book.ratingCount ?? 0) > 0 && <span className="text-white/60 text-[10px] leading-none">({book.ratingCount})</span>}
                          </div>
                        )}
                        <div className={`absolute top-2 right-2 w-2.5 h-2.5 rounded-full ${book.availableCopies > 0 ? "bg-green-400" : "bg-red-400"} shadow`} />
                      </div>
                      <p className="text-xs font-semibold text-gray-900 line-clamp-2 leading-snug">{book.title}</p>
                      {allAuthors(book) && <p className="text-[11px] text-gray-400 mt-0.5 truncate">{allAuthors(book)}</p>}
                      <span className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${book.availableCopies > 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-500"}`}>
                        {book.availableCopies > 0 ? t("available") : t("borrowed")}
                      </span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── Most Borrowed ── */}
        {showSections && mostBorrowed.length > 0 && (
          <section id="most-borrowed" className="max-w-6xl mx-auto px-4 pt-6 pb-2 w-full">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Flame className="w-4 h-4 text-orange-500" />
                {t("mostBorrowed")}
              </h2>
              <button onClick={() => document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth" })}
                className="text-xs text-blue-600 hover:underline">View all →</button>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
              {mostBorrowed.map((book) => (
                <button key={book.id} onClick={() => setSelected(book)} className="flex-shrink-0 w-28 text-left group">
                  <div className="aspect-[2/3] rounded-xl overflow-hidden shadow-sm group-hover:shadow-md transition-shadow bg-gray-100 mb-2 relative">
                    <BookCover coverImage={book.coverImage} title={book.title} />
                    {/* Borrow count badge */}
                    {(book._count?.loans ?? 0) > 0 && (
                      <div className="absolute top-1.5 left-1.5 bg-blue-600/85 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 backdrop-blur-sm">
                        <Flame className="w-2.5 h-2.5" />
                        {(book._count!.loans) > 999
                          ? `${((book._count!.loans) / 1000).toFixed(1)}k`
                          : book._count!.loans}
                      </div>
                    )}
                    {(book.avgRating || (book.ratingCount ?? 0) > 0) && (
                      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 pt-4 pb-1.5 flex items-center gap-1">
                        <span className="text-amber-400 text-[11px] leading-none">★</span>
                        <span className="text-white text-[11px] font-semibold leading-none">{book.avgRating?.toFixed(1)}</span>
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] font-semibold text-gray-800 line-clamp-2 leading-snug">{book.title}</p>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ── Books for Sale ── */}
        {showSections && saleEnabled && forSaleBooks.length > 0 && (
          <section className="max-w-6xl mx-auto px-4 pt-6 pb-2 w-full">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-violet-600" />
                Books for Sale
                <span className="text-xs font-normal text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">
                  {forSaleBooks.length} available
                </span>
              </h2>
              <Link
                href={`/${locale}/shop`}
                className="text-xs text-violet-600 hover:text-violet-800 font-medium hover:underline flex items-center gap-1"
              >
                Browse Shop →
              </Link>
            </div>

            {/* Cards row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-3">
              {forSaleBooks.slice(0, 4).map((book) => (
                <Link
                  key={book.copyId}
                  href={`/${locale}/shop`}
                  className="group bg-white rounded-xl border border-violet-100 shadow-sm hover:shadow-md hover:border-violet-200 transition-all overflow-hidden"
                >
                  {/* Cover — same aspect ratio as New Arrivals / Most Borrowed */}
                  <div className="relative aspect-[2/3] bg-gradient-to-br from-violet-100 to-purple-100 flex items-center justify-center overflow-hidden">
                    {book.coverImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={book.coverImage} alt={book.title} className="w-full h-full object-contain" />
                    ) : (
                      <BookOpen className="w-10 h-10 text-violet-300" />
                    )}
                    {/* Price badge — only when price is set */}
                    {book.price != null && (
                      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent px-2 pb-2 pt-4">
                        <span className="text-white text-xs font-bold">
                          {saleCurrency === "USD" ? "$" : `${saleCurrency} `}{book.price.toFixed(2)}
                        </span>
                      </div>
                    )}
                    {/* Condition badge */}
                    <span className="absolute top-1.5 right-1.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-white/90 text-violet-700">
                      {book.condition}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="p-2.5">
                    <p className="text-xs font-semibold text-gray-900 line-clamp-2 leading-snug group-hover:text-violet-800 transition-colors">
                      {book.title}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5 truncate">
                      {book.author?.name ?? "Unknown"}
                    </p>
                  </div>
                </Link>
              ))}
            </div>

            {/* CTA banner when more than 4 */}
            {forSaleBooks.length > 4 && (
              <Link
                href={`/${locale}/shop`}
                className="mt-3 flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-violet-200 text-violet-600 hover:border-violet-400 hover:bg-violet-50 transition-colors text-sm font-medium"
              >
                <Tag className="w-4 h-4" />
                +{forSaleBooks.length - 4} more books for sale — Browse all
              </Link>
            )}
          </section>
        )}

        {/* ── Catalog ── */}
        <main id="catalog" className="max-w-6xl mx-auto px-4 py-6 min-h-[60vh] w-full">
          <div className="flex flex-wrap items-center gap-3 mb-6 pb-4 border-b border-gray-200">
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">{t("allCategories")}</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={materialType} onChange={(e) => setMaterialType(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">{t("allTypes")}</option>
              {MATERIAL_TYPE_KEYS.map((mt) => (
                <option key={mt} value={mt}>{tb(MAT_KEY[mt] as Parameters<typeof tb>[0])}</option>
              ))}
            </select>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={availableOnly} onChange={(e) => setAvailableOnly(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              <span className="text-sm text-gray-700">{t("availableOnly")}</span>
            </label>
            {(query || categoryId || materialType || availableOnly) && (
              <button onClick={() => { setQuery(""); setCategoryId(""); setMaterialType(""); setAvailableOnly(false); }}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2.5 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
                <X className="w-3 h-3" /> Clear filters
              </button>
            )}
            <span className="ml-auto text-sm text-gray-400">{books.length} {t("allBooks").toLowerCase()}</span>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="aspect-[2/3] bg-gray-200 rounded-xl mb-2" />
                  <div className="h-3 bg-gray-200 rounded w-4/5 mb-1" />
                  <div className="h-3 bg-gray-100 rounded w-3/5" />
                </div>
              ))}
            </div>
          ) : books.length === 0 ? (
            <div className="text-center py-20">
              <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400">{t("noResults")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {books.map((book) => (
                <div key={book.id} className="group">
                  <div className="aspect-[2/3] rounded-xl overflow-hidden shadow-sm group-hover:shadow-lg transition-all cursor-pointer bg-gray-100 mb-2 relative"
                    onClick={() => setSelected(book)}>
                    <BookCover coverImage={book.coverImage} title={book.title} />
                    {(book.avgRating || (book.ratingCount ?? 0) > 0) && (
                      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-2 pt-5 pb-1.5 flex items-center gap-1 group-hover:opacity-0 transition-opacity">
                        <span className="text-amber-400 text-[11px] leading-none">★</span>
                        <span className="text-white text-[11px] font-semibold leading-none">{book.avgRating?.toFixed(1)}</span>
                        {(book.ratingCount ?? 0) > 0 && <span className="text-white/60 text-[10px] leading-none">({book.ratingCount})</span>}
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="absolute bottom-0 inset-x-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={(e) => { e.stopPropagation(); handleReserve(book.id); }}
                        disabled={status === "loading" || reserving === book.id || basket.has(book.id)}
                        className={`w-full flex items-center justify-center gap-1 text-xs py-1.5 rounded-lg font-medium transition-colors ${
                          basket.has(book.id) ? "bg-green-500 text-white" : "bg-white text-gray-800 hover:bg-gray-50"
                        } disabled:opacity-70`}>
                        {basket.has(book.id) ? <><CheckCircle className="w-3 h-3" /> {t("alreadyInBasketBtn")}</>
                          : reserving === book.id ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <><ShoppingCart className="w-3 h-3" /> {t("reserve")}</>}
                      </button>
                    </div>
                    <div className={`absolute top-2 right-2 w-2.5 h-2.5 rounded-full ${book.availableCopies > 0 ? "bg-green-400" : "bg-red-400"} shadow`} />
                  </div>
                  <button className="w-full text-left" onClick={() => setSelected(book)}>
                    <p className="text-xs font-semibold text-gray-900 line-clamp-2 leading-snug">{book.title}</p>
                    {allAuthors(book) && <p className="text-[11px] text-gray-400 mt-0.5 truncate">{allAuthors(book)}</p>}
                    {book.materialType && book.materialType !== "BOOK" && (
                      <span className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${MAT_CLS[book.materialType] ?? "bg-gray-100 text-gray-600"}`}>
                        {tb((MAT_KEY[book.materialType] ?? "materialOther") as Parameters<typeof tb>[0])}
                      </span>
                    )}
                  </button>
                </div>
              ))}
            </div>
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
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={() => setSelected(null)}>
            <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
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
                    <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 flex-shrink-0 mt-0.5">
                      <X className="w-4 h-4" />
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
              <div className="px-5 pb-3">
                {selected.referenceOnly ? (
                  <div className="rounded-xl px-4 py-3 text-xs bg-amber-50 border border-amber-200 text-amber-800">
                    <p className="font-semibold">📖 {t("inLibraryUseOnly")}</p>
                    <p className="text-[11px] mt-0.5 opacity-80">{t("referenceOnlyDesc")}</p>
                  </div>
                ) : availability ? (
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
                ) : null}
              </div>

              <div className="px-5 pb-5">
                <button
                  onClick={() => { handleReserve(selected.id); setSelected(null); }}
                  disabled={basket.has(selected.id) || !!selected.referenceOnly || (availability?.queueFull && availability.availableNow === 0)}
                  className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    basket.has(selected.id) ? "bg-green-100 text-green-700"
                      : selected.referenceOnly ? "bg-amber-100 text-amber-700 cursor-not-allowed"
                      : availability?.queueFull && availability.availableNow === 0 ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                      : `${theme.btnPrimary} text-white`
                  }`}>
                  {basket.has(selected.id) ? <><CheckCircle className="w-4 h-4" /> {t("alreadyInBasketBtn")}</>
                    : selected.referenceOnly ? <>📖 {t("referenceOnlyBtn")}</>
                    : availability?.queueFull && availability.availableNow === 0 ? <>{t("queueFullBtn")}</>
                    : <><ShoppingCart className="w-4 h-4" /> {t("reserve")}</>}
                </button>
              </div>
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
  );
}
