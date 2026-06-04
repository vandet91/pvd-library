"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  ShoppingBag, Check, Truck, Package, X, RefreshCw,
  Loader2, ChevronDown, ChevronUp, AlertCircle,
  MapPin, QrCode, RotateCcw, ArrowRight,
  BookOpen, DollarSign, Store, Search, Plus, Trash2,
  UserCheck, Tag, CreditCard, Banknote, ScanLine,
} from "lucide-react";
import { formatPrice } from "@/lib/price-format";
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
  saleChannel: string;
  deliveryAddress: string | null; paymentMethod: string | null;
  paymentProof: string | null; paymentRef: string | null;
  subtotal: number; taxAmount: number; shippingFee: number; total: number; currency: string;
  logisticsCompany: string | null; trackingNumber: string | null;
  expectedDelivery: string | null; memberNote: string | null; staffNote: string | null;
  cancelReason: string | null; createdAt: string;
  walkInName: string | null; walkInPhone: string | null;
  memberRel: OrderMember | null;
  branch: { id: string; name: string } | null;
  items: OrderItem[];
}
interface StatusCounts { [key: string]: number }

// ── Counter-sale types ─────────────────────────────────────────────────────
interface ForSaleCopy {
  id: string; copyNumber: number; barcode: string | null;
  condition: string; price: number | null;
}
interface ForSaleBook {
  id: string; title: string; isbn: string | null; coverImage: string | null;
  price: number | null; author: { name: string } | null;
  copies: ForSaleCopy[];
}
interface CartItem {
  copyId: string; bookId: string; bookTitle: string;
  copyNumber: number; barcode: string | null;
  unitPrice: number; currency: string;
}
interface MemberHit {
  id: string; memberId: string; name: string;
  email: string | null; phone: string | null;
}

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

const CONDITION_LABEL: Record<string, string> = {
  NEW: "New", GOOD: "Good", FAIR: "Fair", POOR: "Poor", DAMAGED: "Damaged",
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

// Resolve effective unit price: copy-level price → book-level price → 0
function effectivePrice(copy: ForSaleCopy, book: ForSaleBook) {
  return copy.price ?? book.price ?? 0;
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

  // ── Counter sale state ───────────────────────────────────────────────────
  const [showCS,       setShowCS]       = useState(false);
  const [csQuery,      setCsQuery]      = useState("");
  const [csBooks,      setCsBooks]      = useState<ForSaleBook[]>([]);
  const [csSearching,  setCsSearching]  = useState(false);
  const [csCart,       setCsCart]       = useState<CartItem[]>([]);
  const [csCustType,   setCsCustType]   = useState<"member" | "walkin">("walkin");
  const [csMemberQ,    setCsMemberQ]    = useState("");
  const [csMembers,    setCsMembers]    = useState<MemberHit[]>([]);
  const [csMemberSrch, setCsMemberSrch] = useState(false);
  const [csMember,     setCsMember]     = useState<MemberHit | null>(null);
  const [csWalkName,   setCsWalkName]   = useState("");
  const [csWalkPhone,  setCsWalkPhone]  = useState("");
  const [csPayMethod,  setCsPayMethod]  = useState<"cash" | "card_counter" | "qr">("cash");
  const [csCurrency,   setCsCurrency]   = useState("USD");
  const [csTaxRate,    setCsTaxRate]    = useState(0);
  const [csProcessing, setCsProcessing] = useState(false);
  const [csError,      setCsError]      = useState("");
  const [csNote,       setCsNote]       = useState("");

  const csBookTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const csMemberTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pageSize = 20;

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    const group    = TAB_GROUPS[activeTab];
    const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
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

  // ── Book search for counter sale (debounced 350 ms) ─────────────────────
  useEffect(() => {
    if (!showCS) return;
    if (csBookTimer.current) clearTimeout(csBookTimer.current);
    csBookTimer.current = setTimeout(async () => {
      setCsSearching(true);
      const res = await fetch(`/api/admin/sale/books?q=${encodeURIComponent(csQuery)}`);
      const data = await res.json().catch(() => []);
      setCsBooks(Array.isArray(data) ? data : []);
      setCsSearching(false);
    }, 350);
    return () => { if (csBookTimer.current) clearTimeout(csBookTimer.current); };
  }, [csQuery, showCS]);

  // ── Initial book load when modal opens ──────────────────────────────────
  useEffect(() => {
    if (showCS) {
      setCsQuery("");
      setCsBooks([]);
      setCsCart([]);
      setCsMember(null);
      setCsMemberQ("");
      setCsMembers([]);
      setCsWalkName("");
      setCsWalkPhone("");
      setCsPayMethod("cash");
      setCsTaxRate(0);
      setCsError("");
      setCsNote("");
      // Load all for-sale books right away
      fetch("/api/admin/sale/books?q=")
        .then((r) => r.json()).then((d) => setCsBooks(Array.isArray(d) ? d : [])).catch(() => {});
    }
  }, [showCS]);

  // ── Member search (debounced 350 ms) ─────────────────────────────────────
  useEffect(() => {
    if (csCustType !== "member" || !csMemberQ.trim()) { setCsMembers([]); return; }
    if (csMemberTimer.current) clearTimeout(csMemberTimer.current);
    csMemberTimer.current = setTimeout(async () => {
      setCsMemberSrch(true);
      const res = await fetch(`/api/members?q=${encodeURIComponent(csMemberQ)}&limit=6`);
      const data = await res.json().catch(() => ({ members: [] }));
      setCsMembers(Array.isArray(data.members) ? data.members : []);
      setCsMemberSrch(false);
    }, 350);
    return () => { if (csMemberTimer.current) clearTimeout(csMemberTimer.current); };
  }, [csMemberQ, csCustType]);

  // ── Add copy to cart ─────────────────────────────────────────────────────
  function addToCart(book: ForSaleBook, copy: ForSaleCopy) {
    if (csCart.find((c) => c.copyId === copy.id)) return; // already in cart
    setCsCart((prev) => [...prev, {
      copyId:    copy.id,
      bookId:    book.id,
      bookTitle: book.title,
      copyNumber: copy.copyNumber,
      barcode:   copy.barcode,
      unitPrice: effectivePrice(copy, book),
      currency:  csCurrency,
    }]);
  }

  function removeFromCart(copyId: string) {
    setCsCart((prev) => prev.filter((c) => c.copyId !== copyId));
  }

  const csSubtotal  = csCart.reduce((s, i) => s + i.unitPrice, 0);
  const csTaxAmount = csTaxRate > 0 ? csSubtotal * (csTaxRate / 100) : 0;
  const csTotal     = csSubtotal + csTaxAmount;

  // ── Process counter sale ─────────────────────────────────────────────────
  async function processCounterSale() {
    setCsError("");
    if (csCart.length === 0) { setCsError("Add at least one book to the cart."); return; }
    if (csCustType === "member" && !csMember) { setCsError("Select a member or switch to Walk-in."); return; }
    if (csCustType === "walkin" && !csWalkName.trim()) { setCsError("Enter a customer name."); return; }

    setCsProcessing(true);
    const res = await fetch("/api/admin/sale/counter", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        items:         csCart.map((i) => ({ copyId: i.copyId, bookId: i.bookId, unitPrice: i.unitPrice })),
        paymentMethod: csPayMethod,
        currency:      csCurrency,
        taxRate:       csTaxRate,
        ...(csCustType === "member" ? { memberId: csMember!.id } : {}),
        ...(csCustType === "walkin" ? { walkInName: csWalkName.trim(), walkInPhone: csWalkPhone.trim() || undefined } : {}),
        staffNote: csNote.trim() || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setCsProcessing(false);
    if (!res.ok) { setCsError(data.error ?? "Failed to process sale."); return; }
    setShowCS(false);
    fetchOrders();
  }

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

  function tabCount(tab: typeof TAB_GROUPS[0]) {
    if (!tab.statuses.length) return Object.values(statusCounts).reduce((a, b) => a + b, 0);
    return tab.statuses.reduce((a, s) => a + (statusCounts[s] ?? 0), 0);
  }

  // Customer display helper
  function customerName(o: Order) {
    return o.memberRel?.name ?? o.walkInName ?? "Walk-in";
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
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCS(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-xl transition-colors shadow-sm"
          >
            <Store className="w-4 h-4" />
            <span className="hidden sm:inline">Counter Sale</span>
          </button>
          <button onClick={fetchOrders} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <RefreshCw className={`w-4 h-4 text-gray-400 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
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
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                  <tr>
                    {["Order", "Customer", "Items", "Total", "Status", "Date", ""].map((h) => (
                      <th key={h} className="px-4 py-3 text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {orders.map((o) => {
                    const isCounter = o.saleChannel === "COUNTER";
                    return (
                      <tr
                        key={o.id}
                        onClick={() => { setSelected(o); setActionError(""); setShowShipForm(false); setShowCancel(false); setShowRefund(false); }}
                        className={`cursor-pointer hover:bg-gray-50/80 transition-colors ${selected?.id === o.id ? "bg-violet-50/50" : ""}`}
                      >
                        <td className="px-4 py-3">
                          <p className="font-mono text-xs font-semibold text-gray-900">{o.orderNumber}</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            {isCounter
                              ? <span className="text-[10px] text-violet-600 font-medium bg-violet-50 px-1.5 py-0.5 rounded-full">🏪 Counter</span>
                              : <span className="text-[10px] text-gray-400">{o.deliveryType === "PICKUP" ? "📦 Pickup" : "🚚 Delivery"}</span>
                            }
                          </div>
                        </td>
                        <td className="px-4 py-3 max-w-[120px]">
                          <p className="text-xs font-medium text-gray-800 truncate">{customerName(o)}</p>
                          <p className="text-[10px] text-gray-400">
                            {o.memberRel ? o.memberRel.memberId : (isCounter ? "Walk-in" : "—")}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600">{o.items.length}</td>
                        <td className="px-4 py-3 text-xs font-semibold text-gray-900">{formatPrice(o.total, o.currency)}</td>
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
                  <div className="flex items-center gap-2">
                    <p className="font-mono font-bold text-gray-900">{selected.orderNumber}</p>
                    {selected.saleChannel === "COUNTER" && (
                      <span className="text-[10px] font-medium bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">Counter Sale</span>
                    )}
                  </div>
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${STATUS_COLOR[selected.status] ?? ""}`}>
                    {STATUS_LABEL[selected.status]}
                  </span>
                </div>
                <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-gray-100">
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>

              {/* Customer info */}
              <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-0.5">
                {selected.memberRel ? (
                  <>
                    <p className="font-semibold text-gray-900">
                      {selected.memberRel.name}
                      <span className="text-gray-400 ml-1">({selected.memberRel.memberId})</span>
                    </p>
                    {selected.memberRel.email && <p className="text-gray-500">{selected.memberRel.email}</p>}
                    {selected.memberRel.phone && <p className="text-gray-500">📞 {selected.memberRel.phone}</p>}
                  </>
                ) : (
                  <>
                    <p className="font-semibold text-gray-900 flex items-center gap-1">
                      🚶 {selected.walkInName ?? "Walk-in customer"}
                      <span className="text-[10px] bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded-full ml-1">Walk-in</span>
                    </p>
                    {selected.walkInPhone && <p className="text-gray-500">📞 {selected.walkInPhone}</p>}
                  </>
                )}
                {selected.paymentMethod && (
                  <p className="text-gray-400 pt-0.5">
                    Paid via {selected.paymentMethod === "cash" ? "💵 Cash"
                      : selected.paymentMethod === "card_counter" ? "💳 Card"
                      : selected.paymentMethod === "qr" ? "📱 QR"
                      : selected.paymentMethod}
                  </p>
                )}
              </div>

              {/* Items */}
              <div>
                <p className="text-xs font-semibold text-gray-700 mb-2">Books ({selected.items.length})</p>
                <div className="space-y-2">
                  {selected.items.map((item) => (
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
                      <p className="text-xs font-bold text-gray-900">{formatPrice(item.unitPrice, item.currency)}</p>
                    </div>
                  ))}
                </div>
                <div className="border-t border-gray-100 mt-2 pt-2 space-y-0.5 text-xs text-gray-600">
                  {selected.taxAmount > 0 && (
                    <div className="flex justify-between"><span>Tax</span><span>{formatPrice(selected.taxAmount, selected.currency)}</span></div>
                  )}
                  {selected.shippingFee > 0 && (
                    <div className="flex justify-between"><span>Shipping</span><span>{formatPrice(selected.shippingFee, selected.currency)}</span></div>
                  )}
                  <div className="flex justify-between font-bold text-gray-900 border-t border-gray-100 pt-1">
                    <span>Total</span>
                    <span>{formatPrice(selected.total, selected.currency)}</span>
                  </div>
                </div>
              </div>

              {/* Delivery (skip for counter sales) */}
              {selected.saleChannel !== "COUNTER" && (
                <div className="bg-gray-50 rounded-lg p-3 text-xs">
                  <p className="font-semibold text-gray-700 flex items-center gap-1 mb-1">
                    {selected.deliveryType === "PICKUP" ? <><MapPin className="w-3 h-3" />Pickup</> : <><Truck className="w-3 h-3" />Delivery</>}
                  </p>
                  {selected.deliveryType === "PICKUP"
                    ? <p className="text-gray-600">{selected.branch?.name ?? "—"}</p>
                    : <p className="text-gray-600 whitespace-pre-wrap">{selected.deliveryAddress}</p>}
                </div>
              )}

              {/* Payment proof */}
              {selected.paymentProof && (
                <div>
                  <p className="text-xs font-semibold text-gray-700 mb-1">Payment Proof</p>
                  <Image src={selected.paymentProof} alt="Payment proof" width={200} height={160} className="rounded-lg border border-gray-200 object-contain" />
                  {selected.paymentRef && <p className="text-[10px] text-gray-400 mt-1">Ref: {selected.paymentRef}</p>}
                </div>
              )}

              {/* Notes */}
              {selected.memberNote && (
                <div className="bg-amber-50 rounded-lg p-3 text-xs text-amber-800">
                  📝 {selected.memberNote}
                </div>
              )}
              {selected.staffNote && (
                <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-800">
                  🗒️ {selected.staffNote}
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

      {/* ══════════════════════════════════════════════════════════════
          Counter Sale Modal
      ══════════════════════════════════════════════════════════════ */}
      {showCS && (
        <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4 sm:items-center">
          <div className="relative bg-white w-full sm:max-w-4xl sm:rounded-2xl shadow-2xl flex flex-col max-h-screen sm:max-h-[90vh] overflow-hidden">

            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
                  <Store className="w-4 h-4 text-violet-600" />
                </div>
                <div>
                  <h2 className="font-bold text-gray-900 text-base">Counter Sale</h2>
                  <p className="text-[11px] text-gray-400">Process a walk-in purchase at the library counter</p>
                </div>
              </div>
              <button onClick={() => setShowCS(false)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {/* Modal body — two columns on md+ */}
            <div className="flex flex-col md:flex-row flex-1 overflow-hidden min-h-0">

              {/* ── Left: Book search + results ────────────────────── */}
              <div className="md:w-[55%] flex flex-col border-b md:border-b-0 md:border-r border-gray-100 overflow-hidden">
                {/* Search bar */}
                <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
                  <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
                    {csSearching
                      ? <Loader2 className="w-4 h-4 text-gray-400 animate-spin flex-shrink-0" />
                      : <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                    <input
                      autoFocus
                      value={csQuery}
                      onChange={(e) => setCsQuery(e.target.value)}
                      placeholder="Search books for sale — title, ISBN, author…"
                      className="flex-1 bg-transparent text-sm outline-none placeholder-gray-400"
                    />
                    {csQuery && (
                      <button onClick={() => setCsQuery("")} className="text-gray-400 hover:text-gray-600">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Book list */}
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                  {csBooks.length === 0 && !csSearching && (
                    <div className="text-center py-10">
                      <BookOpen className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                      <p className="text-xs text-gray-400">
                        {csQuery ? "No FOR_SALE books match your search." : "No books are currently marked for sale."}
                      </p>
                    </div>
                  )}
                  {csBooks.map((book) => (
                    <div key={book.id} className="border border-gray-100 rounded-xl overflow-hidden">
                      {/* Book header */}
                      <div className="flex items-center gap-3 px-3 py-2.5 bg-gray-50">
                        <div className="w-8 h-10 bg-violet-100 rounded flex items-center justify-center flex-shrink-0 overflow-hidden">
                          {book.coverImage
                            ? <Image src={book.coverImage} alt="" width={32} height={40} className="object-cover w-full h-full" />
                            : <BookOpen className="w-4 h-4 text-violet-300" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-900 truncate">{book.title}</p>
                          <p className="text-[10px] text-gray-400">
                            {book.author?.name}{book.isbn ? ` · ${book.isbn}` : ""}
                          </p>
                        </div>
                        <p className="text-[10px] text-violet-600 font-medium flex-shrink-0">
                          {book.copies.length} copy{book.copies.length !== 1 ? " " : ""}
                        </p>
                      </div>
                      {/* Copies */}
                      <div className="divide-y divide-gray-50">
                        {book.copies.map((copy) => {
                          const inCart   = csCart.some((c) => c.copyId === copy.id);
                          const price    = effectivePrice(copy, book);
                          return (
                            <div key={copy.id}
                              className={`flex items-center gap-3 px-3 py-2 transition-colors ${inCart ? "bg-violet-50" : "hover:bg-gray-50/80"}`}>
                              <div className="flex-1 min-w-0">
                                <span className="text-[11px] text-gray-700">
                                  Copy #{copy.copyNumber}
                                  {copy.barcode ? <span className="text-gray-400"> · {copy.barcode}</span> : null}
                                  <span className="ml-1.5 text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                                    {CONDITION_LABEL[copy.condition] ?? copy.condition}
                                  </span>
                                </span>
                              </div>
                              <p className="text-xs font-bold text-gray-900 flex-shrink-0">
                                {price > 0 ? formatPrice(price, csCurrency) : <span className="text-gray-400 font-normal">No price</span>}
                              </p>
                              <button
                                onClick={() => addToCart(book, copy)}
                                disabled={inCart}
                                className={`flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-lg transition-colors flex-shrink-0 ${
                                  inCart
                                    ? "bg-violet-100 text-violet-600 cursor-default"
                                    : "bg-violet-600 hover:bg-violet-700 text-white"
                                }`}
                              >
                                {inCart ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                                {inCart ? "Added" : "Add"}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Right: Cart + Customer + Payment ───────────────── */}
              <div className="md:w-[45%] flex flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

                  {/* Cart */}
                  <div>
                    <p className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5" /> Cart
                      {csCart.length > 0 && <span className="bg-violet-600 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">{csCart.length}</span>}
                    </p>
                    {csCart.length === 0 ? (
                      <div className="border-2 border-dashed border-gray-200 rounded-xl py-6 text-center">
                        <ShoppingBag className="w-6 h-6 text-gray-300 mx-auto mb-1" />
                        <p className="text-xs text-gray-400">Add books from the left panel</p>
                      </div>
                    ) : (
                      <div className="border border-gray-100 rounded-xl overflow-hidden">
                        {csCart.map((item) => (
                          <div key={item.copyId} className="flex items-center gap-2.5 px-3 py-2.5 border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-gray-900 truncate">{item.bookTitle}</p>
                              <p className="text-[10px] text-gray-400">Copy #{item.copyNumber}{item.barcode ? ` · ${item.barcode}` : ""}</p>
                            </div>
                            <p className="text-xs font-bold text-gray-900 flex-shrink-0">
                              {formatPrice(item.unitPrice, item.currency)}
                            </p>
                            <button onClick={() => removeFromCart(item.copyId)}
                              className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors flex-shrink-0">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                        {/* Totals */}
                        <div className="bg-gray-50 px-3 py-2.5 space-y-1 text-xs text-gray-600">
                          <div className="flex justify-between"><span>Subtotal</span><span>{formatPrice(csSubtotal, csCurrency)}</span></div>
                          {csTaxAmount > 0 && <div className="flex justify-between"><span>Tax ({csTaxRate}%)</span><span>{formatPrice(csTaxAmount, csCurrency)}</span></div>}
                          <div className="flex justify-between font-bold text-gray-900 border-t border-gray-200 pt-1">
                            <span>Total</span><span>{formatPrice(csTotal, csCurrency)}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Customer */}
                  <div>
                    <p className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                      <UserCheck className="w-3.5 h-3.5" /> Customer
                    </p>
                    {/* Toggle */}
                    <div className="flex rounded-lg overflow-hidden border border-gray-200 text-xs mb-3">
                      <button
                        onClick={() => setCsCustType("walkin")}
                        className={`flex-1 py-2 font-medium transition-colors ${csCustType === "walkin" ? "bg-violet-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}
                      >
                        🚶 Walk-in
                      </button>
                      <button
                        onClick={() => { setCsCustType("member"); setCsMember(null); }}
                        className={`flex-1 py-2 font-medium transition-colors ${csCustType === "member" ? "bg-violet-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}
                      >
                        👤 Member
                      </button>
                    </div>

                    {csCustType === "walkin" ? (
                      <div className="space-y-2">
                        <input
                          value={csWalkName}
                          onChange={(e) => setCsWalkName(e.target.value)}
                          placeholder="Customer name *"
                          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500"
                        />
                        <input
                          value={csWalkPhone}
                          onChange={(e) => setCsWalkPhone(e.target.value)}
                          placeholder="Phone (optional)"
                          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500"
                        />
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {csMember ? (
                          <div className="flex items-center gap-2.5 bg-violet-50 border border-violet-200 rounded-xl px-3 py-2.5">
                            <div className="w-7 h-7 rounded-full bg-violet-200 flex items-center justify-center flex-shrink-0 text-violet-700 text-xs font-bold">
                              {csMember.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-gray-900 truncate">{csMember.name}</p>
                              <p className="text-[10px] text-gray-500">{csMember.memberId}{csMember.email ? ` · ${csMember.email}` : ""}</p>
                            </div>
                            <button onClick={() => setCsMember(null)} className="p-1 rounded hover:bg-violet-200 text-violet-400">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="relative">
                            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
                              {csMemberSrch
                                ? <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin flex-shrink-0" />
                                : <Search className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
                              <input
                                value={csMemberQ}
                                onChange={(e) => setCsMemberQ(e.target.value)}
                                placeholder="Search by name, email, member ID…"
                                className="flex-1 bg-transparent text-xs outline-none placeholder-gray-400"
                              />
                            </div>
                            {csMembers.length > 0 && (
                              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 overflow-hidden">
                                {csMembers.map((m) => (
                                  <button
                                    key={m.id}
                                    onClick={() => { setCsMember(m); setCsMemberQ(""); setCsMembers([]); }}
                                    className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-violet-50 text-left transition-colors border-b border-gray-50 last:border-0"
                                  >
                                    <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 text-gray-600 text-[10px] font-bold">
                                      {m.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-xs font-medium text-gray-900 truncate">{m.name}</p>
                                      <p className="text-[10px] text-gray-400">{m.memberId}{m.email ? ` · ${m.email}` : ""}</p>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Payment method */}
                  <div>
                    <p className="text-xs font-semibold text-gray-700 mb-2">Payment Method</p>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { v: "cash",         label: "Cash",  icon: Banknote },
                        { v: "card_counter", label: "Card",  icon: CreditCard },
                        { v: "qr",           label: "QR",    icon: ScanLine },
                      ] as { v: "cash" | "card_counter" | "qr"; label: string; icon: React.ElementType }[]).map(({ v, label, icon: Icon }) => (
                        <button key={v} onClick={() => setCsPayMethod(v)}
                          className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-medium transition-colors ${
                            csPayMethod === v
                              ? "bg-violet-600 border-violet-600 text-white"
                              : "border-gray-200 text-gray-600 hover:border-violet-300 hover:bg-violet-50"
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Tax rate + Currency */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Tax Rate (%)</label>
                      <input
                        type="number" min={0} max={100} step={0.5}
                        value={csTaxRate}
                        onChange={(e) => setCsTaxRate(parseFloat(e.target.value) || 0)}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Currency</label>
                      <input
                        value={csCurrency}
                        onChange={(e) => setCsCurrency(e.target.value.toUpperCase())}
                        placeholder="USD"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs uppercase focus:outline-none focus:ring-2 focus:ring-violet-500"
                      />
                    </div>
                  </div>

                  {/* Staff note */}
                  <div>
                    <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Staff Note (optional)</label>
                    <textarea
                      value={csNote}
                      onChange={(e) => setCsNote(e.target.value)}
                      rows={2}
                      placeholder="Internal note for this sale…"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                  </div>

                  {csError && (
                    <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5 text-xs text-red-700">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> {csError}
                    </div>
                  )}
                </div>

                {/* Process button — pinned at bottom */}
                <div className="flex-shrink-0 px-4 py-3 border-t border-gray-100 bg-white">
                  <button
                    onClick={processCounterSale}
                    disabled={csProcessing || csCart.length === 0}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm"
                  >
                    {csProcessing
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</>
                      : <><Check className="w-4 h-4" /> Process Sale · {formatPrice(csTotal, csCurrency)}</>
                    }
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
