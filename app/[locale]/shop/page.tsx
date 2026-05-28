"use client";

import { useEffect, useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useLocale } from "next-intl";
import Image from "next/image";
import {
  ShoppingCart, BookOpen, Search, Tag, Check,
  AlertCircle, ShoppingBag, Loader2, ChevronDown,
} from "lucide-react";
import MemberHeader from "@/components/shared/MemberHeader";
import { useLibraryName } from "@/context/library-name";

/* ── Types ─────────────────────────────────────────────────────────────────── */

interface CopyItem {
  copyId:     string;
  copyNumber: number;
  condition:  string;
  price:      number | null;
  barcode:    string | null;
}

interface ForSaleBook {
  id:         string;          // book ID
  title:      string;
  isbn:       string | null;
  coverImage: string | null;
  author:     { name: string } | null;
  category:   { name: string } | null;
  copies:     CopyItem[];
  lowestPrice: number | null;  // for display / sorting
}

const CONDITION_COLOR: Record<string, string> = {
  EXCELLENT: "text-emerald-600 bg-emerald-50",
  GOOD:      "text-green-600 bg-green-50",
  FAIR:      "text-amber-600 bg-amber-50",
  POOR:      "text-orange-600 bg-orange-50",
  DAMAGED:   "text-red-600 bg-red-50",
};

const CONDITION_ORDER: Record<string, number> = {
  EXCELLENT: 0, GOOD: 1, FAIR: 2, POOR: 3, DAMAGED: 4,
};

/* ── Raw API copy type (before grouping) ───────────────────────────────────── */
interface RawCopy {
  id: string; copyId: string; copyNumber: number; barcode: string | null;
  condition: string; price: number | null;
  title: string; isbn: string | null; coverImage: string | null;
  author: { name: string } | null; category: { name: string } | null;
}

/* ── Group flat copy list into one card per book ───────────────────────────── */
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
  // Sort copies within each book: best condition first
  for (const book of map.values()) {
    book.copies.sort((a, b) =>
      (CONDITION_ORDER[a.condition] ?? 9) - (CONDITION_ORDER[b.condition] ?? 9),
    );
  }
  return Array.from(map.values());
}

/* ── Main Component ─────────────────────────────────────────────────────────── */

export default function ShopPage() {
  const { data: session } = useSession();
  const locale            = useLocale();
  const libraryName       = useLibraryName();

  const [rawBooks,   setRawBooks]   = useState<RawCopy[]>([]);
  const [query,      setQuery]      = useState("");
  const [loading,    setLoading]    = useState(true);
  const [cartIds,    setCartIds]    = useState<Set<string>>(new Set());
  const [adding,     setAdding]     = useState<string | null>(null);
  const [enabled,    setEnabled]    = useState(true);
  const [currency,   setCurrency]   = useState("USD");
  const [cartCount,  setCartCount]  = useState(0);
  // selectedCopy: bookId → copyId the user has picked
  const [selectedCopy, setSelectedCopy] = useState<Record<string, string>>({});

  // Load FOR_SALE books + current cart
  useEffect(() => {
    async function load() {
      setLoading(true);
      const [booksRes, settingsRes] = await Promise.all([
        fetch("/api/shop/books"),
        fetch("/api/settings"),
      ]);
      const settings = await settingsRes.json();
      if (settings.BOOK_SALE_ENABLED !== "true") { setEnabled(false); setLoading(false); return; }
      setCurrency(settings.STOCK_CURRENCY ?? "USD");

      const data = await booksRes.json();
      setRawBooks(Array.isArray(data) ? data : []);

      if (session) {
        const cartRes  = await fetch("/api/sale/cart");
        const cartData = await cartRes.json();
        const ids = new Set<string>((cartData.items ?? []).map((i: { copyId: string }) => i.copyId));
        setCartIds(ids);
        setCartCount(ids.size);
      }
      setLoading(false);
    }
    load();
  }, [session]);

  // Group + filter
  const books = useMemo(() => groupBooks(rawBooks), [rawBooks]);

  const filtered = useMemo(() => {
    if (!query) return books;
    const q = query.toLowerCase();
    return books.filter((b) =>
      b.title.toLowerCase().includes(q) ||
      b.author?.name?.toLowerCase().includes(q) ||
      b.isbn?.includes(q),
    );
  }, [books, query]);

  // Get the currently-selected copy for a book (default: best condition)
  function getSelectedCopy(book: ForSaleBook): CopyItem {
    const override = selectedCopy[book.id];
    return book.copies.find((c) => c.copyId === override) ?? book.copies[0];
  }

  async function addToCart(copyId: string) {
    if (!session) return;
    setAdding(copyId);
    const res = await fetch("/api/sale/cart/items", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ copyId }),
    });
    if (res.ok) {
      setCartIds((prev) => new Set([...prev, copyId]));
      setCartCount((c) => c + 1);
    }
    setAdding(null);
  }

  async function removeFromCart(copyId: string) {
    if (!session) return;
    setAdding(copyId);
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
    price != null ? `${currency === "USD" ? "$" : currency + " "}${price.toFixed(2)}` : null;

  // ── Not enabled ──────────────────────────────────────────────────────────
  if (!loading && !enabled) {
    return (
      <div className="min-h-screen bg-gray-50">
        <nav className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
          <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
            <span className="font-bold text-gray-900">{libraryName}</span>
            <MemberHeader theme="light" basketCount={cartCount} />
          </div>
        </nav>
        <div className="max-w-md mx-auto mt-24 text-center px-4">
          <ShoppingBag className="w-14 h-14 text-gray-300 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-700 mb-2">Book Shop is not available</h1>
          <p className="text-sm text-gray-500">The library has not enabled the book sale feature yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Nav ─────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href={`/${locale}/discover`} className="font-bold text-gray-900">{libraryName}</Link>
            <Link href={`/${locale}/discover`} className="text-sm text-gray-500 hover:text-gray-900 transition-colors">Discover</Link>
            <span className="text-sm font-medium text-violet-700 border-b-2 border-violet-600 pb-0.5">Shop</span>
          </div>
          <div className="flex items-center gap-2">
            {session && (
              <Link
                href={`/${locale}/shop/cart`}
                className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-violet-700 hover:bg-violet-50 transition-colors"
              >
                <ShoppingCart className="w-4 h-4" />
                Cart
                {cartCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-violet-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                    {cartCount}
                  </span>
                )}
              </Link>
            )}
            <MemberHeader theme="light" basketCount={0} />
          </div>
        </div>
      </nav>

      {/* ── Hero search ──────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-violet-700 to-purple-800 py-10 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="text-2xl font-bold text-white mb-1">Books for Sale</h1>
          <p className="text-violet-200 text-sm mb-6">Own a book from our collection</p>
          <div className="flex bg-white rounded-xl overflow-hidden shadow-lg">
            <div className="relative flex-1 flex items-center">
              <Search className="absolute left-4 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by title, author or ISBN…"
                className="w-full pl-11 pr-4 py-3 text-gray-900 text-sm focus:outline-none bg-transparent"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-24 gap-2 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" /> Loading books…
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24">
            <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No books for sale right now</p>
            <p className="text-sm text-gray-400 mt-1">Check back later for new listings</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-4">
              {filtered.length} title{filtered.length !== 1 ? "s" : ""} available
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {filtered.map((book) => {
                const sel        = getSelectedCopy(book);
                const inCart     = cartIds.has(sel.copyId);
                const busy       = adding === sel.copyId;
                const condColor  = CONDITION_COLOR[sel.condition] ?? "text-gray-600 bg-gray-50";
                const hasMultiple = book.copies.length > 1;

                return (
                  <div key={book.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow flex flex-col">
                    {/* Cover — portrait ratio, same as rest of the app */}
                    <div className="relative aspect-[2/3] bg-gradient-to-br from-violet-50 to-purple-100 flex items-center justify-center overflow-hidden">
                      {book.coverImage ? (
                        <Image src={book.coverImage} alt={book.title} fill className="object-contain" />
                      ) : (
                        <BookOpen className="w-10 h-10 text-violet-300" />
                      )}
                      {/* Condition badge */}
                      <span className={`absolute top-2 right-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${condColor}`}>
                        {sel.condition}
                      </span>
                      {/* Available count badge — always shown */}
                      <span className="absolute top-2 left-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-600 text-white">
                        {book.copies.length} {book.copies.length === 1 ? "copy" : "copies"}
                      </span>
                    </div>

                    {/* Info */}
                    <div className="p-3 flex flex-col flex-1">
                      <p className="font-semibold text-gray-900 text-xs leading-snug line-clamp-2 mb-0.5">
                        {book.title}
                      </p>
                      <p className="text-[11px] text-gray-400 mb-2 truncate">
                        {book.author?.name ?? "Unknown author"}
                      </p>

                      {book.category && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-violet-700 bg-violet-50 px-1.5 py-0.5 rounded-full mb-2 w-fit">
                          <Tag className="w-2 h-2" />{book.category.name}
                        </span>
                      )}

                      {/* Copy selector — shown when there are multiple */}
                      {hasMultiple && (
                        <div className="relative mb-2">
                          <select
                            value={sel.copyId}
                            onChange={(e) =>
                              setSelectedCopy((prev) => ({ ...prev, [book.id]: e.target.value }))
                            }
                            className="w-full text-[11px] border border-gray-200 rounded-lg px-2 py-1 pr-6 bg-white text-gray-700 appearance-none focus:outline-none focus:ring-1 focus:ring-violet-400"
                          >
                            {book.copies.map((c) => (
                              <option key={c.copyId} value={c.copyId}>
                                {c.condition}{c.price != null ? ` · ${priceLabel(c.price)}` : ""}
                                {cartIds.has(c.copyId) ? " ✓" : ""}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                        </div>
                      )}

                      {/* Price + button */}
                      <div className="flex items-center justify-between mt-auto pt-1">
                        <div>
                          {sel.price != null ? (
                            <p className="text-sm font-bold text-gray-900">{priceLabel(sel.price)}</p>
                          ) : (
                            <p className="text-xs text-gray-400 italic">No price set</p>
                          )}
                        </div>
                        {session ? (
                          <button
                            onClick={() => inCart ? removeFromCart(sel.copyId) : addToCart(sel.copyId)}
                            disabled={busy}
                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                              inCart
                                ? "bg-violet-100 text-violet-700 hover:bg-violet-200"
                                : "bg-violet-600 text-white hover:bg-violet-700"
                            } disabled:opacity-50`}
                          >
                            {busy
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : inCart
                                ? <Check className="w-3 h-3" />
                                : <ShoppingCart className="w-3 h-3" />}
                            {inCart ? "In Cart" : "Add"}
                          </button>
                        ) : (
                          <Link
                            href={`/${locale}/member/login`}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-violet-600 text-white hover:bg-violet-700 transition-colors"
                          >
                            Sign In
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {!session && filtered.length > 0 && (
          <div className="mt-8 flex items-center gap-3 bg-violet-50 border border-violet-200 rounded-xl p-4">
            <AlertCircle className="w-5 h-5 text-violet-600 flex-shrink-0" />
            <p className="text-sm text-violet-800">
              <Link href={`/${locale}/member/login`} className="font-semibold underline">Sign in</Link> to add books to your cart and purchase.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
