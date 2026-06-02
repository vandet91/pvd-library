"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useLocale } from "next-intl";
import Image from "next/image";
import {
  ShoppingCart, BookOpen, Trash2, ArrowRight,
  Loader2, ShoppingBag, AlertCircle, Minus, Plus, ArrowLeft,
} from "lucide-react";
import MemberHeader from "@/components/shared/MemberHeader";
import { useLibraryName } from "@/context/library-name";
import { useLibraryLogo } from "@/context/library-logo";
import { formatPrice, formatSecondary } from "@/lib/price-format";

/* ── Types ─────────────────────────────────────────────────────────────────── */

interface CartItem {
  id:      string;
  copyId:  string;
  bookId:  string;
  addedAt: string;
  copy:    { id: string; copyNumber: number; barcode: string | null; condition: string; status: string; price: number | null };
  book:    { id: string; title: string; coverImage: string | null; author: { name: string } | null };
}

// Flat copy record from /api/shop/books — tells us which copies are still FOR_SALE
interface ShopCopy {
  id:        string;   // bookId
  copyId:    string;
  condition: string;
  price:     number | null;
}

/* ── Component ──────────────────────────────────────────────────────────────── */

export default function CartPage() {
  const { data: session, status } = useSession();
  const locale      = useLocale();
  const libraryName = useLibraryName();
  const libraryLogo = useLibraryLogo();

  const [items,       setItems]       = useState<CartItem[]>([]);
  const [shopCopies,  setShopCopies]  = useState<ShopCopy[]>([]);   // all FOR_SALE copies
  const [loading,     setLoading]     = useState(true);
  const [removing,    setRemoving]    = useState<string | null>(null); // copyId being removed
  const [removingAll, setRemovingAll] = useState<string | null>(null); // bookId being bulk-cleared
  const [adding,      setAdding]      = useState<string | null>(null); // bookId being added to
  const [addError,    setAddError]    = useState<string | null>(null);
  const [currency,    setCurrency]    = useState("USD");
  const [secCur,      setSecCur]      = useState("");
  const [secRate,     setSecRate]     = useState(0);
  const [taxRate,     setTaxRate]     = useState(0);

  // ── Load cart + available shop copies ─────────────────────────────────────
  const loadCart = useCallback(async () => {
    const res = await fetch("/api/sale/cart");
    const data = res.ok ? await res.json() : {};
    setItems(data.items ?? []);
  }, []);

  useEffect(() => {
    if (status === "loading") return;
    if (!session) { setLoading(false); return; }

    async function load() {
      const [cartRes, settingsRes, booksRes] = await Promise.all([
        fetch("/api/sale/cart"),
        fetch("/api/settings"),
        fetch("/api/shop/books"),
      ]);
      const cart     = cartRes.ok     ? await cartRes.json()     : {};
      const settings = settingsRes.ok ? await settingsRes.json() : {};
      const books    = booksRes.ok    ? await booksRes.json()    : [];
      setCurrency(settings.STOCK_CURRENCY ?? "USD");
      setSecCur(settings.STOCK_SECONDARY_CURRENCY ?? "");
      setSecRate(parseFloat(settings.STOCK_SECONDARY_RATE ?? "0") || 0);
      setTaxRate(parseFloat(settings.BOOK_SALE_TAX_RATE ?? "0") || 0);
      setItems(cart.items ?? []);
      setShopCopies(Array.isArray(books) ? books : []);
      setLoading(false);
    }
    load();
  }, [session, status]);

  // ── Group items by book ───────────────────────────────────────────────────
  const grouped = useMemo(() => {
    const map = new Map<string, CartItem[]>();
    for (const item of items) {
      const g = map.get(item.bookId) ?? [];
      g.push(item);
      map.set(item.bookId, g);
    }
    return Array.from(map.values());
  }, [items]);

  // ── Available FOR_SALE copies not yet in any cart (by bookId) ────────────
  const availableByBook = useMemo(() => {
    const inCart = new Set(items.map((i) => i.copyId));
    const map    = new Map<string, string[]>(); // bookId → copyIds available to add
    for (const copy of shopCopies) {
      if (!inCart.has(copy.copyId)) {
        const arr = map.get(copy.id) ?? [];
        arr.push(copy.copyId);
        map.set(copy.id, arr);
      }
    }
    return map;
  }, [shopCopies, items]);

  // ── Remove one copy ───────────────────────────────────────────────────────
  async function removeOne(copyId: string) {
    setRemoving(copyId);
    await fetch("/api/sale/cart/items", {
      method:  "DELETE",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ copyId }),
    });
    setItems((prev) => prev.filter((i) => i.copyId !== copyId));
    setRemoving(null);
  }

  // ── Remove all copies of a book ───────────────────────────────────────────
  async function removeGroup(bookId: string, group: CartItem[]) {
    setRemovingAll(bookId);
    await Promise.all(
      group.map((item) =>
        fetch("/api/sale/cart/items", {
          method:  "DELETE",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ copyId: item.copyId }),
        }),
      ),
    );
    setItems((prev) => prev.filter((i) => i.bookId !== bookId));
    setRemovingAll(null);
  }

  // ── Add another copy of a book ────────────────────────────────────────────
  async function addOne(bookId: string) {
    const available = availableByBook.get(bookId);
    if (!available || available.length === 0) return;
    setAdding(bookId);
    setAddError(null);

    for (const copyId of available) {
      const res = await fetch("/api/sale/cart/items", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ copyId }),
      });
      if (res.ok) {
        // Re-fetch cart to get full copy+book details for the new item
        await loadCart();
        setAdding(null);
        return;
      }
      if (res.status !== 409) break; // unexpected error — stop retrying
    }
    setAddError("Could not add another copy — all available copies may be reserved.");
    setTimeout(() => setAddError(null), 4000);
    setAdding(null);
  }

  const subtotal        = items.reduce((s, i) => s + (i.copy.price ?? 0), 0);
  const taxAmount       = taxRate > 0 && !items.some((i) => i.copy.price == null) ? subtotal * (taxRate / 100) : 0;
  const hasMissingPrice = items.some((i) => i.copy.price == null);
  const fmt             = (n: number) => formatPrice(n, currency);
  const sec             = (n: number) => formatSecondary(n, secCur, secRate);
  const totalTitles     = grouped.length;
  const totalCopies     = items.length;

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="min-h-screen bg-[#faf7f0] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center shadow-sm">
            <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
          </div>
          <p className="text-gray-400 text-sm">Loading your cart…</p>
        </div>
      </div>
    );
  }

  /* ── Not signed in ── */
  if (!session) {
    return (
      <div className="min-h-screen bg-[#faf7f0] flex flex-col items-center justify-center gap-5">
        <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center shadow-sm">
          <ShoppingCart className="w-8 h-8 text-amber-300" />
        </div>
        <div className="text-center">
          <p className="font-semibold text-gray-800 mb-1">Sign in to view your cart</p>
          <p className="text-sm text-gray-400">Your items are waiting for you</p>
        </div>
        <Link href={`/${locale}/member/login`}
          className="px-6 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-semibold hover:bg-amber-600 transition-colors shadow-sm">
          Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#faf7f0]">

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-30 bg-[#1e1208] border-b border-white/10">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* Brand */}
            <Link href={`/${locale}/discover`} className="flex items-center gap-2 pr-3 mr-1 border-r border-white/15">
              <div className="w-7 h-7 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {libraryLogo
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={libraryLogo} alt={libraryName} className="w-full h-full object-contain" />
                  : <BookOpen className="w-3.5 h-3.5 text-amber-300" />}
              </div>
              <span className="text-xs font-bold text-white/80 hidden sm:block leading-none">{libraryName}</span>
            </Link>

            {/* Back to Bookstore */}
            <Link href={`/${locale}/shop`}
              className="flex items-center gap-1.5 text-amber-300/70 hover:text-amber-300 text-xs font-medium transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Bookstore</span>
            </Link>

            <div className="w-px h-4 bg-white/15" />

            {/* Cart label */}
            <div className="flex items-center gap-1.5">
              <ShoppingCart className="w-3.5 h-3.5 text-white/50" />
              <span className="text-sm font-semibold text-white">Cart</span>
              {totalCopies > 0 && (
                <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                  {totalCopies}
                </span>
              )}
            </div>
          </div>
          <MemberHeader theme="dark" />
        </div>
      </nav>

      {/* ── Dark hero strip ──────────────────────────────────────────────── */}
      <div className="bg-[#1e1208] px-4 pb-7 pt-5 relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.05]" style={{backgroundImage:"repeating-linear-gradient(transparent 0,transparent 17px,rgba(255,190,80,0.9) 17px,rgba(255,190,80,0.9) 18px)"}} />
        <div className="max-w-5xl mx-auto relative">
          <h1 className="text-2xl font-black text-white tracking-tight">
            Shopping <span className="text-amber-400">Cart</span>
          </h1>
          <p className="text-white/40 text-sm mt-0.5">
            {totalTitles > 0
              ? `${totalTitles} title${totalTitles !== 1 ? "s" : ""}${totalCopies > totalTitles ? `, ${totalCopies} copies` : ""} · ready to purchase`
              : "Your cart is currently empty"}
          </p>
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 py-8">

        {addError && (
          <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 border border-red-100 rounded-2xl px-4 py-3 mb-5">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {addError}
          </div>
        )}

        {grouped.length === 0 ? (
          /* ── Empty state ── */
          <div className="text-center py-24">
            <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
              <ShoppingBag className="w-8 h-8 text-amber-300" />
            </div>
            <p className="text-gray-700 font-semibold mb-1">Your cart is empty</p>
            <p className="text-sm text-gray-400 mb-6">Find something you'd love to own</p>
            <Link href={`/${locale}/shop`}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-semibold hover:bg-amber-600 transition-colors shadow-sm">
              <BookOpen className="w-4 h-4" /> Browse Bookstore
            </Link>
          </div>
        ) : (
          <div className="grid lg:grid-cols-3 gap-6 items-start">

            {/* ── Item list ────────────────────────────────────────────── */}
            <div className="lg:col-span-2 space-y-3">
              {grouped.map((group) => {
                const first      = group[0];
                const qty        = group.length;
                const groupTotal = group.reduce((s, i) => s + (i.copy.price ?? 0), 0);
                const allPriced  = group.every((i) => i.copy.price != null);
                const hasUnavail = group.some((i) => i.copy.status !== "FOR_SALE");
                const canAdd     = (availableByBook.get(first.bookId)?.length ?? 0) > 0;

                const isAdding      = adding      === first.bookId;
                const isRemovingAll = removingAll === first.bookId;
                const isRemovingOne = group.some((i) => removing === i.copyId);
                const anyBusy       = isAdding || isRemovingAll || isRemovingOne;

                const conditions = [...new Set(group.map((i) => i.copy.condition))].join(" · ");

                return (
                  <div key={first.bookId} className="bg-white rounded-2xl border border-stone-100 shadow-sm hover:shadow-md transition-shadow">
                    <div className="p-4 flex gap-4">

                      {/* Cover */}
                      <div className="w-16 h-20 bg-gradient-to-br from-amber-50 to-stone-100 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden relative">
                        {first.book.coverImage ? (
                          <Image src={first.book.coverImage} alt={first.book.title} width={64} height={80} className="object-cover w-full h-full rounded-xl" />
                        ) : (
                          <BookOpen className="w-7 h-7 text-stone-300" />
                        )}
                        {qty > 1 && (
                          <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-amber-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-sm">
                            {qty}
                          </span>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-sm leading-snug">{first.book.title}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{first.book.author?.name ?? "Unknown"}</p>
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          <span className="text-[10px] text-stone-500 bg-stone-100 px-2 py-0.5 rounded-full border border-stone-200">
                            {conditions}
                          </span>
                          {hasUnavail && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-100">
                              <AlertCircle className="w-2.5 h-2.5" /> Unavailable
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Price + qty controls */}
                      <div className="flex flex-col items-end justify-between flex-shrink-0 min-w-[72px]">
                        {/* Price */}
                        <p className="font-bold text-gray-900 text-sm">
                          {allPriced
                            ? fmt(groupTotal)
                            : <span className="text-amber-600 text-xs font-medium">Ask library</span>}
                        </p>

                        {qty === 1 ? (
                          /* Single copy: [1] [+] + subtle Remove */
                          <div className="flex flex-col items-end gap-1">
                            <div className="flex items-center gap-0.5">
                              <span className="w-7 text-center text-sm font-bold text-gray-800">
                                {isAdding
                                  ? <Loader2 className="w-3 h-3 animate-spin mx-auto text-amber-500" />
                                  : 1}
                              </span>
                              <button
                                onClick={() => addOne(first.bookId)}
                                disabled={anyBusy || !canAdd}
                                title={canAdd ? "Add another copy" : "No more copies available"}
                                className="w-7 h-7 rounded-lg bg-amber-500 text-white hover:bg-amber-600 flex items-center justify-center transition-colors disabled:opacity-40"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                            <button
                              onClick={() => removeOne(first.copyId)}
                              disabled={anyBusy}
                              className="text-[10px] text-gray-400 hover:text-red-500 transition-colors disabled:opacity-40 leading-none"
                            >
                              {isRemovingOne ? <Loader2 className="w-3 h-3 animate-spin" /> : "Remove"}
                            </button>
                          </div>
                        ) : (
                          /* Multiple copies: [−] N [+] [🗑] */
                          <div className="flex items-center gap-0.5">
                            <button
                              onClick={() => removeOne(group[group.length - 1].copyId)}
                              disabled={anyBusy}
                              title="Remove one copy"
                              className="w-7 h-7 rounded-lg bg-stone-100 text-stone-600 hover:bg-red-50 hover:text-red-600 flex items-center justify-center transition-colors disabled:opacity-40"
                            >
                              {isRemovingOne
                                ? <Loader2 className="w-3 h-3 animate-spin" />
                                : <Minus className="w-3 h-3" />}
                            </button>
                            <span className="w-7 text-center text-sm font-bold text-gray-800">
                              {isAdding || isRemovingAll
                                ? <Loader2 className="w-3 h-3 animate-spin mx-auto text-amber-500" />
                                : qty}
                            </span>
                            <button
                              onClick={() => addOne(first.bookId)}
                              disabled={anyBusy || !canAdd}
                              title={canAdd ? "Add another copy" : "No more copies available"}
                              className="w-7 h-7 rounded-lg bg-amber-500 text-white hover:bg-amber-600 flex items-center justify-center transition-colors disabled:opacity-40"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => removeGroup(first.bookId, group)}
                              disabled={anyBusy}
                              title="Remove all copies"
                              className="w-7 h-7 ml-1 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 flex items-center justify-center transition-colors disabled:opacity-40"
                            >
                              {isRemovingAll
                                ? <Loader2 className="w-3 h-3 animate-spin" />
                                : <Trash2 className="w-3 h-3" />}
                            </button>
                          </div>
                        )}
                      </div>

                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Order Summary ─────────────────────────────────────────── */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 sticky top-20">
                <h2 className="font-bold text-gray-900 text-base mb-4">Order Summary</h2>

                {hasMissingPrice && (
                  <div className="flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 mb-4">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    Some items have no price yet — the library will confirm the total before processing.
                  </div>
                )}

                {/* Line items */}
                <div className="space-y-2.5 mb-4">
                  {grouped.map((group) => {
                    const first     = group[0];
                    const qty       = group.length;
                    const total     = group.reduce((s, i) => s + (i.copy.price ?? 0), 0);
                    const allPriced = group.every((i) => i.copy.price != null);
                    return (
                      <div key={first.bookId} className="flex justify-between gap-2">
                        <span className="text-xs text-gray-600 truncate flex-1 leading-snug">
                          {first.book.title}
                          {qty > 1 && <span className="text-gray-400"> ×{qty}</span>}
                        </span>
                        <span className="text-xs font-medium text-gray-800 flex-shrink-0">
                          {allPriced ? fmt(total) : "—"}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="border-t border-stone-100 pt-3 space-y-2">
                  {taxAmount > 0 && (
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Tax ({taxRate}%)</span>
                      <span>{fmt(taxAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>Shipping</span>
                    <span>Calculated at checkout</span>
                  </div>
                  <div className="flex justify-between items-end pt-1">
                    <span className="font-bold text-gray-900 text-sm">Estimated Total</span>
                    <div className="text-right">
                      <span className="font-black text-amber-600 text-xl leading-none block">
                        {hasMissingPrice ? "TBD" : fmt(subtotal + taxAmount)}
                      </span>
                      {!hasMissingPrice && sec(subtotal + taxAmount) && (
                        <span className="text-[11px] text-stone-400 leading-none">≈ {sec(subtotal + taxAmount)}</span>
                      )}
                    </div>
                  </div>
                </div>

                <Link
                  href={`/${locale}/shop/checkout`}
                  className="mt-5 w-full flex items-center justify-center gap-2 py-3 bg-amber-500 text-white rounded-xl font-semibold hover:bg-amber-600 transition-colors text-sm shadow-sm"
                >
                  Proceed to Checkout <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  href={`/${locale}/shop`}
                  className="mt-2 w-full flex items-center justify-center gap-1 py-2.5 text-sm text-gray-400 hover:text-amber-600 transition-colors font-medium"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Continue Shopping
                </Link>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
