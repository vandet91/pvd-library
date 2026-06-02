"use client";

import { use, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useLocale } from "next-intl";
import Image from "next/image";
import {
  Package, BookOpen, MapPin, Truck, QrCode,
  Upload, Check, X, Loader2, Printer, AlertCircle,
  RotateCcw, ArrowLeft, ImagePlus, CheckCircle,
} from "lucide-react";
import MemberHeader from "@/components/shared/MemberHeader";
import { useLibraryName } from "@/context/library-name";
import { useLibraryLogo } from "@/context/library-logo";
import { formatPrice, formatSecondary } from "@/lib/price-format";

interface Order {
  id: string; orderNumber: string; status: string; deliveryType: string;
  deliveryAddress: string | null; paymentMethod: string | null;
  paymentProof: string | null; paymentRef: string | null;
  subtotal: number; taxAmount: number; shippingFee: number; total: number; currency: string;
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
  PAYMENT_SUBMITTED: "Payment Submitted — Awaiting Confirmation",
  PAYMENT_CONFIRMED: "Payment Confirmed",
  PREPARING:         "Preparing Your Order",
  READY_FOR_PICKUP:  "Ready for Pickup",
  SHIPPED:           "Shipped",
  DELIVERED:         "Delivered",
  COMPLETED:         "Completed",
  CANCELLED:         "Cancelled",
  RETURN_REQUESTED:  "Return Requested",
  RETURNED:          "Returned",
  REFUNDED:          "Refunded",
};

const STATUS_COLOR: Record<string, string> = {
  PENDING_PAYMENT:   "bg-amber-50 text-amber-700 border-amber-200",
  PAYMENT_SUBMITTED: "bg-blue-50 text-blue-700 border-blue-200",
  PAYMENT_CONFIRMED: "bg-cyan-50 text-cyan-700 border-cyan-200",
  PREPARING:         "bg-indigo-50 text-indigo-700 border-indigo-200",
  READY_FOR_PICKUP:  "bg-purple-50 text-purple-700 border-purple-200",
  SHIPPED:           "bg-violet-50 text-violet-700 border-violet-200",
  DELIVERED:         "bg-teal-50 text-teal-700 border-teal-200",
  COMPLETED:         "bg-green-50 text-green-700 border-green-200",
  CANCELLED:         "bg-red-50 text-red-700 border-red-200",
};

export default function OrderDetailPage({ params }: { params: Promise<{ id: string; locale: string }> }) {
  const { id }      = use(params);
  const { data: session, status } = useSession();
  const locale      = useLocale();
  const libraryName = useLibraryName();
  const libraryLogo = useLibraryLogo();

  const [order,      setOrder]      = useState<Order | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [secCur,     setSecCur]     = useState("");
  const [secRate,    setSecRate]    = useState(0);

  // Payment proof upload
  const [proofFile,     setProofFile]     = useState<File | null>(null);
  const [proofPreview,  setProofPreview]  = useState<string>("");
  const [proofRef,      setProofRef]      = useState("");
  const [uploading,     setUploading]     = useState(false);
  const [submitting,    setSubmitting]    = useState(false);
  const [proofError,    setProofError]    = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Other actions
  const [cancelling,  setCancelling]  = useState(false);
  const [returning,   setReturning]   = useState(false);
  const [returnNote,  setReturnNote]  = useState("");
  const [showReturn,  setShowReturn]  = useState(false);

  useEffect(() => {
    if (status === "loading") return;
    Promise.all([
      fetch(`/api/sale/orders/${id}`).then((r) => r.ok ? r.json() : null),
      fetch("/api/settings").then((r) => r.ok ? r.json() : {}) as Promise<Record<string, string>>,
    ]).then(([data, settings]) => {
      setOrder(data?.id ? data : null);
      setSecCur(settings.STOCK_SECONDARY_CURRENCY ?? "");
      setSecRate(parseFloat(settings.STOCK_SECONDARY_RATE ?? "0") || 0);
      setLoading(false);
    });
  }, [id, status]);

  function handleFileSelect(file: File) {
    setProofFile(file);
    setProofError("");
    const reader = new FileReader();
    reader.onload = (e) => setProofPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function submitPayment() {
    if (!proofFile) { setProofError("Please select a screenshot of your payment"); return; }
    setUploading(true); setProofError("");

    // 1. Upload file
    const fd = new FormData();
    fd.append("file", proofFile);
    const uploadRes  = await fetch(`/api/sale/orders/${id}/upload`, { method: "POST", body: fd });
    const uploadData = await uploadRes.json().catch(() => ({})) as Record<string, string>;
    if (!uploadRes.ok) { setProofError(uploadData.error ?? "Upload failed"); setUploading(false); return; }
    if (!uploadData.url) { setProofError("Upload succeeded but no URL returned"); setUploading(false); return; }

    setUploading(false);
    setSubmitting(true);

    // 2. Submit proof URL
    const res  = await fetch(`/api/sale/orders/${id}/payment`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentProof: uploadData.url, paymentRef: proofRef || undefined }),
    });
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (!res.ok) { setProofError((data.error as string) ?? "Submission failed"); setSubmitting(false); return; }
    setOrder(data as unknown as Order); setSubmitting(false); setProofFile(null); setProofPreview("");
  }

  async function cancelOrder() {
    if (!confirm("Cancel this order?")) return;
    setCancelling(true);
    const res  = await fetch(`/api/sale/orders/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (res.ok) setOrder(data as unknown as Order);
    else alert((data.error as string) ?? "Failed to cancel order");
    setCancelling(false);
  }

  async function requestReturn() {
    setReturning(true);
    const res  = await fetch(`/api/sale/orders/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "request_return", note: returnNote }),
    });
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (res.ok) { setOrder(data as unknown as Order); setShowReturn(false); }
    else alert((data.error as string) ?? "Failed");
    setReturning(false);
  }

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="min-h-screen bg-[#faf7f0] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center shadow-sm">
            <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
          </div>
          <p className="text-gray-400 text-sm">Loading order…</p>
        </div>
      </div>
    );
  }
  if (!order) {
    return (
      <div className="min-h-screen bg-[#faf7f0] flex items-center justify-center">
        <p className="text-gray-500">Order not found</p>
      </div>
    );
  }

  const fmt         = (n: number) => formatPrice(n, order.currency);
  const sec         = (n: number) => formatSecondary(n, secCur, secRate);
  const stepIndex   = STATUS_STEPS.indexOf(order.status);
  const isCancelled = ["CANCELLED", "RETURNED", "REFUNDED"].includes(order.status);
  const statusCls   = STATUS_COLOR[order.status] ?? "bg-gray-100 text-gray-600 border-gray-200";

  return (
    <div className="min-h-screen bg-[#faf7f0]">

      {/* ── Nav ── */}
      <nav className="sticky top-0 z-30 bg-[#1e1208] border-b border-white/10 print:hidden">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
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
            <Link href={`/${locale}/shop/orders`}
              className="flex items-center gap-1.5 text-amber-300/70 hover:text-amber-300 text-xs font-medium transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">My Orders</span>
            </Link>
          </div>
          <MemberHeader theme="dark" />
        </div>
      </nav>

      {/* ── Dark header ── */}
      <div className="bg-[#1e1208] px-4 pb-7 pt-5 print:hidden">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-white/40 text-xs mb-0.5">Order</p>
              <h1 className="text-2xl font-black text-white tracking-tight">{order.orderNumber}</h1>
              <p className="text-white/30 text-xs mt-1">{new Date(order.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
            </div>
            <span className={`mt-1 px-3 py-1.5 rounded-full text-xs font-semibold border ${statusCls}`}>
              {STATUS_LABEL[order.status] ?? order.status}
            </span>
          </div>

          {/* Progress steps */}
          {!isCancelled && stepIndex >= 0 && (
            <div className="mt-5">
              <div className="flex items-center">
                {STATUS_STEPS.slice(0, order.deliveryType === "PICKUP" ? 6 : STATUS_STEPS.length).map((s, i, arr) => {
                  const done = stepIndex >= i;
                  return (
                    <div key={s} className="flex items-center flex-1">
                      <div className={`w-3 h-3 rounded-full flex-shrink-0 transition-colors ${done ? "bg-amber-400" : "bg-white/20"}`} />
                      {i < arr.length - 1 && <div className={`flex-1 h-0.5 transition-colors ${done && stepIndex > i ? "bg-amber-400" : "bg-white/15"}`} />}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-4">

        {/* Cancel / staff notes */}
        {order.cancelReason && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-sm text-red-700">
            <span className="font-semibold">Cancellation reason:</span> {order.cancelReason}
          </div>
        )}
        {order.staffNote && (
          <div className="bg-stone-50 border border-stone-200 rounded-2xl px-4 py-3 text-sm text-gray-700">
            📋 <span className="font-medium">Note from library:</span> {order.staffNote}
          </div>
        )}

        {/* ── Payment proof: PENDING + QR ── */}
        {order.status === "PENDING_PAYMENT" && order.paymentMethod === "qr" && (
          <div className="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
            <div className="bg-amber-50 px-5 py-3 border-b border-amber-100 flex items-center gap-2">
              <QrCode className="w-4 h-4 text-amber-600" />
              <h2 className="font-bold text-amber-900">Upload Payment Proof</h2>
            </div>
            <div className="p-5">
              <p className="text-sm text-gray-600 mb-4">
                After scanning and paying, take a screenshot of your payment confirmation and upload it below.
              </p>

              {/* Drop zone / preview */}
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files?.[0];
                  if (file && file.type.startsWith("image/")) handleFileSelect(file);
                }}
                className={`relative border-2 border-dashed rounded-2xl cursor-pointer transition-colors mb-4 ${
                  proofPreview ? "border-amber-300 p-2" : "border-stone-200 hover:border-amber-300 p-8"
                }`}
              >
                {proofPreview ? (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={proofPreview} alt="Preview" className="max-h-64 mx-auto rounded-xl object-contain" />
                    <button
                      onClick={(e) => { e.stopPropagation(); setProofFile(null); setProofPreview(""); }}
                      className="absolute top-2 right-2 w-7 h-7 bg-red-500 text-white rounded-full flex items-center justify-center shadow hover:bg-red-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="text-center">
                    <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center mx-auto mb-3">
                      <ImagePlus className="w-6 h-6 text-amber-400" />
                    </div>
                    <p className="text-sm font-medium text-gray-700">Click or drag your screenshot here</p>
                    <p className="text-xs text-gray-400 mt-1">JPG, PNG, GIF, WEBP · max 10 MB</p>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
                />
              </div>

              {/* Reference number */}
              <input
                value={proofRef}
                onChange={(e) => setProofRef(e.target.value)}
                placeholder="Transaction reference / ID (optional)"
                className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 mb-3"
              />

              {proofError && (
                <p className="text-xs text-red-600 mb-3 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" />{proofError}
                </p>
              )}

              <button
                onClick={submitPayment}
                disabled={!proofFile || uploading || submitting}
                className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-semibold hover:bg-amber-600 transition-colors disabled:opacity-50 shadow-sm"
              >
                {uploading || submitting
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Upload className="w-4 h-4" />}
                {uploading ? "Uploading…" : submitting ? "Submitting…" : "Submit Payment Proof"}
              </button>
            </div>
          </div>
        )}

        {/* ── Submitted proof ── */}
        {order.paymentProof && (
          <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
            <h2 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
              <QrCode className="w-4 h-4 text-amber-500" /> Payment Proof
              {order.status !== "PENDING_PAYMENT" && order.status !== "PAYMENT_SUBMITTED" && (
                <CheckCircle className="w-4 h-4 text-green-500" />
              )}
            </h2>
            {order.status === "PAYMENT_SUBMITTED" && (
              <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 mb-3 text-xs text-blue-700">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Awaiting librarian confirmation…
              </div>
            )}
            <Image
              src={order.paymentProof}
              alt="Payment proof"
              width={220}
              height={220}
              className="rounded-xl border border-stone-200 shadow-sm"
            />
            {order.paymentRef && <p className="text-xs text-gray-400 mt-2">Ref: <span className="font-mono">{order.paymentRef}</span></p>}
          </div>
        )}

        {/* ── Books ── */}
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
          <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-amber-500" /> Books
          </h2>
          <div className="space-y-3">
            {order.items.map((item) => (
              <div key={item.id} className="flex items-center gap-3">
                <div className="w-10 h-12 bg-gradient-to-br from-amber-50 to-stone-100 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center">
                  {item.book.coverImage
                    ? <Image src={item.book.coverImage} alt="" width={40} height={48} className="object-cover w-full h-full" />
                    : <BookOpen className="w-5 h-5 text-stone-300" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{item.book.title}</p>
                  <p className="text-xs text-gray-400">{item.book.author?.name} · {item.copy.condition}</p>
                </div>
                <p className="text-sm font-bold text-gray-900 flex-shrink-0">{fmt(item.unitPrice)}</p>
              </div>
            ))}
          </div>
          <div className="border-t border-stone-100 mt-4 pt-3 space-y-1.5 text-sm">
            <div className="flex justify-between text-gray-500">
              <span>Subtotal</span>
              <div className="text-right">
                <span>{fmt(order.subtotal)}</span>
                {sec(order.subtotal) && <p className="text-[10px] text-stone-400">≈ {sec(order.subtotal)}</p>}
              </div>
            </div>
            {order.taxAmount > 0 && (
              <div className="flex justify-between text-gray-500">
                <span>Tax</span>
                <div className="text-right">
                  <span>{fmt(order.taxAmount)}</span>
                  {sec(order.taxAmount) && <p className="text-[10px] text-stone-400">≈ {sec(order.taxAmount)}</p>}
                </div>
              </div>
            )}
            {order.shippingFee > 0 && (
              <div className="flex justify-between text-gray-500">
                <span>Shipping</span>
                <div className="text-right">
                  <span>{fmt(order.shippingFee)}</span>
                  {sec(order.shippingFee) && <p className="text-[10px] text-stone-400">≈ {sec(order.shippingFee)}</p>}
                </div>
              </div>
            )}
            <div className="flex justify-between items-end border-t border-stone-100 pt-2">
              <span className="font-bold text-gray-900">Total</span>
              <div className="text-right">
                <span className="font-black text-amber-600 text-xl leading-none block">{fmt(order.total)}</span>
                {sec(order.total) && (
                  <span className="text-[11px] text-stone-400 leading-none">≈ {sec(order.total)}</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Delivery info ── */}
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
          <h2 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
            {order.deliveryType === "PICKUP"
              ? <MapPin className="w-4 h-4 text-amber-500" />
              : <Truck className="w-4 h-4 text-amber-500" />}
            {order.deliveryType === "PICKUP" ? "Pickup Details" : "Delivery Details"}
          </h2>
          {order.deliveryType === "PICKUP" && order.branch && (
            <p className="text-sm text-gray-700">{order.branch.name}{order.branch.address ? ` — ${order.branch.address}` : ""}</p>
          )}
          {order.deliveryType === "DELIVERY" && order.deliveryAddress && (
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{order.deliveryAddress}</p>
          )}
          {order.logisticsCompany && (
            <div className="mt-3 bg-amber-50 border border-amber-100 rounded-xl p-3 space-y-1">
              <p className="text-xs font-semibold text-amber-900">Logistics: {order.logisticsCompany}</p>
              {order.trackingNumber   && <p className="text-xs text-amber-700">Tracking: <span className="font-mono">{order.trackingNumber}</span></p>}
              {order.expectedDelivery && <p className="text-xs text-amber-700">Expected: {new Date(order.expectedDelivery).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</p>}
            </div>
          )}
        </div>

        {/* ── Actions ── */}
        <div className="flex flex-wrap gap-2 print:hidden">
          {order.status === "PENDING_PAYMENT" && (
            <button
              onClick={cancelOrder}
              disabled={cancelling}
              className="flex items-center gap-1.5 px-4 py-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl hover:bg-red-100 transition-colors disabled:opacity-50"
            >
              {cancelling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
              Cancel Order
            </button>
          )}
          {["COMPLETED", "DELIVERED"].includes(order.status) && (
            <button
              onClick={() => setShowReturn(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm text-orange-700 bg-orange-50 border border-orange-100 rounded-xl hover:bg-orange-100 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Request Return
            </button>
          )}
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-4 py-2 text-sm text-gray-600 bg-stone-100 border border-stone-200 rounded-xl hover:bg-stone-200 transition-colors"
          >
            <Printer className="w-3.5 h-3.5" /> Print Receipt
          </button>
        </div>

        {/* ── Back link ── */}
        <div className="print:hidden">
          <Link href={`/${locale}/shop/orders`}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-amber-600 transition-colors w-fit">
            <ArrowLeft className="w-4 h-4" /> All Orders
          </Link>
        </div>

      </div>

      {/* ── Return modal ── */}
      {showReturn && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="font-bold text-gray-900 mb-2">Request Return</h3>
            <p className="text-xs text-gray-500 mb-3">Describe the reason for your return request.</p>
            <textarea
              value={returnNote}
              onChange={(e) => setReturnNote(e.target.value)}
              rows={3}
              placeholder="Reason for return…"
              className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none mb-3"
            />
            <div className="flex gap-2">
              <button onClick={() => setShowReturn(false)} className="flex-1 py-2.5 text-sm text-gray-600 bg-stone-100 rounded-xl hover:bg-stone-200 transition-colors">Cancel</button>
              <button onClick={requestReturn} disabled={returning} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm text-white bg-amber-500 rounded-xl hover:bg-amber-600 transition-colors disabled:opacity-50">
                {returning && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Submit
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
