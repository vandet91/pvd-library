"use client";

import { useState, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import { ShoppingCart, BookOpen, Trash2, CheckCircle, Clock, BookMarked, Package, MapPin } from "lucide-react";
import MemberHeader from "@/components/shared/MemberHeader";
import { useLibraryName } from "@/context/library-name";

interface Reservation {
  id: string;
  status: string;
  createdAt: string;
  expiresAt: string | null;
  holdShelf?: string | null;
  book: {
    id: string; title: string; isbn: string | null; availableCopies: number;
    materialType?: string | null; author?: { name: string } | null; coverImage?: string | null;
  };
}

const STATUS_STYLE: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
  PENDING:   { label: "Pending",          icon: <Clock className="w-3.5 h-3.5" />,       cls: "bg-yellow-50 text-yellow-700" },
  APPROVED:  { label: "Approved",         icon: <CheckCircle className="w-3.5 h-3.5" />, cls: "bg-green-50 text-green-700"  },
  READY:     { label: "Ready for Pickup", icon: <CheckCircle className="w-3.5 h-3.5" />, cls: "bg-purple-50 text-purple-700" },
  CANCELLED: { label: "Cancelled",        icon: <Trash2 className="w-3.5 h-3.5" />,      cls: "bg-gray-100 text-gray-500"   },
  FULFILLED: { label: "Fulfilled",        icon: <CheckCircle className="w-3.5 h-3.5" />, cls: "bg-blue-50 text-blue-700"    },
  EXPIRED:   { label: "Expired",          icon: <Clock className="w-3.5 h-3.5" />,       cls: "bg-red-50 text-red-500"      },
};

export default function BasketPage() {
  const t  = useTranslations("opac");
  const tc = useTranslations("common");
  const locale = useLocale();
  const libraryName = useLibraryName();

  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/reservations")
      .then(async (r) => {
        if (r.status === 401) { setError("Please log in to view your basket"); setLoading(false); return; }
        if (r.status === 404) { setError("No member account linked to your user"); setLoading(false); return; }
        if (!r.ok) { setError("Failed to load reservations"); setLoading(false); return; }
        const data = await r.json().catch(() => []);
        setReservations(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => { setError("Failed to connect to server"); setLoading(false); });
  }, []);

  async function handleCancel(id: string) {
    if (!confirm("Remove this reservation?")) return;
    const res = await fetch(`/api/reservations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "CANCELLED" }),
    });
    if (res.ok) {
      setReservations((prev) => prev.filter((r) => r.id !== id));
    }
  }

  const active  = reservations.filter((r) => ["PENDING", "APPROVED", "READY"].includes(r.status));
  const history = reservations.filter((r) => ["CANCELLED", "FULFILLED", "EXPIRED"].includes(r.status));

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Sticky top nav ── */}
      <nav className="sticky top-0 z-30 bg-[#0f1e4a]/95 backdrop-blur border-b border-white/10">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-1">
            <Link href={`/${locale}/discover`} className="flex items-center gap-2 pr-3 mr-2 border-r border-white/20">
              <div className="w-7 h-7 bg-blue-500/30 rounded-lg flex items-center justify-center flex-shrink-0">
                <BookOpen className="w-4 h-4 text-blue-300" />
              </div>
              <span className="text-sm font-bold text-white hidden sm:block leading-none">{libraryName}</span>
            </Link>
            <Link href={`/${locale}/discover`} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white/60 hover:text-white hover:bg-white/10 transition-colors">
              <BookOpen className="w-3.5 h-3.5" /><span className="hidden sm:inline">{t("discover")}</span>
            </Link>
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-blue-500/25 ring-1 ring-blue-400/30 cursor-default">
              <ShoppingCart className="w-3.5 h-3.5 text-blue-300" /><span className="hidden sm:inline">{t("basket")}</span>
            </span>
            <Link href={`/${locale}/ebooks`} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white/60 hover:text-white hover:bg-white/10 transition-colors">
              <BookMarked className="w-3.5 h-3.5" /><span className="hidden sm:inline">{t("eLibrary")}</span>
            </Link>
          </div>
          <MemberHeader theme="dark" />
        </div>
      </nav>

      {/* ── Page header ── */}
      <header className="bg-gradient-to-br from-blue-900 via-blue-900 to-indigo-900 text-white px-4 py-4">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/15 rounded-xl flex items-center justify-center flex-shrink-0">
              <ShoppingCart className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">{t("basket")}</h1>
              <p className="text-white/60 text-sm">{t("basketSubtitle")}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        {loading ? (
          <div className="text-center text-gray-400 py-16">{tc("loading")}</div>
        ) : error ? (
          <div className="text-center py-16">
            <ShoppingCart className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 mb-4">{error}</p>
            <Link href={`/${locale}/member/login`}
              className="inline-flex items-center gap-2 bg-blue-900 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-800 transition-colors">
              Log In
            </Link>
          </div>
        ) : active.length === 0 && history.length === 0 ? (
          <div className="text-center py-16">
            <ShoppingCart className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 mb-2">{t("emptyBasket")}</p>
            <Link href={`/${locale}/discover`}
              className="inline-flex items-center gap-2 bg-blue-900 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-800 transition-colors">
              <BookOpen className="w-4 h-4" /> Browse Books
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Active reservations */}
            {active.length > 0 && (
              <div>
                <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-yellow-500" />
                  Active Reservations
                  <span className="ml-auto text-sm text-gray-400 font-normal">{active.length} book(s)</span>
                </h2>
                <div className="space-y-3">
                  {active.map((r) => {
                    const s = STATUS_STYLE[r.status];
                    return (
                      <div key={r.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-4">
                        <div className="w-12 h-16 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg flex items-center justify-center flex-shrink-0">
                          {r.book.coverImage
                            ? <img src={r.book.coverImage} alt={r.book.title} className="h-full w-full object-cover rounded-lg" /> // eslint-disable-line @next/next/no-img-element
                            : <BookOpen className="w-6 h-6 text-blue-300" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="font-semibold text-gray-900 text-sm truncate">{r.book.title}</p>
                            {r.book.materialType && r.book.materialType !== "BOOK" && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-semibold uppercase tracking-wide flex-shrink-0">
                                {r.book.materialType.replace("_", " ")}
                              </span>
                            )}
                          </div>
                          {r.book.author && <p className="text-xs text-gray-500">{r.book.author.name}</p>}
                          <div className="flex items-center gap-2 flex-wrap mt-1">
                            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${s.cls}`}>
                              {s.icon} {s.label}
                            </span>
                            {r.expiresAt && r.status === "PENDING" && (() => {
                              const daysLeft = Math.ceil((new Date(r.expiresAt).getTime() - Date.now()) / 86400000);
                              return daysLeft > 0
                                ? <span className={`text-xs ${daysLeft <= 2 ? "text-red-500" : "text-gray-400"}`}>
                                    Expires in {daysLeft}d
                                  </span>
                                : null;
                            })()}
                          </div>
                          {/* Hold shelf callout — shown when READY */}
                          {r.status === "READY" && r.holdShelf && (
                            <div className="mt-2 flex items-center gap-1.5 bg-purple-50 border border-purple-200 text-purple-700 text-xs px-2.5 py-1.5 rounded-lg font-medium w-fit">
                              <Package className="w-3.5 h-3.5 flex-shrink-0" />
                              Come pick it up at: <span className="font-bold ml-1">{r.holdShelf}</span>
                            </div>
                          )}
                          {r.status === "APPROVED" && (
                            <p className="mt-1.5 text-xs text-green-600 flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              Approved — librarian will pull it from the shelf soon
                            </p>
                          )}
                        </div>
                        {r.status === "PENDING" && (
                          <button onClick={() => handleCancel(r.id)}
                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-400 mt-3 text-center">
                  Librarians will process your reservation. You&apos;ll be notified when it&apos;s ready.
                </p>
              </div>
            )}

            {/* History */}
            {history.length > 0 && (
              <div>
                <h2 className="font-semibold text-gray-700 mb-3 text-sm">History</h2>
                <div className="space-y-2">
                  {history.map((r) => {
                    const s = STATUS_STYLE[r.status];
                    return (
                      <div key={r.id} className="bg-white/60 rounded-xl border border-gray-100 p-4 flex items-center gap-4 opacity-70">
                        <div className="w-10 h-14 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <BookOpen className="w-5 h-5 text-gray-300" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-600 text-sm truncate">{r.book.title}</p>
                          <span className={`mt-0.5 inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${s.cls}`}>
                            {s.icon} {s.label}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <Link href={`/${locale}/discover`}
              className="flex items-center justify-center gap-2 w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-blue-200 hover:text-blue-600 transition-colors">
              <BookOpen className="w-4 h-4" /> Add more books
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
