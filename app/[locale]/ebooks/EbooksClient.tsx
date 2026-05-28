"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Search, BookOpen, FileText, BookMarked, Link2, Video, Music,
  Eye, ChevronLeft, ChevronRight, Flame, Lock, X,
} from "lucide-react";
import MemberHeader from "@/components/shared/MemberHeader";
import { StarDisplay, StarInput } from "@/components/shared/StarRating";
import { getOpacTheme } from "@/lib/opac-theme";
import { useLibraryName } from "@/context/library-name";
import { useLibraryLogo } from "@/context/library-logo";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import BookSearchChat from "@/components/BookSearchChat";

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

// ── EbookCover ───────────────────────────────────────────────────────────────
function EbookCover({
  coverImage, title, ebookType, className = "",
}: {
  coverImage?: string | null;
  title: string;
  ebookType: string;
  className?: string;
}) {
  const meta = TYPE_META[ebookType];
  const gradFrom = meta?.gradFrom ?? "from-indigo-600";
  const gradTo   = meta?.gradTo   ?? "to-indigo-900";

  if (coverImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={coverImage} alt={title} className={`w-full h-full object-contain ${className}`} />
    );
  }

  const initials = title
    .split(" ").filter(Boolean).slice(0, 2)
    .map((w) => w[0].toUpperCase()).join("");

  return (
    <div className={`w-full h-full bg-gradient-to-br ${gradFrom} ${gradTo} flex flex-col items-center justify-center gap-2 ${className}`}>
      <div className="text-white/30 [&_svg]:w-8 [&_svg]:h-8">{meta?.icon ?? <BookOpen className="w-8 h-8" />}</div>
      <span className="text-white/70 text-xs font-bold px-2 text-center leading-tight">{initials}</span>
    </div>
  );
}

export default function EbooksClient({ opacTheme }: { opacTheme: string }) {
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
  const [featured,    setFeatured]    = useState<Ebook[]>([]);
  const [mostViewed,  setMostViewed]  = useState<Ebook[]>([]);
  const [query,       setQuery]       = useState("");
  const [typeFilter,  setTypeFilter]  = useState("ALL");
  const [loading,     setLoading]     = useState(true);
  const [aiEnabled,   setAiEnabled]   = useState(false);
  // Initialise with the server-supplied theme key — no flash possible
  const [theme,       setTheme]       = useState(getOpacTheme(opacTheme));

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

  // Check AI + theme settings (also live-updates theme if admin changes it)
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.ok ? r.json() : {})
      .then((d: Record<string, string>) => {
        setAiEnabled(d.AI_SEARCH_MEMBER !== "false");
        setTheme(getOpacTheme(d.OPAC_THEME));
      })
      .catch(() => {});
  }, []);

  // Load featured (newest) and most viewed once
  useEffect(() => {
    fetch("/api/ebooks?sort=newest&limit=6")
      .then((r) => r.json())
      .then((data: Ebook[]) => setFeatured(data.slice(0, 6)));
    fetch("/api/ebooks?sort=views&limit=10")
      .then((r) => r.json())
      .then((data: Ebook[]) => setMostViewed(data.slice(0, 10)));
  }, []);

  const fetchEbooks = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (query)               params.set("q", query);
    if (typeFilter !== "ALL") params.set("type", typeFilter);
    const data = await fetch(`/api/ebooks?${params}`).then((r) => r.json());
    setEbooks(data);
    setLoading(false);
  }, [query, typeFilter]);

  useEffect(() => { fetchEbooks(); }, [fetchEbooks]);

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
  const displayFeatured = featured.length > 0 ? featured : ebooks.slice(0, 6);
  const tLabel = (key: string) => t(key as Parameters<typeof t>[0]);

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Sticky top nav ──────────────────────────────────────────────── */}
      <nav className={`sticky top-0 z-30 ${theme.navBg} backdrop-blur border-b border-white/10`}>
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">

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
          </div>

          {/* User actions */}
          <MemberHeader theme="dark" />
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <header className={`${theme.heroBg} text-white px-4 py-5 overflow-hidden relative`}>

        {/* Subtle dot-grid background */}
        <div className="absolute inset-0 pointer-events-none select-none"
          style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.055) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
        {/* Glow blobs */}
        <div className={`absolute -top-10 right-1/3 w-80 h-80 ${theme.heroGlow1} rounded-full blur-3xl pointer-events-none`} />
        <div className={`absolute bottom-0 right-0 w-64 h-64 ${theme.heroGlow2} rounded-full blur-3xl pointer-events-none`} />

        <div className="max-w-6xl mx-auto relative">
          <div className="flex items-center gap-6">

            {/* ── Left: text + search ── */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 bg-white/15 rounded-xl flex items-center justify-center flex-shrink-0 shadow-inner">
                  <BookMarked className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-lg font-bold leading-tight">{t("title")}</h1>
                  <p className="text-white/55 text-sm">{t("subtitle")}</p>
                </div>
              </div>
              <div className="flex gap-2 max-w-2xl">
                <div className="flex-1 flex bg-white rounded-xl overflow-hidden shadow-lg ring-1 ring-white/20">
                  <div className="relative flex-1 flex items-center">
                    <Search className="absolute left-4 w-4 h-4 text-gray-400 pointer-events-none" />
                    <input
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && fetchEbooks()}
                      placeholder={t("searchPlaceholder")}
                      className="w-full pl-11 pr-4 py-3 text-gray-900 text-sm focus:outline-none bg-transparent"
                    />
                  </div>
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className="border-l border-gray-100 px-3 py-2.5 text-sm text-gray-600 bg-white focus:outline-none cursor-pointer min-w-[110px] max-w-[140px]"
                  >
                    {TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type === "ALL" ? t("allTypes") : tLabel(TYPE_META[type]?.labelKey ?? type)}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={fetchEbooks}
                  className={`px-5 py-3 ${theme.btnPrimary} text-white rounded-xl font-semibold text-sm flex-shrink-0 flex items-center gap-2 hover:opacity-90 transition-opacity shadow-lg`}
                >
                  <Search className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{tc("search")}</span>
                </button>
              </div>
            </div>

            {/* ── Right: decorative illustration ── */}
            <div className="hidden lg:block flex-shrink-0 select-none pointer-events-none" aria-hidden>
              <svg width="380" height="160" viewBox="0 0 460 220" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="230" cy="160" r="120" fill="white" fillOpacity="0.02"/>
                <circle cx="350" cy="90"  r="60"  fill="#818cf8" fillOpacity="0.05"/>
                <circle cx="90"  cy="130" r="50"  fill="#60a5fa" fillOpacity="0.05"/>
                <line x1="22" y1="190" x2="22" y2="90"  stroke="white" strokeOpacity="0.28" strokeWidth="2.5" strokeLinecap="round"/>
                <line x1="22" y1="90"  x2="44" y2="76"  stroke="white" strokeOpacity="0.28" strokeWidth="2"   strokeLinecap="round"/>
                <path d="M 30,76 L 58,76 L 52,96 L 36,96 Z" fill="#fcd34d" fillOpacity="0.3" stroke="#fcd34d" strokeOpacity="0.45" strokeWidth="1.2"/>
                <ellipse cx="44" cy="98"  rx="14" ry="5"  fill="#fcd34d" fillOpacity="0.15"/>
                <ellipse cx="22" cy="192" rx="12" ry="4"  fill="white" fillOpacity="0.15" stroke="white" strokeOpacity="0.2" strokeWidth="1"/>
                <rect x="46" y="190" width="128" height="5" rx="2" fill="white" fillOpacity="0.22"/>
                <rect x="50"  y="152" width="14" height="38" rx="2" fill="#ef4444" fillOpacity="0.75"/><rect x="50"  y="152" width="4"  height="38" rx="1" fill="#fca5a5" fillOpacity="0.8"/>
                <rect x="66"  y="158" width="12" height="32" rx="2" fill="#3b82f6" fillOpacity="0.75"/><rect x="66"  y="158" width="4"  height="32" rx="1" fill="#93c5fd" fillOpacity="0.8"/>
                <rect x="80"  y="155" width="13" height="35" rx="2" fill="#10b981" fillOpacity="0.75"/><rect x="80"  y="155" width="4"  height="35" rx="1" fill="#6ee7b7" fillOpacity="0.8"/>
                <rect x="95"  y="162" width="11" height="28" rx="2" fill="#f59e0b" fillOpacity="0.75"/><rect x="95"  y="162" width="4"  height="28" rx="1" fill="#fcd34d" fillOpacity="0.8"/>
                <rect x="108" y="154" width="14" height="36" rx="2" fill="#8b5cf6" fillOpacity="0.75"/><rect x="108" y="154" width="4"  height="36" rx="1" fill="#c4b5fd" fillOpacity="0.8"/>
                <rect x="124" y="165" width="10" height="25" rx="2" fill="#ec4899" fillOpacity="0.75"/>
                <rect x="136" y="157" width="13" height="33" rx="2" fill="#14b8a6" fillOpacity="0.75"/>
                <rect x="46" y="144" width="128" height="4" rx="2" fill="white" fillOpacity="0.16"/>
                <rect x="50"  y="112" width="10" height="30" rx="2" fill="#6366f1" fillOpacity="0.7"/>
                <rect x="62"  y="117" width="9"  height="25" rx="2" fill="#22c55e" fillOpacity="0.7"/>
                <rect x="73"  y="114" width="11" height="28" rx="2" fill="#e879f9" fillOpacity="0.7"/>
                <rect x="86"  y="119" width="8"  height="23" rx="2" fill="#0ea5e9" fillOpacity="0.7"/>
                <rect x="96"  y="113" width="12" height="29" rx="2" fill="#fb923c" fillOpacity="0.7"/>
                <rect x="110" y="116" width="9"  height="26" rx="2" fill="#a3e635" fillOpacity="0.6"/>
                <rect x="121" y="112" width="11" height="30" rx="2" fill="#f43f5e" fillOpacity="0.7"/>
                <ellipse cx="271" cy="210" rx="68" ry="7" fill="white" fillOpacity="0.05"/>
                <path d="M 198,200 C 193,96 218,62 248,50 L 266,50 L 266,200 Z" fill="white" fillOpacity="0.13" stroke="white" strokeOpacity="0.28" strokeWidth="1.2"/>
                <path d="M 344,200 C 349,96 324,62 294,50 L 276,50 L 276,200 Z" fill="white" fillOpacity="0.09" stroke="white" strokeOpacity="0.28" strokeWidth="1.2"/>
                <line x1="271" y1="50" x2="271" y2="200" stroke="white" strokeOpacity="0.4" strokeWidth="2" strokeLinecap="round"/>
                <line x1="212" y1="80"  x2="260" y2="76"  stroke="white" strokeOpacity="0.17" strokeWidth="1"/>
                <line x1="210" y1="95"  x2="260" y2="91"  stroke="white" strokeOpacity="0.17" strokeWidth="1"/>
                <line x1="207" y1="110" x2="260" y2="106" stroke="white" strokeOpacity="0.17" strokeWidth="1"/>
                <line x1="282" y1="76"  x2="330" y2="80"  stroke="white" strokeOpacity="0.17" strokeWidth="1"/>
                <line x1="282" y1="91"  x2="332" y2="95"  stroke="white" strokeOpacity="0.17" strokeWidth="1"/>
                <rect x="285" y="73"  width="38" height="6"  rx="3" fill="white" fillOpacity="0.22"/>
                <g>
                  <path d="M 320,28 L 337,28 L 337,70 L 328.5,61 L 320,70 Z" fill="#f59e0b" fillOpacity="0.78" stroke="#fcd34d" strokeOpacity="0.55" strokeWidth="1.2"/>
                  <animateTransform attributeName="transform" type="translate" values="0,0; 0,-7; 0,0" dur="2.8s" repeatCount="indefinite" calcMode="ease-in-out"/>
                </g>
                <path d="M 390,46 L 416,36 L 442,46 L 416,56 Z" fill="white" fillOpacity="0.22" stroke="white" strokeOpacity="0.3" strokeWidth="1"/>
                <circle cx="416" cy="46" r="4" fill="white" fillOpacity="0.3"/>
                <g opacity="0.55">
                  <circle cx="424" cy="152" r="32" stroke="white" strokeOpacity="0.28" strokeWidth="1.4" fill="white" fillOpacity="0.04"/>
                  <ellipse cx="424" cy="152" rx="32" ry="11" stroke="white" strokeOpacity="0.2" strokeWidth="1" fill="none"/>
                  <line x1="424" y1="120" x2="424" y2="184" stroke="white" strokeOpacity="0.2" strokeWidth="1"/>
                  <line x1="424" y1="184" x2="424" y2="196" stroke="white" strokeOpacity="0.25" strokeWidth="2.5" strokeLinecap="round"/>
                </g>
                <path d="M 174,22 L 177,12 L 180,22 L 190,25 L 180,28 L 177,38 L 174,28 L 164,25 Z" fill="#fcd34d" fillOpacity="0.7">
                  <animate attributeName="opacity" values="0.7;1;0.7" dur="2.2s" repeatCount="indefinite"/>
                </path>
                <path d="M 352,80 L 354,73 L 356,80 L 363,82 L 356,84 L 354,91 L 352,84 L 345,82 Z" fill="white" fillOpacity="0.5">
                  <animate attributeName="opacity" values="0.5;0.9;0.5" dur="1.9s" repeatCount="indefinite" begin="0.5s"/>
                </path>
                <circle cx="8"   cy="60"  r="2.5" fill="#818cf8" fillOpacity="0.5"/>
                <circle cx="186" cy="212" r="2"   fill="white"   fillOpacity="0.3"/>
                <circle cx="248" cy="32"  r="1.5" fill="#fcd34d" fillOpacity="0.45"/>
              </svg>
            </div>

          </div>
        </div>
      </header>

      {/* ── Featured carousel ────────────────────────────────────────────── */}
      {showHero && displayFeatured.length > 0 && (
        <section className="max-w-6xl mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <BookMarked className={`w-4 h-4 ${theme.sectionIcon}`} />
              {t("featured")}
            </h2>
            <div className="flex gap-2">
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

          {/* Embla carousel — portrait cards */}
          <div className="overflow-hidden" ref={emblaRef}>
            <div className="flex gap-3">
              {displayFeatured.map((ebook) => {
                const meta = TYPE_META[ebook.ebookType];
                return (
                  <Link key={ebook.id} href={`/${locale}/ebooks/${ebook.id}`}
                    className="flex-[0_0_130px] min-w-0 group">
                    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                      {/* Portrait cover */}
                      <div className="aspect-[2/3] relative overflow-hidden bg-gray-100">
                        <EbookCover coverImage={ebook.coverImage} title={ebook.title} ebookType={ebook.ebookType} />
                        {/* Type badge — icon only */}
                        {meta && (
                          <span className={`absolute top-1.5 left-1.5 inline-flex items-center justify-center ${meta.bg} ${meta.color} p-1 rounded-full shadow-sm [&_svg]:w-3 [&_svg]:h-3`}>
                            {meta.icon}
                          </span>
                        )}
                        {/* Lock + views */}
                        <div className="absolute top-1.5 right-1.5 flex flex-col items-end gap-1">
                          {!ebook.isPublic && (
                            <span className="inline-flex items-center bg-amber-500 text-white p-0.5 rounded-full shadow-sm">
                              <Lock className="w-2.5 h-2.5" />
                            </span>
                          )}
                          <span className="inline-flex items-center gap-0.5 text-[10px] bg-black/40 text-white px-1.5 py-0.5 rounded-full">
                            <Eye className="w-2.5 h-2.5" />{ebook.views}
                          </span>
                        </div>
                      </div>
                      {/* Info */}
                      <div className="p-2">
                        <p className="text-xs font-semibold text-gray-900 line-clamp-2 leading-snug">
                          {locale === "km" && ebook.titleKm ? ebook.titleKm : ebook.title}
                        </p>
                        {ebook.author && (
                          <p className="text-[10px] text-gray-400 mt-0.5 truncate">{ebook.author.name}</p>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ── Most viewed strip ─────────────────────────────────────────────── */}
      {showHero && mostViewed.length > 0 && (
        <section className="max-w-6xl mx-auto px-4 pb-6">
          <h2 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
            <Flame className="w-4 h-4 text-orange-500" />
            {t("mostViewed")}
          </h2>
          <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-hide">
            {mostViewed.map((ebook) => {
              const meta = TYPE_META[ebook.ebookType];
              return (
                <Link key={ebook.id} href={`/${locale}/ebooks/${ebook.id}`}
                  className="flex-shrink-0 w-[88px] group">
                  <div className="aspect-[2/3] rounded-lg overflow-hidden relative bg-gray-100 shadow-sm group-hover:shadow-md transition-shadow">
                    <EbookCover coverImage={ebook.coverImage} title={ebook.title} ebookType={ebook.ebookType} />
                    {/* Type icon badge */}
                    {meta && (
                      <span className={`absolute top-1 left-1 inline-flex items-center ${meta.bg} ${meta.color} p-0.5 rounded-full shadow-sm`}>
                        <span className="[&_svg]:w-2.5 [&_svg]:h-2.5">{meta.icon}</span>
                      </span>
                    )}
                    {!ebook.isPublic && (
                      <span className="absolute top-1 right-1 inline-flex bg-amber-500 text-white p-0.5 rounded-full">
                        <Lock className="w-2.5 h-2.5" />
                      </span>
                    )}
                    {/* Views */}
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent px-1 py-1 flex items-center gap-0.5">
                      <Eye className="w-2.5 h-2.5 text-white/70" />
                      <span className="text-[10px] text-white/80">{ebook.views}</span>
                    </div>
                  </div>
                  <p className="text-[10px] text-gray-600 mt-1 line-clamp-2 leading-snug font-medium px-0.5">
                    {locale === "km" && ebook.titleKm ? ebook.titleKm : ebook.title}
                  </p>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Main catalog ──────────────────────────────────────────────────── */}
      <main className="max-w-6xl mx-auto px-4 py-6 min-h-[60vh]">

        {/* Result count */}
        <div className="flex items-center justify-between mb-5">
          <p className="text-sm text-gray-500">
            {ebooks.length} {tc("total").toLowerCase()}
            {typeFilter !== "ALL" && (
              <span className={`ml-2 inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${theme.filterActive} text-white`}>
                {tLabel(TYPE_META[typeFilter]?.labelKey ?? typeFilter)}
                <button onClick={() => setTypeFilter("ALL")} className="opacity-70 hover:opacity-100 ml-0.5">×</button>
              </span>
            )}
          </p>
        </div>

        {/* Grid */}
        {loading ? (
          /* Skeleton — portrait cards */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
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
                  <div className="aspect-[2/3] rounded-xl overflow-hidden relative bg-gray-100 shadow-sm group-hover:shadow-lg transition-all duration-200">
                    <EbookCover coverImage={ebook.coverImage} title={ebook.title} ebookType={ebook.ebookType} />

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
  );
}
