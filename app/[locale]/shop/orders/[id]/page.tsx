"use client";

import { use, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useLocale } from "next-intl";
import Image from "next/image";
import {
  Package, BookOpen, MapPin, Truck, QrCode,
  Upload, Check, X, Loader2, Printer, AlertCircle,
  RotateCcw, ArrowLeft,
} from "lucide-react";
import MemberHeader from "@/components/shared/MemberHeader";
import { useLibraryName } from "@/context/library-name";

interface Order {
  id: string; orderNumber: string; status: string; deliveryType: string;
  deliveryAddress: string | null; paymentMethod: string | null;
  paymentProof: string | null; paymentRef: string | null;
  subtotal: number; shippingFee: number; total: number; currency: string;
  logisticsCompany: string | null; trackingNumber: string | null;
  expectedDelivery: string | null; memberNote: string | null; staffNote: string | null;
  cancelReason: string | null; createdAt: string;
  branch: { name: string; address: string | null; phone: string | null } | null;
  items: {
    id: string; unitPrice: number; currency: string;
    book: { title: string; coverImage: string | null; isbn: string | null; author: { name: string } | null };
    copy: { copyNumber: number; barcode: string | null; condition: string };
  }[];
}

const STATUS_STEPS = [
  "PENDING_PAYMENT", "PAYMENT_SUBMITTED", "PAYMENT_CONFIRMED",
  "PREPARING", "READY_FOR_PICKUP", "SHIPPED", "DELIVERED", "COMPLETED",
];

const STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT:   "Pending Payment",
  PAYMENT_SUBMITTED: "Payment Submitted",
  PAYMENT_CONFIRMED: "Payment Confirmed",
  PREPARING:         "Preparing",
  READY_FOR_PICKUP:  "Ready for Pickup",
  SHIPPED:           "Shipped",
  DELIVERED:         "Delivered",
  COMPLETED:         "Completed",
  CANCELLED:         "Cancelled",
  RETURN_REQUESTED:  "Return Requested",
  RETURNED:          "Returned",
  REFUNDED:          "Refunded",
};

export default function OrderDetailPage({ params }: { params: Promise<{ id: string; locale: string }> }) {
  const { id } = use(params);
  const { data: session, status } = useSession();
  const locale    = useLocale();
  const libraryName = useLibraryName();

  const [order,      setOrder]      = useState<Order | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [proofUrl,   setProofUrl]   = useState("");
  const [proofRef,   setProofRef]   = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [proofError, setProofError] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [returning,  setReturning]  = useState(false);
  const [returnNote, setReturnNote] = useState("");
  const [showReturn, setShowReturn] = useState(false);

  useEffect(() => {
    if (status === "loading") return;
    fetch(`/api/sale/orders/${id}`).then((r) => r.json()).then((data) => {
      setOrder(data.id ? data : null);
      setLoading(false);
    });
  }, [id, status]);

  async function submitPayment() {
    if (!proofUrl) { setProofError("Please enter the payment proof URL"); return; }
    setSubmitting(true); setProofError("");
    const res = await fetch(`/api/sale/orders/${id}/payment`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentProof: proofUrl, paymentRef: proofRef || undefined }),
    });
    const data = await res.json();
    if (!res.ok) { setProofError(data.error ?? "Failed"); setSubmitting(false); return; }
    setOrder(data); setSubmitting(false);
  }

  async function cancelOrder() {
    if (!confirm("Cancel this order?")) return;
    setCancelling(true);
    const res = await fetch(`/api/sale/orders/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
    const data = await res.json();
    if (res.ok) setOrder(data);
    setCancelling(false);
  }

  async function requestReturn() {
    setReturning(true);
    const res = await fetch(`/api/sale/orders/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "request_return", note: returnNote }),
    });
    const data = await res.json();
    if (res.ok) { setOrder(data); setShowReturn(false); }
    else alert(data.error ?? "Failed");
    setReturning(false);
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-violet-600" /></div>;
  if (!order)  return <div className="min-h-screen flex items-center justify-center text-gray-500">Order not found</div>;

  const currSym    = order.currency === "USD" ? "$" : order.currency + " ";
  const stepIndex  = STATUS_STEPS.indexOf(order.status);
  const isCancelled = ["CANCELLED", "RETURNED", "REFUNDED"].includes(order.status);

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm print:hidden">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href={`/${locale}/shop/orders`} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900">
            <ArrowLeft className="w-4 h-4" /> My Orders
          </Link>
          <MemberHeader theme="light" />
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-5">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Order</p>
              <h1 className="text-lg font-bold text-gray-900">{order.orderNumber}</h1>
              <p className="text-xs text-gray-400 mt-0.5">{new Date(order.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
            </div>
            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
              isCancelled ? "bg-red-50 text-red-700" : "bg-violet-50 text-violet-700"
            }`}>
              {STATUS_LABEL[order.status] ?? order.status}
            </span>
          </div>

          {/* Progress bar */}
          {!isCancelled && stepIndex >= 0 && (
            <div className="mt-4">
              <div className="flex items-center gap-0">
                {STATUS_STEPS.slice(0, order.deliveryType === "PICKUP" ? 6 : STATUS_STEPS.length).map((s, i, arr) => {
                  const done = stepIndex >= i;
                  return (
                    <div key={s} className="flex items-center flex-1">
                      <div className={`w-3 h-3 rounded-full flex-shrink-0 ${done ? "bg-violet-600" : "bg-gray-200"}`} />
                      {i < arr.length - 1 && <div className={`flex-1 h-0.5 ${done && stepIndex > i ? "bg-violet-600" : "bg-gray-200"}`} />}
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-violet-700 font-medium mt-1">{STATUS_LABEL[order.status]}</p>
            </div>
          )}

          {order.cancelReason && <p className="mt-3 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">Reason: {order.cancelReason}</p>}
          {order.staffNote    && <p className="mt-3 text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">📋 {order.staffNote}</p>}
        </div>

        {/* ── Items ────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-3">Books</h2>
          <div className="space-y-3">
            {order.items.map((item) => (
              <div key={item.id} className="flex items-center gap-3">
                <div className="w-10 h-12 bg-violet-50 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center">
                  {item.book.coverImage ? <Image src={item.book.coverImage} alt="" width={40} height={48} className="object-cover w-full h-full" /> : <BookOpen className="w-5 h-5 text-violet-300" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{item.book.title}</p>
                  <p className="text-xs text-gray-500">{item.book.author?.name} · Copy #{item.copy.copyNumber} · {item.copy.condition}</p>
                </div>
                <p className="text-sm font-bold text-gray-900 flex-shrink-0">{currSym}{item.unitPrice.toFixed(2)}</p>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-100 mt-3 pt-3 space-y-1 text-sm">
            <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{currSym}{order.subtotal.toFixed(2)}</span></div>
            {order.shippingFee > 0 && <div className="flex justify-between text-gray-600"><span>Shipping</span><span>{currSym}{order.shippingFee.toFixed(2)}</span></div>}
            <div className="flex justify-between font-bold text-gray-900 text-base"><span>Total</span><span>{currSym}{order.total.toFixed(2)}</span></div>
          </div>
        </div>

        {/* ── Delivery info ──────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
            {order.deliveryType === "PICKUP" ? <MapPin className="w-4 h-4 text-violet-600" /> : <Truck className="w-4 h-4 text-violet-600" />}
            {order.deliveryType === "PICKUP" ? "Pickup Details" : "Delivery Details"}
          </h2>
          {order.deliveryType === "PICKUP" && order.branch && (
            <p className="text-sm text-gray-700">{order.branch.name}{order.branch.address ? ` — ${order.branch.address}` : ""}</p>
          )}
          {order.deliveryType === "DELIVERY" && order.deliveryAddress && (
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{order.deliveryAddress}</p>
          )}
          {order.logisticsCompany && (
            <div className="mt-3 bg-violet-50 rounded-lg p-3 space-y-1">
              <p className="text-xs font-medium text-violet-900">Logistics: {order.logisticsCompany}</p>
              {order.trackingNumber   && <p className="text-xs text-violet-700">Tracking: <span className="font-mono">{order.trackingNumber}</span></p>}
              {order.expectedDelivery && <p className="text-xs text-violet-700">Expected: {new Date(order.expectedDelivery).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</p>}
            </div>
          )}
        </div>

        {/* ── Payment proof upload ──── only when PENDING_PAYMENT + qr ─── */}
        {order.status === "PENDING_PAYMENT" && order.paymentMethod === "qr" && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
            <h2 className="font-semibold text-amber-900 mb-1 flex items-center gap-2">
              <QrCode className="w-4 h-4" /> Submit Payment Proof
            </h2>
            <p className="text-xs text-amber-700 mb-3">After scanning the QR and paying, paste the image URL of your payment screenshot below.</p>
            <input value={proofUrl} onChange={(e) => setProofUrl(e.target.value)} placeholder="https://… (image URL of receipt screenshot)" className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 mb-2" />
            <input value={proofRef} onChange={(e) => setProofRef(e.target.value)} placeholder="Transaction reference / ID (optional)" className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 mb-2" />
            {proofError && <p className="text-xs text-red-600 mb-2 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{proofError}</p>}
            <button onClick={submitPayment} disabled={submitting} className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Submit Proof
            </button>
          </div>
        )}

        {/* Payment proof submitted / confirmed */}
        {order.paymentProof && (
          <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <QrCode className="w-4 h-4 text-violet-600" /> Payment Proof
              {order.status !== "PENDING_PAYMENT" && order.status !== "PAYMENT_SUBMITTED" && <Check className="w-4 h-4 text-green-500" />}
            </h2>
            {order.paymentProof.startsWith("http") && (
              <Image src={order.paymentProof} alt="Payment proof" width={200} height={200} className="rounded-lg border border-gray-200" />
            )}
            {order.paymentRef && <p className="text-xs text-gray-500 mt-2">Ref: {order.paymentRef}</p>}
          </div>
        )}

        {/* ── Actions ─────────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-2 print:hidden">
          {order.status === "PENDING_PAYMENT" && (
            <button onClick={cancelOrder} disabled={cancelling} className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-600 bg-red-50 rounded-lg hover:bg-red-100 disabled:opacity-50">
              {cancelling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />} Cancel Order
            </button>
          )}
          {["COMPLETED", "DELIVERED"].includes(order.status) && (
            <button onClick={() => setShowReturn(true)} className="flex items-center gap-1.5 px-3 py-2 text-sm text-orange-700 bg-orange-50 rounded-lg hover:bg-orange-100">
              <RotateCcw className="w-3.5 h-3.5" /> Request Return
            </button>
          )}
          <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">
            <Printer className="w-3.5 h-3.5" /> Print Receipt
          </button>
        </div>

        {/* Return request modal */}
        {showReturn && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
              <h3 className="font-bold text-gray-900 mb-2">Request Return</h3>
              <p className="text-xs text-gray-500 mb-3">Describe the reason for your return request.</p>
              <textarea value={returnNote} onChange={(e) => setReturnNote(e.target.value)} rows={3} placeholder="Reason for return…" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none mb-3" />
              <div className="flex gap-2">
                <button onClick={() => setShowReturn(false)} className="flex-1 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">Cancel</button>
                <button onClick={requestReturn} disabled={returning} className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:opacity-50">
                  {returning && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Submit
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
