"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Search, BookOpen, BookMarked, ChevronLeft, ChevronRight, ShoppingCart, CheckCircle, X, Star, PlusCircle, Send } from "lucide-react";
import MemberHeader from "@/components/shared/MemberHeader";
import { useLibraryName } from "@/context/library-name";
import { useLibraryLogo } from "@/context/library-logo";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";

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
}

/** "Primary, Co-1, Co-2" or "" if no authors */
function allAuthors(b: Pick<Book, "author" | "coAuthors">): string {
  const names: string[] = [];
  if (b.author?.name) names.push(b.author.name);
  for (const ca of b.coAuthors ?? []) {
    if (ca.name && ca.name !== b.author?.name) names.push(ca.name);
  }
  return names.join(", ");
}

const MATERIAL_TYPE_KEYS = ["BOOK","MAGAZINE","JOURNAL","NEWSPAPER","DVD","AUDIO_CD","THESIS","MAP","OTHER"] as const;
const MAT_CLS: Record<string, string> = {
  BOOK:      "bg-blue-50   text-blue-700",
  MAGAZINE:  "bg-pink-50   text-pink-700",
  JOURNAL:   "bg-purple-50 text-purple-700",
  NEWSPAPER: "bg-yellow-50 text-yellow-700",
  DVD:       "bg-red-50    text-red-700",
  AUDIO_CD:  "bg-orange-50 text-orange-700",
  THESIS:    "bg-teal-50   text-teal-700",
  MAP:       "bg-green-50  text-green-700",
  OTHER:     "bg-gray-100  text-gray-600",
};

interface Category { id: string; name: string }

/** Map material type enum value → books.* translation key */
const MAT_KEY: Record<string, string> = {
  BOOK:      "materialBook",
  MAGAZINE:  "materialMagazine",
  JOURNAL:   "materialJournal",
  NEWSPAPER: "materialNewspaper",
  DVD:       "materialDvd",
  AUDIO_CD:  "materialAudioCd",
  THESIS:    "materialThesis",
  MAP:       "materialMap",
  OTHER:     "materialOther",
};

export default function DiscoverPage() {
  const t  = useTranslations("opac");
  const tb = useTranslations("books");
  const tc = useTranslations("common");
  const tr = useTranslations("requests");
  const locale = useLocale();
  const libraryName = useLibraryName();
  const libraryLogo = useLibraryLogo();
  const router = useRouter();
  const { data: session, status } = useSession();

  const [books,          setBooks]          = useState<Book[]>([]);
  const [newArrivals,    setNewArrivals]    = useState<Book[]>([]);
  const [mostBorrowed,   setMostBorrowed]   = useState<Book[]>([]);
  const [categories,     setCategories]     = useState<Category[]>([]);
  const [query,          setQuery]          = useState("");
  const [categoryId,     setCategoryId]     = useState("");
  const [materialType,   setMaterialType]   = useState("");
  const [availableOnly,  setAvailableOnly]  = useState(false);
  const [loading,        setLoading]        = useState(true);
  const [selected,       setSelected]       = useState<Book | null>(null);
  const [availability,   setAvailability]   = useState<{
    totalCopies: number; availableNow: number; borrowed: number;
    inQueue: number; onHoldShelf: number; canReserve: boolean;
    queueFull: boolean; nextPosition: number; queueCapacity: number;
  } | null>(null);
  const [basket,         setBasket]         = useState<Set<string>>(new Set());
  const [reserving,      setReserving]      = useState<string | null>(null);
  const [toast,          setToast]          = useState<string | null>(null);
  const [reqOpen,        setReqOpen]        = useState(false);
  const [reqForm,        setReqForm]        = useState({ title: "", author: "", isbn: "", notes: "" });
  const [reqLoading,     setReqLoading]     = useState(false);

  // Carousel
  const autoplay = useRef(Autoplay({ delay: 4000, stopOnInteraction: false }));
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true }, [autoplay.current]);

  useEffect(() => {
    fetch("/api/categories").then((r) => r.json()).then(setCategories);
    // New arrivals — newest books
    fetch("/api/books?limit=8&sort=newest").then((r) => r.json()).then((data: Book[]) => setNewArrivals(data.slice(0, 8)));
    // Most borrowed — use reports endpoint
    fetch("/api/books?sort=popular&limit=8").then((r) => r.json()).then((data: Book[]) => setMostBorrowed(data.slice(0, 8)));
  }, []);

  // Pre-load basket (existing PENDING reservations) once session is confirmed
  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/reservations?status=PENDING")
      .then((r) => r.ok ? r.json() : [])
      .then((data: { bookId: string }[]) => {
        if (Array.isArray(data)) {
          setBasket(new Set(data.map((r) => r.bookId)));
        }
      })
      .catch(() => {});
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

  /* Fetch live availability whenever the detail modal opens */
  useEffect(() => {
    if (!selected) { setAvailability(null); return; }
    let cancelled = false;
    fetch(`/api/books/${selected.id}/availability`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (!cancelled) setAvailability(data); })
      .catch(() => { if (!cancelled) setAvailability(null); });
    return () => { cancelled = true; };
  }, [selected]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  function openReqModal() {
    if (status === "loading") return;
    if (status !== "authenticated") { router.push(`/${locale}/member/login`); return; }
    setReqOpen(true);
  }

  async function handleBookRequest(e: React.FormEvent) {
    e.preventDefault();
    setReqLoading(true);
    const res = await fetch("/api/book-requests", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(reqForm),
    });
    setReqLoading(false);
    if (res.ok) {
      showToast(tr("successToast"));
      setReqOpen(false);
      setReqForm({ title: "", author: "", isbn: "", notes: "" });
    } else {
      const data = await res.json().catch(() => ({}));
      showToast(data.error ?? tr("errorToast"));
    }
  }

  async function handleReserve(bookId: string) {
    if (status === "loading") return;
    if (status !== "authenticated") {
      router.push(`/${locale}/member/login`);
      return;
    }
    setReserving(bookId);
    const res = await fetch("/api/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId }),
    });
    setReserving(null);

    if (res.ok) {
      setBasket((prev) => new Set([...prev, bookId]));
      const data = await res.json().catch(() => ({}));
      const pos: number | undefined = data?.queuePosition;
      const avail: number | undefined = data?.availableNow;
      if (typeof pos === "number" && pos > 1) {
        showToast(
          typeof avail === "number" && avail > 0
            ? t("reservedQueueAvail", { pos, avail })
            : t("reservedQueue", { pos })
        );
      } else {
        showToast(t("addedToBasket"));
      }
    } else if (res.status === 401) {
      router.push(`/${locale}/member/login`);
    } else if (res.status === 404) {
      showToast(t("noMemberLinked"));
    } else if (res.status === 409) {
      const data = await res.json().catch(() => ({}));
      const errMsg = typeof data.error === "string" ? data.error : "";
      if (errMsg === "Already in basket") {
        // Book already reserved from a previous session — sync the UI button
        setBasket((prev) => new Set([...prev, bookId]));
      } else {
        // Quota exceeded or overdue books blocking the reservation —
        // do NOT add to basket; show the real reason from the server
        showToast(errMsg || t("basketError"));
      }
    } else {
      const data = await res.json().catch(() => ({}));
      showToast(typeof data.error === "string" ? data.error : t("basketError"));
    }
  }

  const heroBooks = newArrivals.length > 0 ? newArrivals : books.slice(0, 6);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-3 bg-gray-900 text-white px-4 py-3 rounded-xl shadow-2xl text-sm">
          <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
          {toast}
          <button onClick={() => setToast(null)}><X className="w-4 h-4 text-white/60 hover:text-white" /></button>
        </div>
      )}

      {/* ── Sticky top nav ──────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-30 bg-[#0f1e4a]/95 backdrop-blur border-b border-white/10">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-4">

          {/* Brand + page tabs */}
          <div className="flex items-center gap-1">
            <Link href={`/${locale}/discover`}
              className="flex items-center gap-2 pr-3 mr-2 border-r border-white/20">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden bg-blue-500/30">
                {libraryLogo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={libraryLogo} alt={libraryName} className="w-full h-full object-contain" />
                ) : (
                  <BookOpen className="w-4 h-4 text-blue-300" />
                )}
              </div>
              <span className="text-sm font-bold text-white hidden sm:block leading-none">{libraryName}</span>
            </Link>

            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-blue-500/25 ring-1 ring-blue-400/30 cursor-default whitespace-nowrap">
              <BookOpen className="w-3.5 h-3.5 text-blue-300" />
              {t("discover")}
            </span>

            <Link href={`/${locale}/ebooks`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white/60 hover:text-white hover:bg-white/10 transition-colors">
              <BookMarked className="w-3.5 h-3.5" />
              <span className="hidden sm:inline whitespace-nowrap">{t("eLibrary")}</span>
            </Link>
          </div>

          {/* User actions */}
          <MemberHeader basketCount={basket.size} theme="dark" />
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <header className="bg-gradient-to-br from-blue-900 via-blue-900 to-indigo-900 text-white px-4 py-5 overflow-hidden relative">

        {/* Subtle dot-grid background */}
        <div className="absolute inset-0 pointer-events-none select-none"
          style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.055) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
        {/* Glow blobs */}
        <div className="absolute -top-10 right-1/3 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-64 h-64 bg-indigo-400/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-0 left-1/2 w-48 h-48 bg-cyan-500/8 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-5xl mx-auto relative">
          <div className="flex items-center gap-6">

            {/* ── Left: title + search ── */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 bg-white/15 rounded-xl flex items-center justify-center flex-shrink-0 shadow-inner">
                  <BookOpen className="w-5 h-5" />
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

            {/* ── Right: discover illustration ── */}
            <div className="hidden lg:block flex-shrink-0 select-none pointer-events-none" aria-hidden>
              <svg width="380" height="160" viewBox="0 0 460 200" fill="none" xmlns="http://www.w3.org/2000/svg">

                {/* ══ BACKGROUND GLOWS ══ */}
                <circle cx="230" cy="140" r="110" fill="white" fillOpacity="0.02"/>
                <circle cx="340" cy="80"  r="55"  fill="#60a5fa" fillOpacity="0.05"/>
                <circle cx="100" cy="110" r="50"  fill="#818cf8" fillOpacity="0.05"/>

                {/* ══ BOOKSHELF (left) ══ */}
                <rect x="20" y="172" width="145" height="5" rx="2" fill="white" fillOpacity="0.22"/>
                {/* Books standing on shelf */}
                <rect x="24"  y="132" width="14" height="40" rx="2" fill="#ef4444" fillOpacity="0.75"/><rect x="24"  y="132" width="4"  height="40" rx="1" fill="#fca5a5" fillOpacity="0.8"/>
                <rect x="40"  y="138" width="12" height="34" rx="2" fill="#3b82f6" fillOpacity="0.75"/><rect x="40"  y="138" width="4"  height="34" rx="1" fill="#93c5fd" fillOpacity="0.8"/>
                <g transform="rotate(-3,60,172)">
                <rect x="54"  y="135" width="13" height="37" rx="2" fill="#10b981" fillOpacity="0.75"/><rect x="54"  y="135" width="4"  height="37" rx="1" fill="#6ee7b7" fillOpacity="0.8"/>
                </g>
                <rect x="69"  y="142" width="11" height="30" rx="2" fill="#f59e0b" fillOpacity="0.75"/><rect x="69"  y="142" width="4"  height="30" rx="1" fill="#fcd34d" fillOpacity="0.8"/>
                <rect x="82"  y="134" width="14" height="38" rx="2" fill="#8b5cf6" fillOpacity="0.75"/><rect x="82"  y="134" width="4"  height="38" rx="1" fill="#c4b5fd" fillOpacity="0.8"/>
                <rect x="98"  y="144" width="10" height="28" rx="2" fill="#ec4899" fillOpacity="0.75"/><rect x="98"  y="144" width="4"  height="28" rx="1" fill="#f9a8d4" fillOpacity="0.8"/>
                <rect x="110" y="137" width="13" height="35" rx="2" fill="#14b8a6" fillOpacity="0.75"/><rect x="110" y="137" width="4"  height="35" rx="1" fill="#5eead4" fillOpacity="0.8"/>
                <rect x="125" y="140" width="12" height="32" rx="2" fill="#f97316" fillOpacity="0.75"/><rect x="125" y="140" width="4"  height="32" rx="1" fill="#fdba74" fillOpacity="0.8"/>
                {/* Shelf bracket */}
                <path d="M 20,172 L 20,180 L 24,180" stroke="white" strokeOpacity="0.15" strokeWidth="1.5" fill="none"/>
                <path d="M 165,172 L 165,180 L 161,180" stroke="white" strokeOpacity="0.15" strokeWidth="1.5" fill="none"/>

                {/* ══ STACKED BOOKS (center base) ══ */}
                <rect x="172" y="183" width="68" height="12" rx="3" fill="#6366f1" fillOpacity="0.85"/><rect x="172" y="183" width="9" height="12" rx="2" fill="#818cf8"/>
                <rect x="177" y="169" width="60" height="12" rx="3" fill="#3b82f6" fillOpacity="0.85"/><rect x="177" y="169" width="9" height="12" rx="2" fill="#60a5fa"/>
                <rect x="182" y="157" width="50" height="10" rx="3" fill="#8b5cf6" fillOpacity="0.85"/><rect x="182" y="157" width="9" height="10" rx="2" fill="#a78bfa"/>

                {/* ══ LARGE MAGNIFYING GLASS (centrepiece) ══ */}
                {/* Shadow/glow */}
                <circle cx="272" cy="105" r="58" fill="white" fillOpacity="0.03"/>
                {/* Glass ring */}
                <circle cx="272" cy="105" r="52" stroke="white" strokeOpacity="0.3" strokeWidth="6" fill="white" fillOpacity="0.06"/>
                <circle cx="272" cy="105" r="46" fill="white" fillOpacity="0.05"/>
                {/* Inner shine */}
                <circle cx="258" cy="91"  r="10" fill="white" fillOpacity="0.06"/>
                {/* Handle */}
                <line x1="312" y1="145" x2="345" y2="178" stroke="white" strokeOpacity="0.35" strokeWidth="9" strokeLinecap="round"/>
                <line x1="312" y1="145" x2="345" y2="178" stroke="white" strokeOpacity="0.12" strokeWidth="14" strokeLinecap="round"/>

                {/* Mini open book inside the glass */}
                <path d="M 247,115 C 245,75 258,58 268,52 L 274,52 L 274,115 Z" fill="white" fillOpacity="0.18" stroke="white" strokeOpacity="0.3" strokeWidth="1"/>
                <path d="M 297,115 C 299,75 286,58 276,52 L 274,52 L 274,115 Z" fill="white" fillOpacity="0.12" stroke="white" strokeOpacity="0.3" strokeWidth="1"/>
                <line x1="274" y1="52" x2="274" y2="115" stroke="white" strokeOpacity="0.4" strokeWidth="1.5" strokeLinecap="round"/>
                {/* Lines on mini book */}
                <line x1="253" y1="70" x2="270" y2="67" stroke="white" strokeOpacity="0.2" strokeWidth="0.8"/>
                <line x1="252" y1="80" x2="270" y2="77" stroke="white" strokeOpacity="0.2" strokeWidth="0.8"/>
                <line x1="251" y1="90" x2="270" y2="87" stroke="white" strokeOpacity="0.15" strokeWidth="0.8"/>
                <line x1="278" y1="67" x2="295" y2="70" stroke="white" strokeOpacity="0.2" strokeWidth="0.8"/>
                <line x1="278" y1="77" x2="296" y2="80" stroke="white" strokeOpacity="0.2" strokeWidth="0.8"/>
                <line x1="278" y1="87" x2="297" y2="90" stroke="white" strokeOpacity="0.15" strokeWidth="0.8"/>

                {/* ══ SEARCH RESULT CARDS (right side) ══ */}
                {/* Card 1 */}
                <g transform="rotate(6, 390, 80)">
                  <rect x="360" y="50" width="78" height="52" rx="5" fill="white" fillOpacity="0.08" stroke="white" strokeOpacity="0.2" strokeWidth="0.8"/>
                  <rect x="367" y="58" width="16" height="16" rx="2" fill="white" fillOpacity="0.1"/>
                  <line x1="388" y1="62" x2="430" y2="62" stroke="white" strokeOpacity="0.2" strokeWidth="1.5"/>
                  <line x1="388" y1="69" x2="426" y2="69" stroke="white" strokeOpacity="0.14" strokeWidth="1"/>
                  <line x1="367" y1="82" x2="430" y2="82" stroke="white" strokeOpacity="0.12" strokeWidth="1"/>
                  <line x1="367" y1="89" x2="420" y2="89" stroke="white" strokeOpacity="0.10" strokeWidth="1"/>
                </g>
                {/* Card 2 */}
                <g transform="rotate(-4, 390, 145)">
                  <rect x="358" y="118" width="78" height="48" rx="5" fill="white" fillOpacity="0.07" stroke="white" strokeOpacity="0.16" strokeWidth="0.8"/>
                  <rect x="365" y="126" width="14" height="14" rx="2" fill="white" fillOpacity="0.09"/>
                  <line x1="384" y1="130" x2="428" y2="130" stroke="white" strokeOpacity="0.17" strokeWidth="1.5"/>
                  <line x1="384" y1="137" x2="424" y2="137" stroke="white" strokeOpacity="0.12" strokeWidth="1"/>
                  <line x1="365" y1="148" x2="428" y2="148" stroke="white" strokeOpacity="0.10" strokeWidth="1"/>
                  <line x1="365" y1="155" x2="416" y2="155" stroke="white" strokeOpacity="0.08" strokeWidth="1"/>
                </g>
                {/* Card 3 — partially behind */}
                <rect x="352" y="168" width="76" height="24" rx="5" fill="white" fillOpacity="0.05" stroke="white" strokeOpacity="0.12" strokeWidth="0.8"/>
                <line x1="360" y1="178" x2="420" y2="178" stroke="white" strokeOpacity="0.09" strokeWidth="1"/>

                {/* ══ READING LAMP (far left) ══ */}
                <line x1="8" y1="185" x2="8" y2="90" stroke="white" strokeOpacity="0.25" strokeWidth="2" strokeLinecap="round"/>
                <line x1="8" y1="90" x2="26" y2="78" stroke="white" strokeOpacity="0.25" strokeWidth="1.8" strokeLinecap="round"/>
                <path d="M 14,78 L 38,78 L 33,95 L 19,95 Z" fill="#fcd34d" fillOpacity="0.28" stroke="#fcd34d" strokeOpacity="0.4" strokeWidth="1"/>
                <ellipse cx="26" cy="97" rx="12" ry="4" fill="#fcd34d" fillOpacity="0.12"/>
                <ellipse cx="8"  cy="187" rx="10" ry="3" fill="white" fillOpacity="0.13" stroke="white" strokeOpacity="0.18" strokeWidth="1"/>

                {/* ══ FLOATING BOOKMARK ══ */}
                <g>
                  <path d="M 150,16 L 164,16 L 164,52 L 157,44 L 150,52 Z" fill="#f59e0b" fillOpacity="0.75" stroke="#fcd34d" strokeOpacity="0.5" strokeWidth="1"/>
                  <line x1="155" y1="24" x2="160" y2="24" stroke="white" strokeOpacity="0.3" strokeWidth="0.8"/>
                  <line x1="154" y1="30" x2="161" y2="30" stroke="white" strokeOpacity="0.2" strokeWidth="0.8"/>
                  <animateTransform attributeName="transform" type="translate" values="0,0; 0,-6; 0,0" dur="2.6s" repeatCount="indefinite" calcMode="ease-in-out"/>
                </g>

                {/* ══ STAR RATINGS (top right) ══ */}
                <g opacity="0.6">
                  <path d="M 376,22 L 378,16 L 380,22 L 386,23.5 L 380,25 L 378,31 L 376,25 L 370,23.5 Z" fill="#fcd34d" fillOpacity="0.9"/>
                  <path d="M 390,22 L 392,16 L 394,22 L 400,23.5 L 394,25 L 392,31 L 390,25 L 384,23.5 Z" fill="#fcd34d" fillOpacity="0.9"/>
                  <path d="M 404,22 L 406,16 L 408,22 L 414,23.5 L 408,25 L 406,31 L 404,25 L 398,23.5 Z" fill="#fcd34d" fillOpacity="0.9"/>
                  <path d="M 418,22 L 420,16 L 422,22 L 428,23.5 L 422,25 L 420,31 L 418,25 L 412,23.5 Z" fill="#fcd34d" fillOpacity="0.9"/>
                  <path d="M 432,22 L 434,16 L 436,22 L 442,23.5 L 436,25 L 434,31 L 432,25 L 426,23.5 Z" fill="#fcd34d" fillOpacity="0.4"/>
                </g>

                {/* ══ FLOATING PAPERS ══ */}
                <g transform="rotate(12,348,32)">
                  <rect x="336" y="18" width="24" height="28" rx="2" fill="white" fillOpacity="0.08" stroke="white" strokeOpacity="0.16" strokeWidth="0.8"/>
                  <line x1="340" y1="26" x2="356" y2="26" stroke="white" strokeOpacity="0.13" strokeWidth="0.8"/>
                  <line x1="340" y1="32" x2="356" y2="32" stroke="white" strokeOpacity="0.13" strokeWidth="0.8"/>
                  <line x1="340" y1="38" x2="352" y2="38" stroke="white" strokeOpacity="0.09" strokeWidth="0.8"/>
                </g>
                <g transform="rotate(-8, 192, 24)">
                  <rect x="181" y="12" width="20" height="24" rx="2" fill="white" fillOpacity="0.06" stroke="white" strokeOpacity="0.13" strokeWidth="0.8"/>
                  <line x1="185" y1="20" x2="197" y2="20" stroke="white" strokeOpacity="0.11" strokeWidth="0.8"/>
                  <line x1="185" y1="26" x2="197" y2="26" stroke="white" strokeOpacity="0.11" strokeWidth="0.8"/>
                </g>

                {/* ══ SPARKLE STARS ══ */}
                <path d="M 46,22 L 48.5,13 L 51,22 L 60,24.5 L 51,27 L 48.5,36 L 46,27 L 37,24.5 Z" fill="#fcd34d" fillOpacity="0.65">
                  <animate attributeName="opacity" values="0.65;1;0.65" dur="2.1s" repeatCount="indefinite"/>
                </path>
                <path d="M 220,18 L 222,12 L 224,18 L 230,19.5 L 224,21 L 222,27 L 220,21 L 214,19.5 Z" fill="white" fillOpacity="0.5">
                  <animate attributeName="opacity" values="0.5;0.9;0.5" dur="1.8s" repeatCount="indefinite" begin="0.4s"/>
                </path>
                <path d="M 312,158 L 313.5,152 L 315,158 L 321,159.5 L 315,161 L 313.5,167 L 312,161 L 306,159.5 Z" fill="#5eead4" fillOpacity="0.5">
                  <animate attributeName="opacity" values="0.5;0.85;0.5" dur="2.5s" repeatCount="indefinite" begin="0.9s"/>
                </path>
                <path d="M 444,82 L 445.5,76 L 447,82 L 453,83.5 L 447,85 L 445.5,91 L 444,85 L 438,83.5 Z" fill="#c4b5fd" fillOpacity="0.55">
                  <animate attributeName="opacity" values="0.55;0.9;0.55" dur="2.9s" repeatCount="indefinite" begin="1.3s"/>
                </path>
                <path d="M 116,14 L 117,9 L 118,14 L 123,15 L 118,16 L 117,21 L 116,16 L 111,15 Z" fill="#fb7185" fillOpacity="0.5">
                  <animate attributeName="opacity" values="0.5;0.85;0.5" dur="3s" repeatCount="indefinite" begin="1.6s"/>
                </path>

                {/* ══ FLOATING DOTS ══ */}
                <circle cx="10"  cy="50"  r="2"   fill="#818cf8" fillOpacity="0.5"/>
                <circle cx="170" cy="195" r="2"   fill="white"   fillOpacity="0.3"/>
                <circle cx="340" cy="195" r="2"   fill="#c4b5fd" fillOpacity="0.4"/>
                <circle cx="450" cy="110" r="1.5" fill="white"   fillOpacity="0.4"/>
                <circle cx="240" cy="30"  r="1.5" fill="#fcd34d" fillOpacity="0.4"/>
                <circle cx="458" cy="50"  r="1"   fill="white"   fillOpacity="0.35"/>
                <circle cx="20"  cy="155" r="1.5" fill="#a5b4fc" fillOpacity="0.4"/>
              </svg>
            </div>

          </div>
        </div>
      </header>

      {/* Hero Carousel — New Arrivals */}
      {heroBooks.length > 0 && !query && !categoryId && (
        <section className="max-w-5xl mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
              {t("newArrivals")}
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
              {heroBooks.map((book) => (
                <div key={book.id} className="flex-[0_0_260px] min-w-0">
                  <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden h-full">
                    <div className="h-32 bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center">
                      {book.coverImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={book.coverImage} alt={book.title} className="h-full w-full object-cover" />
                      ) : (
                        <BookOpen className="w-10 h-10 text-blue-300" />
                      )}
                    </div>
                    <div className="p-3">
                      <h3 className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2 mb-1">{book.title}</h3>
                      {allAuthors(book) && <p className="text-xs text-gray-500 mb-2 line-clamp-1">{allAuthors(book)}</p>}
                      <div className="flex items-center justify-between">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${book.availableCopies > 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                          {book.availableCopies > 0 ? t("available") : t("borrowed")}
                        </span>
                        <button onClick={() => setSelected(book)}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors">
                          {t("details")}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Most Borrowed section */}
      {mostBorrowed.length > 0 && !query && !categoryId && (
        <section className="max-w-5xl mx-auto px-4 pb-4">
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-blue-600" />
            {t("mostBorrowed")}
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            {mostBorrowed.map((book) => (
              <button key={book.id} onClick={() => setSelected(book)}
                className="flex-shrink-0 w-40 bg-white rounded-xl border border-gray-100 shadow-sm p-3 text-left hover:shadow-md transition-shadow">
                <div className="h-20 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg flex items-center justify-center mb-2">
                  <BookOpen className="w-7 h-7 text-indigo-300" />
                </div>
                <p className="text-xs font-semibold text-gray-900 line-clamp-2 leading-snug">{book.title}</p>
                <p className="text-xs text-gray-400 mt-0.5 truncate">{allAuthors(book)}</p>
              </button>
            ))}
          </div>
        </section>
      )}

      <main className="max-w-5xl mx-auto px-4 py-6 min-h-[60vh]">
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">{t("allCategories")}</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <select value={materialType} onChange={(e) => setMaterialType(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
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

          <span className="ml-auto text-sm text-gray-500">{books.length} {t("allBooks").toLowerCase()}</span>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 animate-pulse">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="h-4 bg-gray-200 rounded w-3/4" />
                  <div className="h-5 bg-gray-100 rounded-full w-10 flex-shrink-0" />
                </div>
                <div className="h-3 bg-gray-100 rounded w-1/2 mb-1" />
                <div className="h-3 bg-gray-100 rounded w-1/3 mb-4" />
                <div className="flex gap-2 mt-3">
                  <div className="h-8 bg-gray-100 rounded-lg flex-1" />
                  <div className="h-8 bg-gray-200 rounded-lg flex-1" />
                </div>
              </div>
            ))}
          </div>
        ) : books.length === 0 ? (
          <div className="text-center py-16">
            <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400">{t("noResults")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {books.map((book) => (
              <div key={book.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 hover:shadow-md hover:border-blue-200 transition-all">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <h3 className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2 cursor-pointer"
                    onClick={() => setSelected(book)}>{book.title}</h3>
                  <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${book.availableCopies > 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                    {book.availableCopies > 0 ? t("availability") + " ✓" : "✗"}
                  </span>
                </div>
                {allAuthors(book) && <p className="text-xs text-gray-500 mb-1 line-clamp-1">{allAuthors(book)}</p>}
                <div className="flex items-center gap-1.5 flex-wrap mb-2">
                  {book.category && <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{book.category.name}</span>}
                  {book.materialType && book.materialType !== "BOOK" && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${MAT_CLS[book.materialType] ?? "bg-gray-100 text-gray-600"}`}>
                      {tb((MAT_KEY[book.materialType] ?? "materialOther") as Parameters<typeof tb>[0])}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mb-3">{book.availableCopies}/{book.totalCopies} {t("copies").toLowerCase()}</p>
                <div className="flex gap-2">
                  <button onClick={() => setSelected(book)}
                    className="flex-1 text-xs py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
                    {tc("view")}
                  </button>
                  <button onClick={() => handleReserve(book.id)} disabled={status === "loading" || reserving === book.id || basket.has(book.id)}
                    className={`flex-1 flex items-center justify-center gap-1 text-xs py-1.5 rounded-lg font-medium transition-colors ${
                      basket.has(book.id)
                        ? "bg-green-100 text-green-700"
                        : "bg-blue-900 text-white hover:bg-blue-800"
                    } disabled:opacity-60`}>
                    {basket.has(book.id) ? (
                      <><CheckCircle className="w-3.5 h-3.5" /> {t("alreadyInBasket")}</>
                    ) : reserving === book.id ? "…" : (
                      <><ShoppingCart className="w-3.5 h-3.5" /> {t("reserve")}</>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      {/* ── Request a Book CTA ── */}
      <div className="max-w-7xl mx-auto px-4 pb-10 mt-2">
        <div className="bg-gradient-to-r from-blue-900 to-indigo-800 rounded-2xl p-6 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-white font-semibold text-lg">{t("ctaTitle")}</h3>
            <p className="text-blue-200 text-sm mt-0.5">{t("ctaSubtitle")}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={openReqModal}
              className="flex items-center gap-2 bg-white text-blue-900 px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-50 transition-colors"
            >
              <PlusCircle className="w-4 h-4" />
              {t("requestABook")}
            </button>
            <Link
              href={`/${locale}/requests`}
              className="flex items-center gap-2 bg-white/15 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-white/25 transition-colors"
            >
              {t("myRequests")}
            </Link>
          </div>
        </div>
      </div>

      </main>

      {/* Book detail modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div className="pr-4">
                <h2 className="text-lg font-bold text-gray-900 leading-tight">
                  {selected.title}
                  {selected.subtitle && <span className="block text-sm text-gray-500 font-normal mt-0.5">{selected.subtitle}</span>}
                </h2>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {selected.materialType && selected.materialType !== "BOOK" && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${MAT_CLS[selected.materialType] ?? "bg-gray-100 text-gray-600"}`}>
                      {tb((MAT_KEY[selected.materialType] ?? "materialOther") as Parameters<typeof tb>[0])}
                    </span>
                  )}
                  {selected.edition && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-semibold uppercase tracking-wide">
                      {selected.edition} {t("editionSuffix")}
                    </span>
                  )}
                  {selected.referenceOnly && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-bold uppercase tracking-wide">
                      {t("referenceOnlyBadge")}
                    </span>
                  )}
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 flex-shrink-0">✕</button>
            </div>
            <div className="space-y-2 text-sm">
              {allAuthors(selected) && <div className="flex gap-2"><span className="text-gray-400 w-24 flex-shrink-0">{t("author")}</span><span className="text-gray-700">{allAuthors(selected)}</span></div>}
              {selected.isbn && <div className="flex gap-2"><span className="text-gray-400 w-24 flex-shrink-0">{t("isbn")}</span><span className="text-gray-700 font-mono">{selected.isbn}</span></div>}
              {selected.category && <div className="flex gap-2"><span className="text-gray-400 w-24 flex-shrink-0">{t("category")}</span><span className="text-gray-700">{selected.category.name}</span></div>}
              {selected.publishYear && <div className="flex gap-2"><span className="text-gray-400 w-24 flex-shrink-0">{t("year")}</span><span className="text-gray-700">{selected.publishYear}</span></div>}
              {selected.pages && <div className="flex gap-2"><span className="text-gray-400 w-24 flex-shrink-0">{t("pages")}</span><span className="text-gray-700">{selected.pages}</span></div>}
              <div className="flex gap-2">
                <span className="text-gray-400 w-24 flex-shrink-0">{t("copies")}</span>
                <span className={`font-semibold ${selected.availableCopies > 0 ? "text-green-600" : "text-red-500"}`}>
                  {selected.availableCopies}/{selected.totalCopies}
                </span>
              </div>
            </div>
            {selected.description && <p className="mt-4 text-sm text-gray-600 leading-relaxed">{selected.description}</p>}

            {/* Reference-only banner takes priority */}
            {selected.referenceOnly ? (
              <div className="mt-4 rounded-xl px-4 py-3 text-xs border bg-amber-50 border-amber-200 text-amber-800">
                <p className="font-semibold">📖 {t("inLibraryUseOnly")}</p>
                <p className="text-[11px] mt-1 opacity-80">{t("referenceOnlyDesc")}</p>
              </div>
            ) : availability && (
              <div className={`mt-4 rounded-xl px-4 py-3 text-xs border ${
                availability.availableNow > 0
                  ? "bg-green-50 border-green-200 text-green-800"
                  : availability.queueFull
                    ? "bg-red-50 border-red-200 text-red-700"
                    : "bg-amber-50 border-amber-200 text-amber-800"
              }`}>
                {availability.availableNow > 0 ? (
                  <p className="font-semibold">
                    ✓ {t("availableNowMsg", { count: availability.availableNow })}
                  </p>
                ) : availability.queueFull ? (
                  <p className="font-semibold">
                    ✕ {t("queueFullMsg", { waiting: availability.inQueue + availability.onHoldShelf, max: availability.queueCapacity })}
                  </p>
                ) : (
                  <p className="font-semibold">
                    {t("allCopiesOut", { pos: availability.nextPosition, ahead: availability.inQueue + availability.onHoldShelf })}
                  </p>
                )}
                <p className="text-[11px] mt-1 opacity-80">
                  {t("availabilityStats", { total: availability.totalCopies, borrowed: availability.borrowed ?? 0, onHoldShelf: availability.onHoldShelf, inQueue: availability.inQueue })}
                </p>
              </div>
            )}

            <button onClick={() => { handleReserve(selected.id); setSelected(null); }}
              disabled={
                basket.has(selected.id) ||
                !!selected.referenceOnly ||
                (availability?.queueFull && availability.availableNow === 0)
              }
              className={`mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                basket.has(selected.id)
                  ? "bg-green-100 text-green-700"
                  : selected.referenceOnly
                    ? "bg-amber-100 text-amber-700 cursor-not-allowed"
                    : availability?.queueFull && availability.availableNow === 0
                      ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                      : "bg-blue-900 text-white hover:bg-blue-800"
              }`}>
              {basket.has(selected.id)
                ? <><CheckCircle className="w-4 h-4" /> {t("alreadyInBasketBtn")}</>
                : selected.referenceOnly
                  ? <>📖 {t("referenceOnlyBtn")}</>
                  : availability?.queueFull && availability.availableNow === 0
                    ? <>{t("queueFullBtn")}</>
                    : <><ShoppingCart className="w-4 h-4" /> {t("reserve")}</>}
            </button>
          </div>
        </div>
      )}

      {/* ── Book Request modal ── */}
      {reqOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setReqOpen(false)}>
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">{tr("requestBook")}</h2>
              <button onClick={() => setReqOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleBookRequest} className="space-y-4">
              <div>
                <label htmlFor="req-title" className="block text-sm font-medium text-gray-700 mb-1">{tr("bookTitleRequired")}</label>
                <input
                  id="req-title"
                  type="text" required
                  value={reqForm.title}
                  onChange={(e) => setReqForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder={tr("bookTitlePlaceholder")}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor="req-author" className="block text-sm font-medium text-gray-700 mb-1">{tr("author")}</label>
                <input
                  id="req-author"
                  type="text"
                  value={reqForm.author}
                  onChange={(e) => setReqForm((f) => ({ ...f, author: e.target.value }))}
                  placeholder={tr("authorPlaceholder")}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor="req-isbn" className="block text-sm font-medium text-gray-700 mb-1">{t("isbn")}</label>
                <input
                  id="req-isbn"
                  type="text"
                  value={reqForm.isbn}
                  onChange={(e) => setReqForm((f) => ({ ...f, isbn: e.target.value }))}
                  placeholder={tr("isbnPlaceholder")}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor="req-notes" className="block text-sm font-medium text-gray-700 mb-1">{tr("notes")}</label>
                <textarea
                  id="req-notes"
                  rows={3}
                  value={reqForm.notes}
                  onChange={(e) => setReqForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder={tr("notesPlaceholder")}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              <button
                type="submit" disabled={reqLoading}
                className="w-full flex items-center justify-center gap-2 bg-blue-900 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-blue-800 transition-colors disabled:opacity-60"
              >
                <Send className="w-4 h-4" />
                {reqLoading ? tr("submitting") : tr("submitBtn")}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
