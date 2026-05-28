"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ShoppingBag, Check, Truck, Package, X, RefreshCw,
  Loader2, ChevronDown, ChevronUp, AlertCircle,
  MapPin, QrCode, RotateCcw, Eye, ArrowRight,
  BookOpen, DollarSign,
} from "lucide-react";
import Image from "next/image";

// ── Types ──────────────────────────────────────────────────────────────────
interface OrderMember { id: string; memberId: string; name: string; email: string | null; phone: string | null }
interface OrderItem {
  id: string; unitPrice: number; currency: string;
  book: { title: string; coverImage: string | null; author: { name: string } | null };
  copy: { copyNumber: number; barcode: string | null };
}
interface Order {
  id: string; orderNumber: string; status: string; deliveryType: string;
  deliveryAddress: string | null; paymentMethod: string | null;
  paymentProof: string | null; paymentRef: string | null;
  subtotal: number; shippingFee: number; total: number; currency: string;
  logisticsCompany: string | null; trackingNumber: string | null;
  expectedDelivery: string | null; memberNote: string | null; staffNote: string | null;
  cancelReason: string | null; createdAt: string;
  memberRel: OrderMember;
  branch: { id: string; name: string } | null;
  items: OrderItem[];
}
interface StatusCounts { [key: string]: number }

// ── Helpers ────────────────────────────────────────────────────────────────
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
  RETURN_REQUESTED:  "bg-orange-50 text-orange-700 border-orange-200",
  RETURNED:          "bg-gray-100 text-gray-600 border-gray-200",
  REFUNDED:          "bg-emerald-50 text-emerald-700 border-emerald-200",
};

// Tab groups
const TAB_GROUPS: { label: string; statuses: string[] }[] = [
  { label: "All",            statuses: [] },
  { label: "Needs Action",   statuses: ["PAYMENT_SUBMITTED", "RETURN_REQUESTED"] },
  { label: "In Progress",    statuses: ["PAYMENT_CONFIRMED", "PREPARING", "READY_FOR_PICKUP", "SHIPPED"] },
  { label: "Completed",      statuses: ["COMPLETED", "DELIVERED"] },
  { label: "Cancelled",      statuses: ["CANCELLED", "RETURNED", "REFUNDED"] },
];

function fmt(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ── Main ───────────────────────────────────────────────────────────────────
export default function AdminOrdersPage() {
  const [orders,       setOrders]       = useState<Order[]>([]);
  const [statusCounts, setStatusCounts] = useState<StatusCounts>({});
  const [total,        setTotal]        = useState(0);
  const [page,         setPage]         = useState(1);
  const [activeTab,    setActiveTab]    = useState(0);
  const [loading,      setLoading]      = useState(true);
  const [selected,     setSelected]     = useState<Order | null>(null);
  const [acting,       setActing]       = useState(false);
  const [actionError,  setActionError]  = useState("");

  // Ship form
  const [shipCompany,  setShipCompany]  = useState("");
  const [shipTracking, setShipTracking] = useState("");
  const [shipExpected, setShipExpected] = useState("");
  const [staffNote,    setStaffNote]    = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [showShipForm, setShowShipForm] = useState(false);
  const [showCancel,   setShowCancel]   = useState(false);
  const [showRefund,   setShowRefund]   = useState(false);
  const [refundNote,   setRefundNote]   = useState("");

  const pageSize = 20;

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    const group    = TAB_GROUPS[activeTab];
    const statusQs = group.statuses.length
      ? group.statuses.map((s) => `status=${s}`).join("&")
      : "";
    const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    // For multi-status filter we pass first one only (API supports one status at a time)
    // For simplicity, fetch all when 'Needs Action' has 2 statuses
    let url = `/api/admin/sale/orders?${qs}`;
    if (group.statuses.length === 1) url += `&status=${group.statuses[0]}`;

    const res  = await fetch(url);
    const data = await res.json();
    let allOrders = data.orders ?? [];

    // Client-side filter for multi-status tabs
    if (group.statuses.length > 1) {
      allOrders = allOrders.filter((o: Order) => group.statuses.includes(o.status));
    }

    setOrders(allOrders);
    setTotal(data.total ?? 0);
    setStatusCounts(data.statusCounts ?? {});
    setLoading(false);
  }, [page, activeTab]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // ── Action helper ────────────────────────────────────────────────────────
  async function act(orderId: string, action: string, extra: Record<string, string> = {}) {
    setActing(true); setActionError("");
    const res = await fetch(`/api/admin/sale/orders/${orderId}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ action, ...extra }),
    });
    const data = await res.json();
    if (!res.ok) { setActionError(data.error ?? "Action failed"); setActing(false); return; }
    setSelected(data);
    setActing(false);
    setShowShipForm(false); setShowCancel(false); setShowRefund(false);
    fetchOrders();
  }

  const totalPages = Math.ceil(total / pageSize);

  // ── Tab badge count ──────────────────────────────────────────────────────
  function tabCount(tab: typeof TAB_GROUPS[0]) {
    if (!tab.statuses.length) return Object.values(statusCounts).reduce((a, b) => a + b, 0);
    return tab.statuses.reduce((a, s) => a + (statusCounts[s] ?? 0), 0);
  }

  return (
    <div className="space-y-5">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
            <ShoppingBag className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Sale Orders</h1>
            <p className="text-xs text-gray-400">Manage member book purchases</p>
          </div>
        </div>
        <button onClick={fetchOrders} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <RefreshCw className={`w-4 h-4 text-gray-400 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* ── Status summary ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Needs Payment",  keys: ["PENDING_PAYMENT", "PAYMENT_SUBMITTED"], color: "amber",  icon: QrCode },
          { label: "In Preparation", keys: ["PAYMENT_CONFIRMED", "PREPARING"],        color: "indigo", icon: Package },
          { label: "In Transit",     keys: ["READY_FOR_PICKUP", "SHIPPED"],           color: "violet", icon: Truck },
          { label: "Returns",        keys: ["RETURN_REQUESTED", "RETURNED"],           color: "orange", icon: RotateCcw },
        ].map(({ label, keys, color, icon: Icon }) => {
          const count = keys.reduce((a, k) => a + (statusCounts[k] ?? 0), 0);
          return (
            <div key={label} className="bg-white rounded-xl border border-gray-100 p-3.5 shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-gray-500">{label}</p>
                <div className={`w-7 h-7 rounded-lg bg-${color}-100 flex items-center justify-center`}>
                  <Icon className={`w-3.5 h-3.5 text-${color}-600`} />
                </div>
              </div>
              <p className="text-2xl font-bold text-gray-900">{count}</p>
            </div>
          );
        })}
      </div>

      {/* ── Main panel ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-gray-100 overflow-x-auto">
          {TAB_GROUPS.map((tab, i) => {
            const count = tabCount(tab);
            return (
              <button
                key={tab.label}
                onClick={() => { setActiveTab(i); setPage(1); }}
                className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === i
                    ? "border-violet-600 text-violet-700"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {tab.label}
                {count > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    activeTab === i ? "bg-violet-100 text-violet-700" : "bg-gray-100 text-gray-500"
                  }`}>{count}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Table + Detail side-by-side */}
        <div className={`flex ${selected ? "divide-x divide-gray-100" : ""}`}>
          {/* Order list */}
          <div className={selected ? "w-1/2 overflow-x-auto" : "w-full overflow-x-auto"}>
            {loading ? (
              <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin" /> Loading…
              </div>
            ) : orders.length === 0 ? (
              <div className="py-16 text-center">
                <ShoppingBag className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No orders in this category</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {["Order", "Member", "Items", "Total", "Status", "Date", ""].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {orders.map((o) => {
                    const currSym = o.currency === "USD" ? "$" : o.currency + " ";
                    return (
                      <tr
                        key={o.id}
                        onClick={() => { setSelected(o); setActionError(""); setShowShipForm(false); setShowCancel(false); setShowRefund(false); }}
                        className={`cursor-pointer hover:bg-gray-50/80 transition-colors ${selected?.id === o.id ? "bg-violet-50/50" : ""}`}
                      >
                        <td className="px-4 py-3">
                          <p className="font-mono text-xs font-semibold text-gray-900">{o.orderNumber}</p>
                          <p className="text-[10px] text-gray-400">{o.deliveryType === "PICKUP" ? "📦 Pickup" : "🚚 Delivery"}</p>
                        </td>
                        <td className="px-4 py-3 max-w-[120px]">
                          <p className="text-xs font-medium text-gray-800 truncate">{o.memberRel.name}</p>
                          <p className="text-[10px] text-gray-400">{o.memberRel.memberId}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600">{o.items.length}</td>
                        <td className="px-4 py-3 text-xs font-semibold text-gray-900">{currSym}{o.total.toFixed(2)}</td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${STATUS_COLOR[o.status] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
                            {STATUS_LABEL[o.status] ?? o.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{fmt(o.createdAt)}</td>
                        <td className="px-4 py-3">
                          <ArrowRight className="w-3.5 h-3.5 text-gray-300" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                <p className="text-xs text-gray-400">Page {page} of {totalPages}</p>
                <div className="flex gap-1">
                  <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">
                    <ChevronUp className="w-3.5 h-3.5 rotate-90 inline" /> Prev
                  </button>
                  <button disabled={page === totalPages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">
                    Next <ChevronDown className="w-3.5 h-3.5 -rotate-90 inline" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Order Detail Panel ─────────────────────────────────── */}
          {selected && (
            <div className="w-1/2 p-5 overflow-y-auto max-h-[75vh] space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-mono font-bold text-gray-900">{selected.orderNumber}</p>
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${STATUS_COLOR[selected.status] ?? ""}`}>
                    {STATUS_LABEL[selected.status]}
                  </span>
                </div>
                <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-gray-100">
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>

              {/* Member */}
              <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-0.5">
                <p className="font-semibold text-gray-900">{selected.memberRel.name} <span className="text-gray-400">({selected.memberRel.memberId})</span></p>
                {selected.memberRel.email && <p className="text-gray-500">{selected.memberRel.email}</p>}
                {selected.memberRel.phone && <p className="text-gray-500">📞 {selected.memberRel.phone}</p>}
              </div>

              {/* Items */}
              <div>
                <p className="text-xs font-semibold text-gray-700 mb-2">Books ({selected.items.length})</p>
                <div className="space-y-2">
                  {selected.items.map((item) => {
                    const currSym = item.currency === "USD" ? "$" : item.currency + " ";
                    return (
                      <div key={item.id} className="flex items-center gap-2.5">
                        <div className="w-9 h-11 bg-violet-50 rounded flex items-center justify-center flex-shrink-0 overflow-hidden">
                          {item.book.coverImage
                            ? <Image src={item.book.coverImage} alt="" width={36} height={44} className="object-cover w-full h-full rounded" />
                            : <BookOpen className="w-4 h-4 text-violet-300" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-900 truncate">{item.book.title}</p>
                          <p className="text-[10px] text-gray-400">Copy #{item.copy.copyNumber}{item.copy.barcode ? ` · ${item.copy.barcode}` : ""}</p>
                        </div>
                        <p className="text-xs font-bold text-gray-900">{currSym}{item.unitPrice.toFixed(2)}</p>
                      </div>
                    );
                  })}
                </div>
                <div className="border-t border-gray-100 mt-2 pt-2 flex justify-between text-xs font-bold text-gray-900">
                  <span>Total</span>
                  <span>{selected.currency === "USD" ? "$" : selected.currency + " "}{selected.total.toFixed(2)}</span>
                </div>
              </div>

              {/* Delivery */}
              <div className="bg-gray-50 rounded-lg p-3 text-xs">
                <p className="font-semibold text-gray-700 flex items-center gap-1 mb-1">
                  {selected.deliveryType === "PICKUP" ? <><MapPin className="w-3 h-3" />Pickup</> : <><Truck className="w-3 h-3" />Delivery</>}
                </p>
                {selected.deliveryType === "PICKUP"
                  ? <p className="text-gray-600">{selected.branch?.name ?? "—"}</p>
                  : <p className="text-gray-600 whitespace-pre-wrap">{selected.deliveryAddress}</p>}
              </div>

              {/* Payment proof */}
              {selected.paymentProof && (
                <div>
                  <p className="text-xs font-semibold text-gray-700 mb-1">Payment Proof</p>
                  <Image src={selected.paymentProof} alt="Payment proof" width={200} height={160} className="rounded-lg border border-gray-200 object-contain" />
                  {selected.paymentRef && <p className="text-[10px] text-gray-400 mt-1">Ref: {selected.paymentRef}</p>}
                </div>
              )}

              {/* Member note */}
              {selected.memberNote && (
                <div className="bg-amber-50 rounded-lg p-3 text-xs text-amber-800">
                  📝 {selected.memberNote}
                </div>
              )}

              {/* Logistics info */}
              {selected.logisticsCompany && (
                <div className="bg-violet-50 rounded-lg p-3 text-xs space-y-0.5">
                  <p className="font-medium text-violet-900">🚚 {selected.logisticsCompany}</p>
                  {selected.trackingNumber && <p className="text-violet-700 font-mono">{selected.trackingNumber}</p>}
                  {selected.expectedDelivery && <p className="text-violet-600">Expected: {new Date(selected.expectedDelivery).toLocaleDateString()}</p>}
                </div>
              )}

              {actionError && (
                <div className="flex items-center gap-2 text-red-600 text-xs bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {actionError}
                </div>
              )}

              {/* ── Action Buttons ──────────────────────────────────── */}
              <div className="space-y-2">

                {selected.status === "PAYMENT_SUBMITTED" && (
                  <button onClick={() => act(selected.id, "confirm_payment")} disabled={acting}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium">
                    {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Confirm Payment
                  </button>
                )}

                {selected.status === "PAYMENT_CONFIRMED" && (
                  <button onClick={() => act(selected.id, "prepare")} disabled={acting}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium">
                    {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />} Mark as Preparing
                  </button>
                )}

                {selected.status === "PREPARING" && selected.deliveryType === "PICKUP" && (
                  <button onClick={() => act(selected.id, "ready_for_pickup")} disabled={acting}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 disabled:opacity-50 font-medium">
                    {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />} Ready for Pickup
                  </button>
                )}

                {selected.status === "READY_FOR_PICKUP" && (
                  <button onClick={() => act(selected.id, "complete")} disabled={acting}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium">
                    {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Mark Collected / Complete
                  </button>
                )}

                {selected.status === "PREPARING" && selected.deliveryType === "DELIVERY" && !showShipForm && (
                  <button onClick={() => setShowShipForm(true)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700 font-medium">
                    <Truck className="w-4 h-4" /> Mark as Shipped
                  </button>
                )}

                {showShipForm && (
                  <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 space-y-2">
                    <p className="text-xs font-semibold text-violet-900">Shipment Details</p>
                    <input value={shipCompany} onChange={(e) => setShipCompany(e.target.value)} placeholder="Logistics company *" className="w-full border border-violet-200 rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-violet-500" />
                    <input value={shipTracking} onChange={(e) => setShipTracking(e.target.value)} placeholder="Tracking number (optional)" className="w-full border border-violet-200 rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-violet-500" />
                    <input type="date" value={shipExpected} onChange={(e) => setShipExpected(e.target.value)} className="w-full border border-violet-200 rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-violet-500" />
                    <input value={staffNote} onChange={(e) => setStaffNote(e.target.value)} placeholder="Staff note (optional)" className="w-full border border-violet-200 rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-violet-500" />
                    <div className="flex gap-2">
                      <button onClick={() => setShowShipForm(false)} className="flex-1 py-2 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                      <button onClick={() => act(selected.id, "ship", { logisticsCompany: shipCompany, trackingNumber: shipTracking, expectedDelivery: shipExpected, staffNote })} disabled={acting}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50 font-medium">
                        {acting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Truck className="w-3.5 h-3.5" />} Ship
                      </button>
                    </div>
                  </div>
                )}

                {selected.status === "SHIPPED" && (
                  <button onClick={() => act(selected.id, "complete")} disabled={acting}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium">
                    {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Mark Delivered / Complete
                  </button>
                )}

                {selected.status === "RETURN_REQUESTED" && (
                  <>
                    <button onClick={() => act(selected.id, "approve_return")} disabled={acting}
                      className="w-full flex items-center justify-center gap-2 py-2.5 bg-orange-600 text-white text-sm rounded-lg hover:bg-orange-700 disabled:opacity-50 font-medium">
                      {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />} Approve Return
                    </button>
                    {!showRefund && (
                      <button onClick={() => setShowRefund(true)}
                        className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 font-medium">
                        <DollarSign className="w-4 h-4" /> Process Refund
                      </button>
                    )}
                  </>
                )}

                {selected.status === "RETURNED" && !showRefund && (
                  <button onClick={() => setShowRefund(true)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 font-medium">
                    <DollarSign className="w-4 h-4" /> Process Refund
                  </button>
                )}

                {showRefund && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-2">
                    <p className="text-xs font-semibold text-emerald-900">Refund Details</p>
                    <textarea value={refundNote} onChange={(e) => setRefundNote(e.target.value)} rows={2} placeholder="Refund note — method, amount, reference…" className="w-full border border-emerald-200 rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none" />
                    <div className="flex gap-2">
                      <button onClick={() => setShowRefund(false)} className="flex-1 py-2 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg">Cancel</button>
                      <button onClick={() => act(selected.id, "refund", { refundNote })} disabled={acting}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 font-medium">
                        {acting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Confirm Refund
                      </button>
                    </div>
                  </div>
                )}

                {/* Cancel — available at any non-terminal state */}
                {!["CANCELLED", "COMPLETED", "REFUNDED", "RETURNED"].includes(selected.status) && !showCancel && (
                  <button onClick={() => setShowCancel(true)} className="w-full flex items-center justify-center gap-2 py-2 text-sm text-red-600 bg-red-50 rounded-lg hover:bg-red-100 font-medium">
                    <X className="w-4 h-4" /> Cancel Order
                  </button>
                )}

                {showCancel && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2">
                    <input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Reason for cancellation *" className="w-full border border-red-200 rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-red-500" />
                    <div className="flex gap-2">
                      <button onClick={() => setShowCancel(false)} className="flex-1 py-2 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg">Back</button>
                      <button onClick={() => act(selected.id, "cancel", { cancelReason })} disabled={acting || !cancelReason.trim()}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium">
                        {acting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />} Confirm Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
