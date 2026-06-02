"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLocale } from "next-intl";
import Image from "next/image";
import {
  BookOpen, MapPin, Truck, QrCode, Loader2, Check,
  AlertCircle, ArrowLeft, ShoppingBag, Banknote,
} from "lucide-react";
import MemberHeader from "@/components/shared/MemberHeader";
import { useLibraryName } from "@/context/library-name";
import { useLibraryLogo } from "@/context/library-logo";
import { formatPrice, formatSecondary } from "@/lib/price-format";

interface CartItem {
  copyId: string;
  copy:   { price: number | null };
  book:   { title: string; coverImage: string | null };
}
interface Branch { id: string; name: string; address: string | null }
interface Settings {
  BOOK_SALE_QR_IMAGE:           string;
  BOOK_SALE_BANK_NAME:          string;
  BOOK_SALE_ACCOUNT_NAME:       string;
  BOOK_SALE_ACCOUNT_NUMBER:     string;
  BOOK_SALE_PAYMENT_INSTRUCTIONS: string;
  BOOK_SALE_PAYMENT_METHODS:    string;
  BOOK_SALE_SHIPPING_FEE:       string;
  BOOK_SALE_TAX_RATE:           string;
  BOOK_SALE_DELIVERY_ENABLED:   string;
  BOOK_SALE_PICKUP_ENABLED:     string;
  STOCK_CURRENCY:                 string;
  STOCK_SECONDARY_CURRENCY:       string;
  STOCK_SECONDARY_RATE:           string;
}

export default function CheckoutPage() {
  const { data: session, status } = useSession();
  const locale      = useLocale();
  const router      = useRouter();
  const libraryName = useLibraryName();
  const libraryLogo = useLibraryLogo();

  const [items,       setItems]       = useState<CartItem[]>([]);
  const [branches,    setBranches]    = useState<Branch[]>([]);
  const [settings,    setSettings]    = useState<Settings | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState("");

  // Form state
  const [deliveryType,    setDeliveryType]    = useState<"PICKUP" | "DELIVERY">("PICKUP");
  const [branchId,        setBranchId]        = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [paymentMethod,   setPaymentMethod]   = useState<"qr" | "cash_on_pickup">("qr");
  const [memberNote,      setMemberNote]      = useState("");

  useEffect(() => {
    if (status === "loading") return;
    if (!session) { router.replace(`/${locale}/member/login`); return; }
    async function load() {
      const [cartRes, branchRes, settingsRes] = await Promise.all([
        fetch("/api/sale/cart"),
        fetch("/api/branches"),
        fetch("/api/settings"),
      ]);
      const cart       = cartRes.ok     ? await cartRes.json()     : {};
      const branchData = branchRes.ok   ? await branchRes.json()   : [];
      const s          = settingsRes.ok ? await settingsRes.json() : {};
      setItems(cart.items ?? []);
      setBranches((branchData.branches ?? branchData).filter((b: Branch & { isActive?: boolean }) => b.isActive !== false));
      setSettings(s);
      if (s.BOOK_SALE_PICKUP_ENABLED  !== "true") setDeliveryType("DELIVERY");
      if (s.BOOK_SALE_DELIVERY_ENABLED !== "true") setDeliveryType("PICKUP");
      const methods = (s.BOOK_SALE_PAYMENT_METHODS ?? "qr").split(",").map((m: string) => m.trim());
      setPaymentMethod(methods[0] === "cash_on_pickup" ? "cash_on_pickup" : "qr");
      setLoading(false);
    }
    load();
  }, [session, status, locale, router]);

  const shippingFee = deliveryType === "DELIVERY" ? parseFloat(settings?.BOOK_SALE_SHIPPING_FEE ?? "2") : 0;
  const taxRate     = parseFloat(settings?.BOOK_SALE_TAX_RATE ?? "0") || 0;
  const subtotal    = items.reduce((s, i) => s + (i.copy.price ?? 0), 0);
  const taxAmount   = taxRate > 0 ? subtotal * (taxRate / 100) : 0;
  const total       = subtotal + taxAmount + shippingFee;
  const cur         = settings?.STOCK_CURRENCY ?? "USD";
  const secCur      = settings?.STOCK_SECONDARY_CURRENCY ?? "";
  const secRate     = parseFloat(settings?.STOCK_SECONDARY_RATE ?? "0") || 0;
  const fmt         = (n: number) => formatPrice(n, cur);
  const sec         = (n: number) => formatSecondary(n, secCur, secRate);
  const methods     = (settings?.BOOK_SALE_PAYMENT_METHODS ?? "qr").split(",").map((m) => m.trim());

  async function submit() {
    setError("");
    if (deliveryType === "PICKUP" && !branchId)               { setError("Please select a pickup branch"); return; }
    if (deliveryType === "DELIVERY" && !deliveryAddress.trim()) { setError("Please enter your delivery address"); return; }
    setSubmitting(true);
    const res  = await fetch("/api/sale/checkout", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        deliveryType,
        branchId:        branchId        || undefined,
        deliveryAddress: deliveryAddress || undefined,
        paymentMethod,
        memberNote:      memberNote      || undefined,
      }),
    });
    const data = await res.json().catch(() => ({})) as Record<string, string>;
    if (!res.ok) { setError(data.error ?? "Checkout failed"); setSubmitting(false); return; }
    router.push(`/${locale}/shop/orders/${data.id}`);
  }

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="min-h-screen bg-[#faf7f0] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center shadow-sm">
            <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
          </div>
          <p className="text-gray-400 text-sm">Loading checkout…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#faf7f0]">

      {/* ── Nav ── */}
      <nav className="sticky top-0 z-30 bg-[#1e1208] border-b border-white/10">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href={`/${locale}/discover`} className="flex items-center gap-2 pr-3 mr-1 border-r border-white/15">
              <div className="w-7 h-7 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {libraryLogo
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={libraryLogo} alt={libraryName} className="w-full h-full object-contain" />
                  : <BookOpen className="w-3.5 h-3.5 text-amber-300" />}
              </div>
              <span className="text-xs font-bold text-white/80 hidden sm:block">{libraryName}</span>
            </Link>
            <Link href={`/${locale}/shop/cart`} className="flex items-center gap-1.5 text-amber-300/70 hover:text-amber-300 text-xs font-medium transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Back to Cart</span>
            </Link>
            <div className="w-px h-4 bg-white/15" />
            <span className="text-sm font-semibold text-white">Checkout</span>
          </div>
          <MemberHeader theme="dark" />
        </div>
      </nav>

      {/* ── Dark header ── */}
      <div className="bg-[#1e1208] px-4 pb-7 pt-5">
        <div className="absolute inset-0 opacity-[0.05] pointer-events-none" style={{backgroundImage:"repeating-linear-gradient(transparent 0,transparent 17px,rgba(255,190,80,0.9) 17px,rgba(255,190,80,0.9) 18px)"}} />
        <div className="max-w-5xl mx-auto">
          <h1 className="text-2xl font-black text-white tracking-tight">
            Complete your <span className="text-amber-400">Order</span>
          </h1>
          <p className="text-white/40 text-sm mt-0.5">Review and confirm your purchase</p>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-3 gap-6 items-start">

          {/* ── Left: form ── */}
          <div className="lg:col-span-2 space-y-4">

            {/* Delivery method */}
            <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
              <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Truck className="w-4 h-4 text-amber-500" /> Delivery Method
              </h2>
              <div className="flex gap-3">
                {settings?.BOOK_SALE_PICKUP_ENABLED === "true" && (
                  <button
                    onClick={() => setDeliveryType("PICKUP")}
                    className={`flex-1 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                      deliveryType === "PICKUP"
                        ? "border-amber-400 bg-amber-50 text-amber-800"
                        : "border-stone-200 text-gray-500 hover:border-stone-300"
                    }`}
                  >
                    <MapPin className="w-4 h-4 mx-auto mb-1" />
                    Pick up at Branch
                  </button>
                )}
                {settings?.BOOK_SALE_DELIVERY_ENABLED === "true" && (
                  <button
                    onClick={() => setDeliveryType("DELIVERY")}
                    className={`flex-1 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                      deliveryType === "DELIVERY"
                        ? "border-amber-400 bg-amber-50 text-amber-800"
                        : "border-stone-200 text-gray-500 hover:border-stone-300"
                    }`}
                  >
                    <Truck className="w-4 h-4 mx-auto mb-1" />
                    Home Delivery
                  </button>
                )}
              </div>

              {deliveryType === "PICKUP" && (
                <div className="mt-4">
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Select Branch *</label>
                  <select
                    value={branchId}
                    onChange={(e) => setBranchId(e.target.value)}
                    className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                  >
                    <option value="">— Choose pickup location —</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}{b.address ? ` · ${b.address}` : ""}</option>
                    ))}
                  </select>
                </div>
              )}
              {deliveryType === "DELIVERY" && (
                <div className="mt-4">
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Delivery Address *</label>
                  <textarea
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    rows={3}
                    placeholder="Full address including street, city, province…"
                    className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                  />
                  <p className="text-xs text-gray-400 mt-1">Shipping fee: {fmt(shippingFee)}</p>
                </div>
              )}
            </div>

            {/* Payment method */}
            <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
              <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                <QrCode className="w-4 h-4 text-amber-500" /> Payment Method
              </h2>
              <div className="flex gap-3">
                {methods.includes("qr") && (
                  <button
                    onClick={() => setPaymentMethod("qr")}
                    className={`flex-1 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                      paymentMethod === "qr"
                        ? "border-amber-400 bg-amber-50 text-amber-800"
                        : "border-stone-200 text-gray-500 hover:border-stone-300"
                    }`}
                  >
                    <QrCode className="w-4 h-4 mx-auto mb-1" />
                    QR / Bank Transfer
                  </button>
                )}
                {methods.includes("cash_on_pickup") && deliveryType === "PICKUP" && (
                  <button
                    onClick={() => setPaymentMethod("cash_on_pickup")}
                    className={`flex-1 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                      paymentMethod === "cash_on_pickup"
                        ? "border-amber-400 bg-amber-50 text-amber-800"
                        : "border-stone-200 text-gray-500 hover:border-stone-300"
                    }`}
                  >
                    <Banknote className="w-4 h-4 mx-auto mb-1" />
                    Cash on Pickup
                  </button>
                )}
              </div>

              {/* QR section */}
              {paymentMethod === "qr" && (
                <div className="mt-4 bg-amber-50 border border-amber-100 rounded-xl p-4">
                  {settings?.BOOK_SALE_QR_IMAGE ? (
                    <div className="flex items-start gap-4 flex-wrap">
                      <div className="flex-shrink-0 bg-white rounded-xl p-2 border border-amber-200 shadow-sm">
                        <Image
                          src={settings.BOOK_SALE_QR_IMAGE}
                          alt="Payment QR"
                          width={140}
                          height={140}
                          className="rounded-lg"
                        />
                      </div>
                      <div className="flex-1 min-w-[160px]">
                        <p className="text-sm font-semibold text-amber-900 mb-2">Scan to pay</p>
                        {settings?.BOOK_SALE_BANK_NAME && (
                          <p className="text-xs text-amber-800"><span className="font-medium">Bank:</span> {settings.BOOK_SALE_BANK_NAME}</p>
                        )}
                        {settings?.BOOK_SALE_ACCOUNT_NAME && (
                          <p className="text-xs text-amber-800 mt-0.5"><span className="font-medium">Name:</span> {settings.BOOK_SALE_ACCOUNT_NAME}</p>
                        )}
                        {settings?.BOOK_SALE_ACCOUNT_NUMBER && (
                          <p className="text-xs text-amber-800 mt-0.5"><span className="font-medium">Account:</span> {settings.BOOK_SALE_ACCOUNT_NUMBER}</p>
                        )}
                        <div className="mt-3 bg-amber-100 rounded-lg px-3 py-2">
                          <p className="text-xs font-medium text-amber-900">Amount to pay:</p>
                          <p className="text-xl font-black text-amber-700 leading-tight">{fmt(total)}</p>
                          {sec(total) && (
                            <p className="text-xs text-amber-600 mt-0.5">≈ {sec(total)}</p>
                          )}
                        </div>
                        {settings?.BOOK_SALE_PAYMENT_INSTRUCTIONS ? (
                          <p className="text-xs text-amber-700 mt-2 italic">{settings.BOOK_SALE_PAYMENT_INSTRUCTIONS}</p>
                        ) : (
                          <p className="text-xs text-amber-700 mt-2">After payment, you&apos;ll upload your screenshot on the next screen.</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-amber-700 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5" />
                      QR code not configured yet — contact the library for payment details.
                    </p>
                  )}
                </div>
              )}

              {paymentMethod === "cash_on_pickup" && (
                <div className="mt-4 bg-green-50 border border-green-100 rounded-xl p-4">
                  <p className="text-sm text-green-800 flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                    Pay <strong>{fmt(total)}</strong> in cash when you collect your books at the branch.
                  </p>
                </div>
              )}
            </div>

            {/* Note */}
            <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
              <label className="block text-sm font-bold text-gray-900 mb-2">Note to Library <span className="text-gray-400 font-normal">(optional)</span></label>
              <textarea
                value={memberNote}
                onChange={(e) => setMemberNote(e.target.value)}
                rows={2}
                placeholder="Any special requests or instructions…"
                className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 border border-red-100 rounded-2xl px-4 py-3">
                <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
              </div>
            )}
          </div>

          {/* ── Right: order summary ── */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 sticky top-20">
              <h2 className="font-bold text-gray-900 mb-4">Order Summary</h2>

              <div className="space-y-2.5 mb-4">
                {items.map((item) => (
                  <div key={item.copyId} className="flex items-center gap-2.5">
                    <div className="w-9 h-11 bg-gradient-to-br from-amber-50 to-stone-100 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {item.book.coverImage
                        ? <Image src={item.book.coverImage} alt="" width={36} height={44} className="object-cover rounded-lg w-full h-full" />
                        : <BookOpen className="w-4 h-4 text-stone-300" />}
                    </div>
                    <p className="flex-1 text-gray-700 line-clamp-1 text-xs">{item.book.title}</p>
                    <p className="text-xs font-semibold text-gray-900 flex-shrink-0">
                      {item.copy.price != null ? fmt(item.copy.price) : "—"}
                    </p>
                  </div>
                ))}
              </div>

              <div className="border-t border-stone-100 pt-3 space-y-1.5">
                <div className="flex justify-between text-xs text-gray-500"><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
                {taxAmount > 0 && <div className="flex justify-between text-xs text-gray-500"><span>Tax ({taxRate}%)</span><span>{fmt(taxAmount)}</span></div>}
                {shippingFee > 0 && <div className="flex justify-between text-xs text-gray-500"><span>Shipping</span><span>{fmt(shippingFee)}</span></div>}
                <div className="flex justify-between items-end pt-1 border-t border-stone-100">
                  <span className="font-bold text-gray-900 text-sm">Total</span>
                  <div className="text-right">
                    <span className="font-black text-amber-600 text-xl leading-none block">{fmt(total)}</span>
                    {sec(total) && (
                      <span className="text-[11px] text-stone-400 leading-none">≈ {sec(total)}</span>
                    )}
                  </div>
                </div>
              </div>

              <button
                onClick={submit}
                disabled={submitting || items.length === 0}
                className="mt-5 w-full flex items-center justify-center gap-2 py-3 bg-amber-500 text-white rounded-xl font-semibold hover:bg-amber-600 transition-colors text-sm disabled:opacity-50 shadow-sm"
              >
                {submitting
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <ShoppingBag className="w-4 h-4" />}
                Place Order
              </button>

              <p className="text-center text-xs text-gray-400 mt-3">
                {paymentMethod === "qr"
                  ? "You'll upload payment proof on the next screen"
                  : "Pay in cash when you collect your books"}
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
