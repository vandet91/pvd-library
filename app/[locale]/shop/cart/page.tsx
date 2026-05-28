"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useLocale } from "next-intl";
import Image from "next/image";
import {
  ShoppingCart, BookOpen, Trash2, ArrowRight,
  Loader2, ShoppingBag, AlertCircle,
} from "lucide-react";
import MemberHeader from "@/components/shared/MemberHeader";
import { useLibraryName } from "@/context/library-name";

interface CartItem {
  id:      string;
  copyId:  string;
  bookId:  string;
  addedAt: string;
  copy:    { id: string; copyNumber: number; barcode: string | null; condition: string; status: string; price: number | null };
  book:    { id: string; title: string; coverImage: string | null; author: { name: string } | null };
}

export default function CartPage() {
  const { data: session, status } = useSession();
  const locale      = useLocale();
  const libraryName = useLibraryName();

  const [items,    setItems]    = useState<CartItem[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);
  const [currency, setCurrency] = useState("USD");

  useEffect(() => {
    if (status === "loading") return;
    if (!session) { setLoading(false); return; }

    async function load() {
      const [cartRes, settingsRes] = await Promise.all([
        fetch("/api/sale/cart"),
        fetch("/api/settings"),
      ]);
      const cart     = await cartRes.json();
      const settings = await settingsRes.json();
      setCurrency(settings.STOCK_CURRENCY ?? "USD");
      setItems(cart.items ?? []);
      setLoading(false);
    }
    load();
  }, [session, status]);

  async function remove(copyId: string) {
    setRemoving(copyId);
    await fetch("/api/sale/cart/items", {
      method:  "DELETE",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ copyId }),
    });
    setItems((prev) => prev.filter((i) => i.copyId !== copyId));
    setRemoving(null);
  }

  const subtotal = items.reduce((s, i) => s + (i.copy.price ?? 0), 0);
  const currSym  = currency === "USD" ? "$" : currency + " ";

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-violet-600" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4">
        <ShoppingCart className="w-12 h-12 text-gray-300" />
        <p className="text-gray-600">Please sign in to view your cart</p>
        <Link href={`/${locale}/member/login`} className="px-5 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700">Sign In</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <nav className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href={`/${locale}/shop`} className="text-sm text-gray-500 hover:text-gray-900">← Back to Shop</Link>
          </div>
          <MemberHeader theme="light" basketCount={items.length} />
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2 mb-6">
          <ShoppingCart className="w-5 h-5 text-violet-600" />
          Your Cart
          <span className="text-sm font-normal text-gray-400">({items.length} item{items.length !== 1 ? "s" : ""})</span>
        </h1>

        {items.length === 0 ? (
          <div className="text-center py-20">
            <ShoppingBag className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium mb-4">Your cart is empty</p>
            <Link href={`/${locale}/shop`} className="px-5 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700">Browse Books</Link>
          </div>
        ) : (
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Items list */}
            <div className="lg:col-span-2 space-y-3">
              {items.map((item) => (
                <div key={item.id} className="bg-white rounded-xl border border-gray-100 p-4 flex gap-4 shadow-sm">
                  <div className="w-16 h-20 bg-violet-50 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {item.book.coverImage ? (
                      <Image src={item.book.coverImage} alt={item.book.title} width={64} height={80} className="object-cover w-full h-full rounded-lg" />
                    ) : (
                      <BookOpen className="w-7 h-7 text-violet-300" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm leading-snug">{item.book.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{item.book.author?.name ?? "Unknown"}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Copy #{item.copy.copyNumber} · {item.copy.condition}
                      {item.copy.barcode && ` · ${item.copy.barcode}`}
                    </p>
                    {item.copy.status !== "FOR_SALE" && (
                      <span className="inline-flex items-center gap-1 text-xs text-red-600 mt-1">
                        <AlertCircle className="w-3 h-3" /> No longer available
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col items-end justify-between">
                    <p className="font-bold text-gray-900">
                      {item.copy.price != null ? `${currSym}${item.copy.price.toFixed(2)}` : "—"}
                    </p>
                    <button
                      onClick={() => remove(item.copyId)}
                      disabled={removing === item.copyId}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {removing === item.copyId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Summary */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm sticky top-20">
                <h2 className="font-semibold text-gray-900 mb-4">Order Summary</h2>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>Subtotal ({items.length} items)</span>
                    <span>{currSym}{subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-400 text-xs">
                    <span>Shipping</span>
                    <span>Calculated at checkout</span>
                  </div>
                  <div className="border-t border-gray-100 pt-2 flex justify-between font-bold text-gray-900">
                    <span>Estimated Total</span>
                    <span>{currSym}{subtotal.toFixed(2)}+</span>
                  </div>
                </div>
                <Link
                  href={`/${locale}/shop/checkout`}
                  className="mt-5 w-full flex items-center justify-center gap-2 py-3 bg-violet-600 text-white rounded-xl font-medium hover:bg-violet-700 transition-colors text-sm"
                >
                  Proceed to Checkout <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  href={`/${locale}/shop`}
                  className="mt-2 w-full flex items-center justify-center py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  Continue Shopping
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
