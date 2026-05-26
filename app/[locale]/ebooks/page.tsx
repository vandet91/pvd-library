"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import { Search, BookOpen, FileText, BookMarked, Link2, Video, Music, Eye, ChevronLeft, ChevronRight, Flame, Lock } from "lucide-react";
import MemberHeader from "@/components/shared/MemberHeader";
import { useLibraryName } from "@/context/library-name";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";

interface Ebook {
  id: string; title: string; titleKm?: string; description?: string;
  ebookType: string; coverImage?: string; views: number; language: string;
  isPublic: boolean; fileUrl: string | null;
  category?: { name: string } | null;
  author?:   { name: string } | null;
}

const TYPE_META: Record<string, { icon: React.ReactNode; labelKey: string; color: string; bg: string }> = {
  PDF:   { icon: <FileText   className="w-4 h-4" />, labelKey: "pdf",   color: "text-red-600",     bg: "bg-red-50" },
  EPUB:  { icon: <BookMarked className="w-4 h-4" />, labelKey: "epub",  color: "text-blue-600",    bg: "bg-blue-50" },
  LINK:  { icon: <Link2      className="w-4 h-4" />, labelKey: "link",  color: "text-gray-600",    bg: "bg-gray-100" },
  VIDEO: { icon: <Video      className="w-4 h-4" />, labelKey: "video", color: "text-violet-600",  bg: "bg-violet-50" },
  AUDIO: { icon: <Music      className="w-4 h-4" />, labelKey: "audio", color: "text-emerald-600", bg: "bg-emerald-50" },
};

const ACTION_KEY: Record<string, string> = {
  PDF: "read", EPUB: "read", LINK: "open", VIDEO: "watch", AUDIO: "listen",
};

const TYPES = ["ALL", "PDF", "EPUB", "VIDEO", "AUDIO", "LINK"];

export default function EbooksPage() {
  const t  = useTranslations("ebooks");
  const tc = useTranslations("common");
  const to = useTranslations("opac");
  const locale = useLocale();
  const libraryName = useLibraryName();

  const [ebooks,      setEbooks]      = useState<Ebook[]>([]);
  const [featured,    setFeatured]    = useState<Ebook[]>([]);
  const [mostViewed,  setMostViewed]  = useState<Ebook[]>([]);
  const [query,       setQuery]       = useState("");
  const [typeFilter,  setTypeFilter]  = useState("ALL");
  const [loading,     setLoading]     = useState(true);

  // Carousel
  const autoplay = useRef(Autoplay({ delay: 4500, stopOnInteraction: false }));
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true }, [autoplay.current]);

  // Load featured (newest) and most viewed once
  useEffect(() => {
    fetch("/api/ebooks?sort=newest&limit=6")
      .then((r) => r.json())
      .then((data: Ebook[]) => setFeatured(data.slice(0, 6)));
    fetch("/api/ebooks?sort=views&limit=8")
      .then((r) => r.json())
      .then((data: Ebook[]) => setMostViewed(data.slice(0, 8)));
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

  const showHero = !query && typeFilter === "ALL";
  const displayFeatured = featured.length > 0 ? featured : ebooks.slice(0, 6);
  const tLabel = (key: string) => t(key as Parameters<typeof t>[0]);

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Sticky top nav ──────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-30 bg-[#0f1e4a]/95 backdrop-blur border-b border-white/10">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-4">

          {/* Brand + page tabs */}
          <div className="flex items-center gap-1">
            <Link href={`/${locale}/discover`}
              className="flex items-center gap-2 pr-3 mr-2 border-r border-white/20">
              <div className="w-7 h-7 bg-indigo-500/30 rounded-lg flex items-center justify-center flex-shrink-0">
                <BookMarked className="w-4 h-4 text-indigo-300" />
              </div>
              <span className="text-sm font-bold text-white hidden sm:block leading-none">{libraryName}</span>
            </Link>

            <Link href={`/${locale}/discover`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white/60 hover:text-white hover:bg-white/10 transition-colors">
              <BookOpen className="w-3.5 h-3.5" />
              <span className="hidden sm:inline whitespace-nowrap">{to("discover")}</span>
            </Link>

            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-indigo-500/25 ring-1 ring-indigo-400/30 cursor-default whitespace-nowrap">
              <BookMarked className="w-3.5 h-3.5 text-indigo-300" />
              {to("eLibrary")}
            </span>
          </div>

          {/* User actions */}
          <MemberHeader theme="dark" />
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <header className="bg-gradient-to-br from-blue-900 via-indigo-900 to-indigo-800 text-white px-4 py-5 overflow-hidden relative">

        {/* Subtle dot-grid background */}
        <div className="absolute inset-0 pointer-events-none select-none"
          style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.055) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
        {/* Glow blobs */}
        <div className="absolute -top-10 right-1/3 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-64 h-64 bg-blue-400/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-0 left-1/2 w-48 h-48 bg-violet-500/8 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-5xl mx-auto relative">
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
              <div className="relative max-w-xl">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("searchPlaceholder")}
                  className="w-full pl-11 pr-4 py-3 rounded-xl text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-white/40 shadow-lg" />
              </div>
            </div>

            {/* ── Right: decorative library illustration ── */}
            <div className="hidden lg:block flex-shrink-0 select-none pointer-events-none" aria-hidden>
              <svg width="380" height="160" viewBox="0 0 460 220" fill="none" xmlns="http://www.w3.org/2000/svg">

                {/* ══ BACKGROUND GLOWS ══ */}
                <circle cx="230" cy="160" r="120" fill="white" fillOpacity="0.02"/>
                <circle cx="350" cy="90"  r="60"  fill="#818cf8" fillOpacity="0.05"/>
                <circle cx="90"  cy="130" r="50"  fill="#60a5fa" fillOpacity="0.05"/>

                {/* ══ READING LAMP (far left) ══ */}
                <line x1="22" y1="190" x2="22" y2="90"  stroke="white" strokeOpacity="0.28" strokeWidth="2.5" strokeLinecap="round"/>
                <line x1="22" y1="90"  x2="44" y2="76"  stroke="white" strokeOpacity="0.28" strokeWidth="2"   strokeLinecap="round"/>
                {/* Lamp shade */}
                <path d="M 30,76 L 58,76 L 52,96 L 36,96 Z" fill="#fcd34d" fillOpacity="0.3" stroke="#fcd34d" strokeOpacity="0.45" strokeWidth="1.2"/>
                {/* Bulb glow */}
                <ellipse cx="44" cy="98"  rx="14" ry="5"  fill="#fcd34d" fillOpacity="0.15"/>
                <ellipse cx="44" cy="100" rx="9"  ry="3"  fill="#fcd34d" fillOpacity="0.12"/>
                {/* Lamp base */}
                <ellipse cx="22" cy="192" rx="12" ry="4"  fill="white" fillOpacity="0.15" stroke="white" strokeOpacity="0.2" strokeWidth="1"/>

                {/* ══ DOUBLE BOOKSHELF (left section) ══ */}
                {/* Lower shelf board */}
                <rect x="46" y="190" width="128" height="5" rx="2" fill="white" fillOpacity="0.22"/>
                {/* Lower shelf books */}
                <rect x="50"  y="152" width="14" height="38" rx="2" fill="#ef4444" fillOpacity="0.75"/><rect x="50"  y="152" width="4"  height="38" rx="1" fill="#fca5a5" fillOpacity="0.8"/>
                <rect x="66"  y="158" width="12" height="32" rx="2" fill="#3b82f6" fillOpacity="0.75"/><rect x="66"  y="158" width="4"  height="32" rx="1" fill="#93c5fd" fillOpacity="0.8"/>
                <g transform="rotate(-4,84,190)">
                <rect x="80"  y="155" width="13" height="35" rx="2" fill="#10b981" fillOpacity="0.75"/><rect x="80"  y="155" width="4"  height="35" rx="1" fill="#6ee7b7" fillOpacity="0.8"/>
                </g>
                <rect x="95"  y="162" width="11" height="28" rx="2" fill="#f59e0b" fillOpacity="0.75"/><rect x="95"  y="162" width="4"  height="28" rx="1" fill="#fcd34d" fillOpacity="0.8"/>
                <rect x="108" y="154" width="14" height="36" rx="2" fill="#8b5cf6" fillOpacity="0.75"/><rect x="108" y="154" width="4"  height="36" rx="1" fill="#c4b5fd" fillOpacity="0.8"/>
                <rect x="124" y="165" width="10" height="25" rx="2" fill="#ec4899" fillOpacity="0.75"/><rect x="124" y="165" width="4"  height="25" rx="1" fill="#f9a8d4" fillOpacity="0.8"/>
                <rect x="136" y="157" width="13" height="33" rx="2" fill="#14b8a6" fillOpacity="0.75"/><rect x="136" y="157" width="4"  height="33" rx="1" fill="#5eead4" fillOpacity="0.8"/>
                <rect x="151" y="161" width="12" height="29" rx="2" fill="#f97316" fillOpacity="0.75"/><rect x="151" y="161" width="4"  height="29" rx="1" fill="#fdba74" fillOpacity="0.8"/>

                {/* Upper shelf board */}
                <rect x="46" y="144" width="128" height="4" rx="2" fill="white" fillOpacity="0.16"/>
                {/* Upper shelf books */}
                <rect x="50"  y="112" width="10" height="30" rx="2" fill="#6366f1" fillOpacity="0.7"/>
                <rect x="62"  y="117" width="9"  height="25" rx="2" fill="#22c55e" fillOpacity="0.7"/>
                <rect x="73"  y="114" width="11" height="28" rx="2" fill="#e879f9" fillOpacity="0.7"/>
                <rect x="86"  y="119" width="8"  height="23" rx="2" fill="#0ea5e9" fillOpacity="0.7"/>
                <rect x="96"  y="113" width="12" height="29" rx="2" fill="#fb923c" fillOpacity="0.7"/>
                <rect x="110" y="116" width="9"  height="26" rx="2" fill="#a3e635" fillOpacity="0.6"/>
                <rect x="121" y="112" width="11" height="30" rx="2" fill="#f43f5e" fillOpacity="0.7"/>
                <rect x="134" y="118" width="10" height="24" rx="2" fill="#38bdf8" fillOpacity="0.7"/>
                <rect x="146" y="114" width="9"  height="28" rx="2" fill="#fb7185" fillOpacity="0.7"/>
                {/* Shelf bracket left */}
                <path d="M 46,144 L 46,196 L 50,196" stroke="white" strokeOpacity="0.15" strokeWidth="1.5" fill="none"/>
                {/* Shelf bracket right */}
                <path d="M 174,144 L 174,196 L 170,196" stroke="white" strokeOpacity="0.15" strokeWidth="1.5" fill="none"/>

                {/* ══ OWL on shelf ══ */}
                {/* Perch on upper shelf */}
                <ellipse cx="88" cy="110" rx="10" ry="3" fill="white" fillOpacity="0.08"/>
                {/* Body */}
                <ellipse cx="88" cy="97" rx="9" ry="12" fill="white" fillOpacity="0.1" stroke="white" strokeOpacity="0.18" strokeWidth="0.8"/>
                {/* Head */}
                <circle cx="88" cy="83" r="8" fill="white" fillOpacity="0.1" stroke="white" strokeOpacity="0.2" strokeWidth="0.8"/>
                {/* Ear tufts */}
                <path d="M 82,77 L 84,71 L 87,77" fill="white" fillOpacity="0.12"/>
                <path d="M 89,77 L 92,71 L 94,77" fill="white" fillOpacity="0.12"/>
                {/* Eyes */}
                <circle cx="84" cy="83" r="3.5" fill="white" fillOpacity="0.18" stroke="white" strokeOpacity="0.3" strokeWidth="0.8"/>
                <circle cx="92" cy="83" r="3.5" fill="white" fillOpacity="0.18" stroke="white" strokeOpacity="0.3" strokeWidth="0.8"/>
                <circle cx="84" cy="83" r="2"   fill="white" fillOpacity="0.3"/>
                <circle cx="92" cy="83" r="2"   fill="white" fillOpacity="0.3"/>
                {/* Beak */}
                <path d="M 86,87 L 88,91 L 90,87" fill="#fcd34d" fillOpacity="0.45"/>

                {/* ══ STACKED HORIZONTAL BOOKS (center-left base) ══ */}
                <rect x="190" y="195" width="80" height="14" rx="3" fill="#6366f1" fillOpacity="0.88"/><rect x="190" y="195" width="10" height="14" rx="2" fill="#818cf8"/>
                <rect x="195" y="179" width="72" height="14" rx="3" fill="#3b82f6" fillOpacity="0.88"/><rect x="195" y="179" width="10" height="14" rx="2" fill="#60a5fa"/>
                <rect x="200" y="165" width="62" height="12" rx="3" fill="#8b5cf6" fillOpacity="0.88"/><rect x="200" y="165" width="10" height="12" rx="2" fill="#a78bfa"/>

                {/* ══ OPEN BOOK (main centrepiece) ══ */}
                <ellipse cx="271" cy="210" rx="68" ry="7" fill="white" fillOpacity="0.05"/>
                {/* Left page */}
                <path d="M 198,200 C 193,96 218,62 248,50 L 266,50 L 266,200 Z"
                      fill="white" fillOpacity="0.13" stroke="white" strokeOpacity="0.28" strokeWidth="1.2"/>
                {/* Right page */}
                <path d="M 344,200 C 349,96 324,62 294,50 L 276,50 L 276,200 Z"
                      fill="white" fillOpacity="0.09" stroke="white" strokeOpacity="0.28" strokeWidth="1.2"/>
                {/* Spine */}
                <rect x="266" y="50" width="10" height="150" fill="white" fillOpacity="0.06"/>
                <line x1="271" y1="50" x2="271" y2="200" stroke="white" strokeOpacity="0.4" strokeWidth="2" strokeLinecap="round"/>
                {/* Left page lines */}
                <line x1="212" y1="80"  x2="260" y2="76"  stroke="white" strokeOpacity="0.17" strokeWidth="1"/>
                <line x1="210" y1="95"  x2="260" y2="91"  stroke="white" strokeOpacity="0.17" strokeWidth="1"/>
                <line x1="207" y1="110" x2="260" y2="106" stroke="white" strokeOpacity="0.17" strokeWidth="1"/>
                <line x1="205" y1="125" x2="260" y2="121" stroke="white" strokeOpacity="0.14" strokeWidth="1"/>
                <line x1="204" y1="140" x2="260" y2="136" stroke="white" strokeOpacity="0.14" strokeWidth="1"/>
                <line x1="203" y1="155" x2="260" y2="151" stroke="white" strokeOpacity="0.11" strokeWidth="1"/>
                <line x1="202" y1="170" x2="260" y2="166" stroke="white" strokeOpacity="0.10" strokeWidth="1"/>
                {/* Left page small image box */}
                <rect x="210" y="76" width="28" height="20" rx="2" fill="white" fillOpacity="0.07" stroke="white" strokeOpacity="0.12" strokeWidth="0.8"/>
                {/* Right page lines */}
                <line x1="282" y1="76"  x2="330" y2="80"  stroke="white" strokeOpacity="0.17" strokeWidth="1"/>
                <line x1="282" y1="91"  x2="332" y2="95"  stroke="white" strokeOpacity="0.17" strokeWidth="1"/>
                <line x1="282" y1="106" x2="335" y2="110" stroke="white" strokeOpacity="0.17" strokeWidth="1"/>
                <line x1="282" y1="121" x2="337" y2="125" stroke="white" strokeOpacity="0.14" strokeWidth="1"/>
                <line x1="282" y1="136" x2="338" y2="140" stroke="white" strokeOpacity="0.14" strokeWidth="1"/>
                <line x1="282" y1="151" x2="339" y2="155" stroke="white" strokeOpacity="0.11" strokeWidth="1"/>
                <line x1="282" y1="166" x2="340" y2="170" stroke="white" strokeOpacity="0.10" strokeWidth="1"/>
                {/* Right page highlights */}
                <rect x="285" y="73"  width="38" height="6"  rx="3" fill="white" fillOpacity="0.22"/>
                <rect x="285" y="84"  width="26" height="4"  rx="2" fill="white" fillOpacity="0.13"/>

                {/* ══ BOOKMARK (bouncing) ══ */}
                <g>
                  <path d="M 320,28 L 337,28 L 337,70 L 328.5,61 L 320,70 Z"
                        fill="#f59e0b" fillOpacity="0.78" stroke="#fcd34d" strokeOpacity="0.55" strokeWidth="1.2"/>
                  <line x1="326" y1="38" x2="332" y2="38" stroke="white" strokeOpacity="0.3" strokeWidth="0.8"/>
                  <line x1="325" y1="45" x2="333" y2="45" stroke="white" strokeOpacity="0.2" strokeWidth="0.8"/>
                  <animateTransform attributeName="transform" type="translate"
                    values="0,0; 0,-7; 0,0" dur="2.8s" repeatCount="indefinite" calcMode="ease-in-out"/>
                </g>

                {/* ══ GRADUATION CAP (floating, top-right) ══ */}
                <g>
                  <path d="M 390,46 L 416,36 L 442,46 L 416,56 Z" fill="white" fillOpacity="0.22" stroke="white" strokeOpacity="0.3" strokeWidth="1"/>
                  <circle cx="416" cy="46" r="4" fill="white" fillOpacity="0.3"/>
                  <path d="M 404,46 L 404,62 Q 416,68 428,62 L 428,46" fill="white" fillOpacity="0.1" stroke="white" strokeOpacity="0.25" strokeWidth="1"/>
                  {/* Tassel */}
                  <line x1="438" y1="42" x2="448" y2="58" stroke="#fcd34d" strokeOpacity="0.75" strokeWidth="1.8" strokeLinecap="round"/>
                  <circle cx="449" cy="62" r="4" fill="#fcd34d" fillOpacity="0.65"/>
                  <animateTransform attributeName="transform" type="rotate"
                    values="0,416,46; 4,416,46; 0,416,46" dur="4s" repeatCount="indefinite" calcMode="ease-in-out"/>
                </g>

                {/* ══ GLOBE (far right) ══ */}
                <g opacity="0.55">
                  <circle cx="424" cy="152" r="32" stroke="white" strokeOpacity="0.28" strokeWidth="1.4" fill="white" fillOpacity="0.04"/>
                  <ellipse cx="424" cy="152" rx="32" ry="11" stroke="white" strokeOpacity="0.2" strokeWidth="1" fill="none"/>
                  <ellipse cx="424" cy="137" rx="23" ry="9"  stroke="white" strokeOpacity="0.15" strokeWidth="0.8" fill="none"/>
                  <ellipse cx="424" cy="167" rx="23" ry="9"  stroke="white" strokeOpacity="0.15" strokeWidth="0.8" fill="none"/>
                  <line x1="424" y1="120" x2="424" y2="184" stroke="white" strokeOpacity="0.2" strokeWidth="1"/>
                  <ellipse cx="424" cy="152" rx="16" ry="32" stroke="white" strokeOpacity="0.14" strokeWidth="0.8" fill="none"/>
                  {/* Stand */}
                  <line x1="424" y1="184" x2="424" y2="196" stroke="white" strokeOpacity="0.25" strokeWidth="2.5" strokeLinecap="round"/>
                  <ellipse cx="424" cy="198" rx="12" ry="4" fill="white" fillOpacity="0.08" stroke="white" strokeOpacity="0.18" strokeWidth="1"/>
                </g>

                {/* ══ FLOATING PAPERS ══ */}
                <g transform="rotate(14,375,35)">
                  <rect x="362" y="20" width="26" height="32" rx="2" fill="white" fillOpacity="0.09" stroke="white" strokeOpacity="0.18" strokeWidth="0.8"/>
                  <line x1="366" y1="29" x2="384" y2="29" stroke="white" strokeOpacity="0.14" strokeWidth="0.8"/>
                  <line x1="366" y1="36" x2="384" y2="36" stroke="white" strokeOpacity="0.14" strokeWidth="0.8"/>
                  <line x1="366" y1="43" x2="380" y2="43" stroke="white" strokeOpacity="0.10" strokeWidth="0.8"/>
                </g>
                <g transform="rotate(-10,170,28)">
                  <rect x="158" y="16" width="22" height="28" rx="2" fill="white" fillOpacity="0.07" stroke="white" strokeOpacity="0.15" strokeWidth="0.8"/>
                  <line x1="162" y1="25" x2="176" y2="25" stroke="white" strokeOpacity="0.12" strokeWidth="0.8"/>
                  <line x1="162" y1="32" x2="176" y2="32" stroke="white" strokeOpacity="0.12" strokeWidth="0.8"/>
                </g>

                {/* ══ MAGNIFYING GLASS ══ */}
                <circle cx="368" cy="118" r="18" stroke="white" strokeOpacity="0.22" strokeWidth="2" fill="white" fillOpacity="0.04"/>
                <circle cx="364" cy="114" r="5"  fill="white" fillOpacity="0.07"/>
                <line x1="381" y1="131" x2="392" y2="142" stroke="white" strokeOpacity="0.22" strokeWidth="3" strokeLinecap="round"/>

                {/* ══ SPARKLE STARS ══ */}
                {/* Large gold */}
                <path d="M 174,22 L 177,12 L 180,22 L 190,25 L 180,28 L 177,38 L 174,28 L 164,25 Z" fill="#fcd34d" fillOpacity="0.7">
                  <animate attributeName="opacity" values="0.7;1;0.7" dur="2.2s" repeatCount="indefinite"/>
                </path>
                {/* Medium white */}
                <path d="M 352,80 L 354,73 L 356,80 L 363,82 L 356,84 L 354,91 L 352,84 L 345,82 Z" fill="white" fillOpacity="0.5">
                  <animate attributeName="opacity" values="0.5;0.9;0.5" dur="1.9s" repeatCount="indefinite" begin="0.5s"/>
                </path>
                {/* Small violet */}
                <path d="M 60,42 L 61.5,36 L 63,42 L 69,43.5 L 63,45 L 61.5,51 L 60,45 L 54,43.5 Z" fill="#c4b5fd" fillOpacity="0.55">
                  <animate attributeName="opacity" values="0.55;0.9;0.55" dur="2.8s" repeatCount="indefinite" begin="1.1s"/>
                </path>
                {/* Tiny teal */}
                <path d="M 388,168 L 389,163 L 390,168 L 395,169 L 390,170 L 389,175 L 388,170 L 383,169 Z" fill="#5eead4" fillOpacity="0.55">
                  <animate attributeName="opacity" values="0.55;0.9;0.55" dur="2.4s" repeatCount="indefinite" begin="0.8s"/>
                </path>
                {/* Tiny rose */}
                <path d="M 140,32 L 141,27 L 142,32 L 147,33 L 142,34 L 141,39 L 140,34 L 135,33 Z" fill="#fb7185" fillOpacity="0.5">
                  <animate attributeName="opacity" values="0.5;0.85;0.5" dur="3.1s" repeatCount="indefinite" begin="1.5s"/>
                </path>

                {/* ══ FLOATING DOTS ══ */}
                <circle cx="8"   cy="60"  r="2.5" fill="#818cf8" fillOpacity="0.5"/>
                <circle cx="186" cy="212" r="2"   fill="white"   fillOpacity="0.3"/>
                <circle cx="356" cy="200" r="2"   fill="#c4b5fd" fillOpacity="0.45"/>
                <circle cx="450" cy="100" r="1.5" fill="white"   fillOpacity="0.4"/>
                <circle cx="108" cy="64"  r="1.5" fill="#93c5fd" fillOpacity="0.4"/>
                <circle cx="248" cy="32"  r="1.5" fill="#fcd34d" fillOpacity="0.45"/>
                <circle cx="458" cy="162" r="1"   fill="white"   fillOpacity="0.35"/>
                <circle cx="14"  cy="170" r="1.5" fill="#a5b4fc" fillOpacity="0.4"/>
              </svg>
            </div>

          </div>
        </div>
      </header>

      {/* Featured carousel */}
      {showHero && displayFeatured.length > 0 && (
        <section className="max-w-5xl mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <BookMarked className="w-5 h-5 text-blue-600" />
              {t("featured")}
            </h2>
            <div className="flex gap-2">
              <button onClick={() => emblaApi?.scrollPrev()}
                className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={() => emblaApi?.scrollNext()}
                className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl" ref={emblaRef}>
            <div className="flex gap-4">
              {displayFeatured.map((ebook) => {
                const meta = TYPE_META[ebook.ebookType];
                return (
                  <Link key={ebook.id} href={`/${locale}/ebooks/${ebook.id}`} className="flex-[0_0_240px] min-w-0 group">
                    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden h-full hover:shadow-md transition-shadow">
                      <div className={`h-32 ${meta.bg} flex items-center justify-center relative`}>
                        {ebook.coverImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={ebook.coverImage} alt={ebook.title} className="h-full w-full object-cover" />
                        ) : (
                          <div className={`${meta.color} opacity-30 text-5xl`}>{meta.icon}</div>
                        )}
                        <span className={`absolute top-2 left-2 inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold ${meta.bg} ${meta.color}`}>
                          {meta.icon}{tLabel(meta.labelKey)}
                        </span>
                        <div className="absolute top-2 right-2 flex items-center gap-1">
                          {!ebook.isPublic && (
                            <span className="inline-flex items-center gap-0.5 text-xs bg-amber-500 text-white px-1.5 py-0.5 rounded-full">
                              <Lock className="w-2.5 h-2.5" />
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1 text-xs bg-black/30 text-white px-2 py-0.5 rounded-full">
                            <Eye className="w-3 h-3" />{ebook.views}
                          </span>
                        </div>
                      </div>
                      <div className="p-3">
                        <h3 className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2 mb-1">
                          {locale === "km" && ebook.titleKm ? ebook.titleKm : ebook.title}
                        </h3>
                        {ebook.author && <p className="text-xs text-gray-500">{ebook.author.name}</p>}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Most viewed strip */}
      {showHero && mostViewed.length > 0 && (
        <section className="max-w-5xl mx-auto px-4 pb-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Flame className="w-5 h-5 text-orange-500" />
            {t("mostViewed")}
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {mostViewed.map((ebook) => {
              const meta = TYPE_META[ebook.ebookType];
              return (
                <Link key={ebook.id} href={`/${locale}/ebooks/${ebook.id}`}
                  className="flex-shrink-0 w-36 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                  <div className={`h-20 ${meta.bg} flex items-center justify-center`}>
                    {ebook.coverImage
                      ? <img src={ebook.coverImage} alt={ebook.title} className="h-full w-full object-cover" />  // eslint-disable-line @next/next/no-img-element
                      : <div className={`${meta.color} opacity-30`}>{meta.icon}</div>}
                  </div>
                  <div className="p-2">
                    <p className="text-xs font-semibold text-gray-900 line-clamp-2">{ebook.title}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <Eye className="w-3 h-3 text-gray-400" />
                      <span className="text-xs text-gray-400">{ebook.views}</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <main className="max-w-5xl mx-auto px-4 py-6 min-h-[60vh]">
        {/* Type filter */}
        <div className="flex flex-wrap gap-2 mb-6">
          {TYPES.map((type) => {
            const meta = type === "ALL" ? null : TYPE_META[type];
            return (
              <button key={type} onClick={() => setTypeFilter(type)}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  typeFilter === type ? "bg-blue-900 text-white" : "bg-white text-gray-600 border border-gray-200 hover:border-blue-300"
                }`}>
                {meta?.icon}
                {type === "ALL" ? t("allTypes") : tLabel(meta!.labelKey)}
              </button>
            );
          })}
          <span className="ml-auto self-center text-sm text-gray-400">{ebooks.length} {tc("total").toLowerCase()}</span>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden animate-pulse">
                <div className="h-36 bg-gray-200" />
                <div className="p-4">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                  <div className="h-3 bg-gray-100 rounded w-1/2 mb-3" />
                  <div className="h-3 bg-gray-100 rounded w-1/3 mb-4" />
                  <div className="h-8 bg-gray-100 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        ) : ebooks.length === 0 ? (
          <div className="text-center py-16">
            <BookMarked className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400">{t("noEbooks")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {ebooks.map((ebook) => {
              const meta = TYPE_META[ebook.ebookType];
              const action = tLabel(ACTION_KEY[ebook.ebookType] ?? "read");
              return (
                <div key={ebook.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow flex flex-col">
                  <div className={`h-36 flex items-center justify-center ${meta.bg} relative`}>
                    {ebook.coverImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={ebook.coverImage} alt={ebook.title} className="h-full w-full object-cover" />
                    ) : (
                      <div className={`${meta.color} opacity-20 text-[56px]`}>{meta.icon}</div>
                    )}
                    <span className={`absolute top-2 left-2 inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold ${meta.bg} ${meta.color} border border-current/20`}>
                      {meta.icon}{tLabel(meta.labelKey)}
                    </span>
                    <div className="absolute top-2 right-2 flex items-center gap-1">
                      {!ebook.isPublic && (
                        <span className="inline-flex items-center gap-0.5 text-xs bg-amber-500 text-white px-1.5 py-0.5 rounded-full font-semibold">
                          <Lock className="w-2.5 h-2.5" />
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 text-xs bg-black/30 text-white px-2 py-0.5 rounded-full">
                        <Eye className="w-3 h-3" />{ebook.views}
                      </span>
                    </div>
                  </div>
                  <div className="p-4 flex-1 flex flex-col">
                    <div className="flex items-start gap-1 mb-1">
                      <h3 className="font-semibold text-gray-900 text-sm leading-snug flex-1">
                        {locale === "km" && ebook.titleKm ? ebook.titleKm : ebook.title}
                      </h3>
                    </div>
                    {ebook.author && <p className="text-xs text-gray-500 mb-1">{ebook.author.name}</p>}
                    <div className="flex flex-wrap items-center gap-1.5 mb-2">
                      {ebook.category && (
                        <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{ebook.category.name}</span>
                      )}
                      {!ebook.isPublic && (
                        <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full flex items-center gap-1 font-medium">
                          <Lock className="w-2.5 h-2.5" /> {t("membersOnlyLabel")}
                        </span>
                      )}
                    </div>
                    {ebook.description && (
                      <p className="text-xs text-gray-400 line-clamp-2 mb-3 flex-1">{ebook.description}</p>
                    )}
                    <Link
                      href={
                        !ebook.isPublic && !ebook.fileUrl
                          ? `/${locale}/member/login`
                          : `/${locale}/ebooks/${ebook.id}`
                      }
                      className={`mt-auto flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${
                        !ebook.isPublic
                          ? "bg-amber-50 text-amber-700 hover:bg-amber-100"
                          : `${meta.bg} ${meta.color} hover:opacity-80`
                      }`}
                    >
                      {!ebook.isPublic ? (
                        <><Lock className="w-3.5 h-3.5" /> {t("loginToAccess")}</>
                      ) : (
                        <>{meta.icon}{action}</>
                      )}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
