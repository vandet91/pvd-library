"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLocale } from "next-intl";
import Image from "next/image";
import {
  BookOpen, MapPin, Truck, CreditCard,
  QrCode, Loader2, Check, AlertCircle,
} from "lucide-react";
import MemberHeader from "@/components/shared/MemberHeader";
import { useLibraryName } from "@/context/library-name";

interface CartItem {
  copyId: string;
  copy:   { price: number | null };
  book:   { title: string; coverImage: string | null };
}
interface Branch { id: string; name: string; address: string | null }
interface Settings { BOOK_SALE_QR_IMAGE: string; BOOK_SALE_PAYMENT_METHODS: string; BOOK_SALE_SHIPPING_FEE: string; BOOK_SALE_DELIVERY_ENABLED: string; BOOK_SALE_PICKUP_ENABLED: string; STOCK_CURRENCY: string }

export default function CheckoutPage() {
  const { data: session, status } = useSession();
  const locale    = useLocale();
  const router    = useRouter();
  const libraryName = useLibraryName();

  const [items,          setItems]          = useState<CartItem[]>([]);
  const [branches,       setBranches]       = useState<Branch[]>([]);
  const [settings,       setSettings]       = useState<Settings | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [submitting,     setSubmitting]     = useState(false);
  const [error,          setError]          = useState("");

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
      const cart     = await cartRes.json();
      const branchData = await branchRes.json();
      const s        = await settingsRes.json();
      setItems(cart.items ?? []);
      setBranches((branchData.branches ?? branchData).filter((b: Branch & { isActive?: boolean }) => b.isActive !== false));
      setSettings(s);
      if (s.BOOK_SALE_PICKUP_ENABLED !== "true")  setDeliveryType("DELIVERY");
      if (s.BOOK_SALE_DELIVERY_ENABLED !== "true") setDeliveryType("PICKUP");
      const methods = (s.BOOK_SALE_PAYMENT_METHODS ?? "qr").split(",").map((m: string) => m.trim());
      setPaymentMethod(methods[0] === "cash_on_pickup" ? "cash_on_pickup" : "qr");
      setLoading(false);
    }
    load();
  }, [session, status, locale, router]);

  const shippingFee = deliveryType === "DELIVERY" ? parseFloat(settings?.BOOK_SALE_SHIPPING_FEE ?? "2") : 0;
  const subtotal    = items.reduce((s, i) => s + (i.copy.price ?? 0), 0);
  const total       = subtotal + shippingFee;
  const currSym     = settings?.STOCK_CURRENCY === "USD" ? "$" : (settings?.STOCK_CURRENCY ?? "") + " ";
  const methods     = (settings?.BOOK_SALE_PAYMENT_METHODS ?? "qr").split(",").map((m) => m.trim());

  async function submit() {
    setError("");
    if (deliveryType === "PICKUP" && !branchId)        { setError("Please select a pickup branch"); return; }
    if (deliveryType === "DELIVERY" && !deliveryAddress.trim()) { setError("Please enter your delivery address"); return; }
    setSubmitting(true);
    const res = await fetch("/api/sale/checkout", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ deliveryType, branchId: branchId || undefined, deliveryAddress: deliveryAddress || undefined, paymentMethod, memberNote: memberNote || undefined }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Checkout failed"); setSubmitting(false); return; }
    router.push(`/${locale}/shop/orders/${data.id}`);
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-violet-600" /></div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href={`/${locale}/shop/cart`} className="text-sm text-gray-500 hover:text-gray-900">← Back to Cart</Link>
          <MemberHeader theme="light" />
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-xl font-bold text-gray-900 mb-6">Checkout</h1>
        <div className="grid lg:grid-cols-3 gap-6">

          {/* ── Form ─────────────────────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-5">

            {/* Delivery method */}
            <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
              <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Truck className="w-4 h-4 text-violet-600" /> Delivery Method
              </h2>
              <div className="flex gap-3">
                {settings?.BOOK_SALE_PICKUP_ENABLED === "true" && (
                  <button
                    onClick={() => setDeliveryType("PICKUP")}
                    className={`flex-1 py-3 rounded-xl border text-sm font-medium transition-colors ${
                      deliveryType === "PICKUP" ? "border-violet-500 bg-violet-50 text-violet-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <MapPin className="w-4 h-4 mx-auto mb-1" /> Pick up at Branch
                  </button>
                )}
                {settings?.BOOK_SALE_DELIVERY_ENABLED === "true" && (
                  <button
                    onClick={() => setDeliveryType("DELIVERY")}
                    className={`flex-1 py-3 rounded-xl border text-sm font-medium transition-colors ${
                      deliveryType === "DELIVERY" ? "border-violet-500 bg-violet-50 text-violet-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <Truck className="w-4 h-4 mx-auto mb-1" /> Home Delivery
                  </button>
                )}
              </div>

              {deliveryType === "PICKUP" && (
                <div className="mt-4">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Select Branch *</label>
                  <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500">
                    <option value="">— Choose pickup location —</option>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}{b.address ? ` · ${b.address}` : ""}</option>)}
                  </select>
                </div>
              )}
              {deliveryType === "DELIVERY" && (
                <div className="mt-4">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Delivery Address *</label>
                  <textarea value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} rows={3} placeholder="Full address including street, city, province…" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none" />
                  <p className="text-xs text-gray-400 mt-1">Shipping fee: {currSym}{shippingFee.toFixed(2)}</p>
                </div>
              )}
            </div>

            {/* Payment method */}
            <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
              <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-violet-600" /> Payment Method
              </h2>
              <div className="flex gap-3">
                {methods.includes("qr") && (
                  <button onClick={() => setPaymentMethod("qr")} className={`flex-1 py-3 rounded-xl border text-sm font-medium transition-colors ${paymentMethod === "qr" ? "border-violet-500 bg-violet-50 text-violet-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                    <QrCode className="w-4 h-4 mx-auto mb-1" /> QR Payment
                  </button>
                )}
                {methods.includes("cash_on_pickup") && deliveryType === "PICKUP" && (
                  <button onClick={() => setPaymentMethod("cash_on_pickup")} className={`flex-1 py-3 rounded-xl border text-sm font-medium transition-colors ${paymentMethod === "cash_on_pickup" ? "border-violet-500 bg-violet-50 text-violet-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                    <Check className="w-4 h-4 mx-auto mb-1" /> Cash on Pickup
                  </button>
                )}
              </div>
              {paymentMethod === "qr" && settings?.BOOK_SALE_QR_IMAGE && (
                <div className="mt-4 text-center">
                  <p className="text-xs text-gray-500 mb-2">Scan to pay {currSym}{total.toFixed(2)} — then upload your receipt screenshot on the next screen</p>
                  <Image src={settings.BOOK_SALE_QR_IMAGE} alt="Payment QR" width={180} height={180} className="mx-auto rounded-xl border border-gray-200" />
                </div>
              )}
              {paymentMethod === "qr" && !settings?.BOOK_SALE_QR_IMAGE && (
                <p className="text-xs text-amber-600 mt-3 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> QR code image not configured yet — contact the library for payment details
                </p>
              )}
            </div>

            {/* Note */}
            <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
              <label className="block text-sm font-semibold text-gray-900 mb-2">Note to Library (optional)</label>
              <textarea value={memberNote} onChange={(e) => setMemberNote(e.target.value)} rows={2} placeholder="Any special requests or instructions…" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none" />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
              </div>
            )}
          </div>

          {/* ── Summary ──────────────────────────────────────────────── */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm sticky top-20">
              <h2 className="font-semibold text-gray-900 mb-3">Order Summary</h2>
              <div className="space-y-2 mb-4">
                {items.map((item) => (
                  <div key={item.copyId} className="flex items-center gap-2 text-sm">
                    <div className="w-8 h-10 bg-violet-50 rounded flex items-center justify-center flex-shrink-0">
                      {item.book.coverImage ? <Image src={item.book.coverImage} alt="" width={32} height={40} className="object-cover rounded w-full h-full" /> : <BookOpen className="w-4 h-4 text-violet-300" />}
                    </div>
                    <p className="flex-1 text-gray-700 line-clamp-1 text-xs">{item.book.title}</p>
                    <p className="text-xs font-medium text-gray-900">{item.copy.price != null ? `${currSym}${item.copy.price.toFixed(2)}` : "—"}</p>
                  </div>
                ))}
              </div>
              <div className="border-t border-gray-100 pt-3 space-y-1.5 text-sm">
                <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{currSym}{subtotal.toFixed(2)}</span></div>
                {shippingFee > 0 && <div className="flex justify-between text-gray-600"><span>Shipping</span><span>{currSym}{shippingFee.toFixed(2)}</span></div>}
                <div className="flex justify-between font-bold text-gray-900 text-base border-t border-gray-100 pt-2"><span>Total</span><span>{currSym}{total.toFixed(2)}</span></div>
              </div>
              <button onClick={submit} disabled={submitting || items.length === 0} className="mt-5 w-full flex items-center justify-center gap-2 py-3 bg-violet-600 text-white rounded-xl font-medium hover:bg-violet-700 transition-colors text-sm disabled:opacity-50">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Place Order
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
