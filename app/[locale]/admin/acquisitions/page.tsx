"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus, Pencil, Trash2, Check, X, Loader2, Building2,
  ShoppingCart, PackageCheck, Send, FileText, ChevronDown,
  ChevronUp, Package, BookOpen, ToggleLeft, ToggleRight,
  AlertCircle, RefreshCw, ExternalLink,
} from "lucide-react";
import { useLocale } from "next-intl";
import Link from "next/link";

/* ── Types ──────────────────────────────────────────────────────── */
interface Vendor {
  id: string; name: string; contact: string | null; phone: string | null;
  email: string | null; address: string | null; website: string | null;
  notes: string | null; isActive: boolean;
  _count?: { orders: number };
}

interface POItem {
  id: string; bookId: string | null; title: string; isbn: string | null;
  quantity: number; unitPrice: number; currency: string; received: number;
  notes: string | null;
  book?: { id: string; title: string; coverImage: string | null } | null;
}

interface PurchaseOrder {
  id: string; orderNumber: string; status: POStatus;
  orderDate: string; expectedDate: string | null; receivedDate: string | null;
  subtotal: number; currency: string; notes: string | null;
  vendor: { id: string; name: string };
  items: POItem[];
}

type POStatus = "DRAFT" | "SENT" | "PARTIAL" | "RECEIVED" | "CANCELLED";

interface BookOption { id: string; title: string; isbn: string | null; coverImage: string | null }

const STATUS_META: Record<POStatus, { label: string; cls: string }> = {
  DRAFT:     { label: "Draft",          cls: "bg-gray-100   text-gray-600"   },
  SENT:      { label: "Sent",           cls: "bg-blue-100   text-blue-700"   },
  PARTIAL:   { label: "Partial",        cls: "bg-amber-100  text-amber-700"  },
  RECEIVED:  { label: "Received",       cls: "bg-green-100  text-green-700"  },
  CANCELLED: { label: "Cancelled",      cls: "bg-red-100    text-red-600"    },
};

const STATUS_FLOW: Record<POStatus, POStatus[]> = {
  DRAFT:     ["SENT", "CANCELLED"],
  SENT:      ["PARTIAL", "RECEIVED", "CANCELLED"],
  PARTIAL:   ["RECEIVED", "CANCELLED"],
  RECEIVED:  [],
  CANCELLED: [],
};

/* ── Vendor blank ───────────────────────────────────────────────── */
const BLANK_VENDOR = { name: "", contact: "", phone: "", email: "", address: "", website: "", notes: "" };

/* ── PO item row ────────────────────────────────────────────────── */
type POItemDraftFull = { bookId: string | null; title: string; isbn: string; quantity: number; unitPrice: number; notes: string; currency: string };
interface ItemRowProps {
  item: POItemDraftFull;
  onChange: (patch: Partial<POItemDraftFull>) => void;
  onRemove: () => void;
  books: BookOption[];
}
function ItemRow({ item, onChange, onRemove, books }: ItemRowProps) {
  const [bookSearch, setBookSearch] = useState(item.bookId ? (books.find(b => b.id === item.bookId)?.title ?? "") : "");
  const [showDrop, setShowDrop] = useState(false);
  const filtered = books.filter(b =>
    b.title.toLowerCase().includes(bookSearch.toLowerCase()) ||
    (b.isbn ?? "").includes(bookSearch)
  ).slice(0, 8);

  return (
    <div className="grid grid-cols-12 gap-2 items-start border border-gray-100 rounded-xl p-3 bg-gray-50">
      {/* Book selector (6 cols) */}
      <div className="col-span-6 relative">
        <label className="block text-[10px] font-medium text-gray-500 mb-1">Book / Title</label>
        <input
          type="text"
          value={bookSearch}
          onChange={e => { setBookSearch(e.target.value); setShowDrop(true); onChange({ bookId: null, title: e.target.value }); }}
          onFocus={() => setShowDrop(true)}
          onBlur={() => setTimeout(() => setShowDrop(false), 150)}
          placeholder="Search catalog or type new title…"
          className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {showDrop && filtered.length > 0 && (
          <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
            {filtered.map(b => (
              <button key={b.id} type="button"
                onMouseDown={() => { onChange({ bookId: b.id, title: b.title, isbn: b.isbn ?? "" }); setBookSearch(b.title); setShowDrop(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-blue-50 text-left">
                <BookOpen className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-800 truncate">{b.title}</p>
                  {b.isbn && <p className="text-[10px] text-gray-400 font-mono">{b.isbn}</p>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ISBN (2 cols) */}
      <div className="col-span-2">
        <label className="block text-[10px] font-medium text-gray-500 mb-1">ISBN</label>
        <input type="text" value={item.isbn ?? ""} onChange={e => onChange({ isbn: e.target.value })}
          placeholder="ISBN"
          className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      {/* Qty (1 col) */}
      <div className="col-span-1">
        <label className="block text-[10px] font-medium text-gray-500 mb-1">Qty</label>
        <input type="number" min={1} value={item.quantity} onChange={e => onChange({ quantity: Number(e.target.value) })}
          className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      {/* Price (2 cols) */}
      <div className="col-span-2">
        <label className="block text-[10px] font-medium text-gray-500 mb-1">Unit Price</label>
        <input type="number" min={0} step={0.01} value={item.unitPrice} onChange={e => onChange({ unitPrice: Number(e.target.value) })}
          className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      {/* Remove (1 col) */}
      <div className="col-span-1 flex items-end pb-1 justify-center">
        <button type="button" onClick={onRemove} className="text-gray-300 hover:text-red-500 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

/* ── Main page ───────────────────────────────────────────────────── */
export default function AcquisitionsPage() {
  const locale = useLocale();
  const [tab, setTab] = useState<"orders" | "vendors">("orders");

  /* ── Data ───────────────────────────────────────────────────────── */
  const [orders,   setOrders]   = useState<PurchaseOrder[]>([]);
  const [vendors,  setVendors]  = useState<Vendor[]>([]);
  const [books,    setBooks]    = useState<BookOption[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [statusFilter, setStatusFilter] = useState<POStatus | "">("");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [o, v, b] = await Promise.all([
      fetch("/api/acquisitions/orders").then(r => r.json()),
      fetch("/api/acquisitions/vendors").then(r => r.json()),
      fetch("/api/books?limit=500").then(r => r.json()),
    ]);
    setOrders(Array.isArray(o) ? o : []);
    setVendors(Array.isArray(v) ? v : []);
    const raw = Array.isArray(b) ? b : (Array.isArray(b?.books) ? b.books : []);
    setBooks(raw.map((x: BookOption) => ({ id: x.id, title: x.title, isbn: x.isbn, coverImage: x.coverImage })));
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  /* ── Vendor modal ───────────────────────────────────────────────── */
  const [vModal,   setVModal]   = useState<"create" | "edit" | null>(null);
  const [vForm,    setVForm]    = useState(BLANK_VENDOR);
  const [vEditId,  setVEditId]  = useState<string | null>(null);
  const [vSaving,  setVSaving]  = useState(false);
  const [vErr,     setVErr]     = useState<string | null>(null);
  const [vDelId,   setVDelId]   = useState<string | null>(null);

  function openVendorCreate() { setVForm(BLANK_VENDOR); setVEditId(null); setVErr(null); setVModal("create"); }
  function openVendorEdit(v: Vendor) {
    setVForm({ name: v.name, contact: v.contact ?? "", phone: v.phone ?? "", email: v.email ?? "", address: v.address ?? "", website: v.website ?? "", notes: v.notes ?? "" });
    setVEditId(v.id); setVErr(null); setVModal("edit");
  }
  async function saveVendor() {
    if (!vForm.name.trim()) { setVErr("Name is required"); return; }
    setVSaving(true); setVErr(null);
    const url = vEditId ? `/api/acquisitions/vendors/${vEditId}` : "/api/acquisitions/vendors";
    const res = await fetch(url, { method: vEditId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(vForm) });
    setVSaving(false);
    if (!res.ok) { const d = await res.json().catch(() => ({})); setVErr(d.error ?? "Failed"); return; }
    setVModal(null); fetchAll();
  }
  async function deleteVendor() {
    if (!vDelId) return;
    const res = await fetch(`/api/acquisitions/vendors/${vDelId}`, { method: "DELETE" });
    if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error ?? "Failed to delete"); return; }
    setVDelId(null); fetchAll();
  }
  async function toggleVendor(v: Vendor) {
    await fetch(`/api/acquisitions/vendors/${v.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: !v.isActive }) });
    fetchAll();
  }

  /* ── PO modal ───────────────────────────────────────────────────── */
  type POItemDraft = POItemDraftFull;
  const BLANK_ITEM: POItemDraft = { bookId: null, title: "", isbn: "", quantity: 1, unitPrice: 0, notes: "", currency: "USD" };

  const [poModal,       setPoModal]       = useState(false);
  const [poVendorId,    setPoVendorId]    = useState("");
  const [poExpected,    setPoExpected]    = useState("");
  const [poCurrency,    setPoCurrency]    = useState("USD");
  const [poNotes,       setPoNotes]       = useState("");
  const [poItems,       setPoItems]       = useState<POItemDraft[]>([{ ...BLANK_ITEM }]);
  const [poSaving,      setPoSaving]      = useState(false);
  const [poErr,         setPoErr]         = useState<string | null>(null);

  function openPOCreate() {
    setPoVendorId(""); setPoExpected(""); setPoCurrency("USD"); setPoNotes("");
    setPoItems([{ ...BLANK_ITEM }]); setPoErr(null); setPoModal(true);
  }
  function updateItem(idx: number, patch: Partial<POItemDraft>) {
    setPoItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  }
  async function savePO() {
    if (!poVendorId) { setPoErr("Select a vendor"); return; }
    if (poItems.every(i => !i.title.trim())) { setPoErr("Add at least one item"); return; }
    setPoSaving(true); setPoErr(null);
    const res = await fetch("/api/acquisitions/orders", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vendorId: poVendorId, expectedDate: poExpected || null, currency: poCurrency, notes: poNotes, items: poItems.filter(i => i.title.trim()) }),
    });
    setPoSaving(false);
    if (!res.ok) { const d = await res.json().catch(() => ({})); setPoErr(d.error ?? "Failed"); return; }
    setPoModal(false); fetchAll();
  }

  /* ── PO detail panel ────────────────────────────────────────────── */
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [receiveMode, setReceiveMode] = useState(false);
  const [receiveCounts, setReceiveCounts] = useState<Record<string, number>>({});
  const [receivingBusy, setReceivingBusy] = useState(false);
  const [statusBusy,    setStatusBusy]    = useState(false);

  function openPO(po: PurchaseOrder) {
    setSelectedPO(po);
    setReceiveMode(false);
    setReceiveCounts(Object.fromEntries(po.items.map(i => [i.id, 0])));
  }

  async function advanceStatus(po: PurchaseOrder, next: POStatus) {
    setStatusBusy(true);
    const res = await fetch(`/api/acquisitions/orders/${po.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setStatusBusy(false);
    if (res.ok) { const updated = await res.json(); setSelectedPO(updated); fetchAll(); }
  }

  async function submitReceive() {
    if (!selectedPO) return;
    const items = Object.entries(receiveCounts)
      .map(([itemId, received]) => ({ itemId, received }))
      .filter(x => x.received > 0);
    if (!items.length) return;
    setReceivingBusy(true);
    const res = await fetch(`/api/acquisitions/orders/${selectedPO.id}/receive`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    setReceivingBusy(false);
    if (res.ok) {
      const updated = await res.json();
      setSelectedPO(updated);
      setReceiveMode(false);
      setReceiveCounts(Object.fromEntries(updated.items.map((i: POItem) => [i.id, 0])));
      fetchAll();
    }
  }

  /* ── Filtered orders ────────────────────────────────────────────── */
  const filteredOrders = statusFilter ? orders.filter(o => o.status === statusFilter) : orders;

  const counts = Object.fromEntries(
    (["DRAFT","SENT","PARTIAL","RECEIVED","CANCELLED"] as POStatus[]).map(s => [s, orders.filter(o => o.status === s).length])
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Acquisitions</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage vendors and purchase orders</p>
        </div>
        <div className="flex gap-2">
          {tab === "orders"  && <button onClick={openPOCreate}      className="flex items-center gap-2 px-4 py-2 bg-blue-900 text-white rounded-xl text-sm font-semibold hover:bg-blue-800 transition-colors"><Plus className="w-4 h-4" /> New Order</button>}
          {tab === "vendors" && <button onClick={openVendorCreate}  className="flex items-center gap-2 px-4 py-2 bg-blue-900 text-white rounded-xl text-sm font-semibold hover:bg-blue-800 transition-colors"><Plus className="w-4 h-4" /> New Vendor</button>}
          <button onClick={fetchAll} className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"><RefreshCw className="w-4 h-4" /></button>
          <Link href={`/${locale}/admin/books/acquisition`} className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
            <ExternalLink className="w-4 h-4" /> Demand Intel
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {([["orders","Purchase Orders",ShoppingCart],["vendors","Vendors",Building2]] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === key ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-12 justify-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /> Loading…</div>
      ) : (
        <>
          {/* ════════ ORDERS TAB ════════ */}
          {tab === "orders" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Left: list */}
              <div className="lg:col-span-2 space-y-4">
                {/* Status filter chips */}
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setStatusFilter("")}
                    className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${!statusFilter ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                    All ({orders.length})
                  </button>
                  {(["DRAFT","SENT","PARTIAL","RECEIVED","CANCELLED"] as POStatus[]).map(s => (
                    <button key={s} onClick={() => setStatusFilter(s === statusFilter ? "" : s)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${statusFilter === s ? "ring-2 ring-offset-1 ring-blue-400 " : ""} ${STATUS_META[s].cls}`}>
                      {STATUS_META[s].label} ({counts[s]})
                    </button>
                  ))}
                </div>

                {filteredOrders.length === 0 ? (
                  <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200">
                    <ShoppingCart className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                    <p className="text-sm text-gray-400">No purchase orders yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredOrders.map(po => (
                      <button key={po.id} onClick={() => openPO(po)}
                        className={`w-full text-left bg-white rounded-xl border p-4 hover:shadow-md transition-all ${selectedPO?.id === po.id ? "border-blue-400 shadow-md" : "border-gray-100"}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono font-bold text-sm text-gray-800">{po.orderNumber}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${STATUS_META[po.status].cls}`}>{STATUS_META[po.status].label}</span>
                            </div>
                            <p className="text-sm text-gray-600 mt-0.5">{po.vendor.name}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {po.items.length} item{po.items.length !== 1 ? "s" : ""} · {po.currency} {po.subtotal.toFixed(2)}
                              {po.expectedDate && ` · Expected ${new Date(po.expectedDate).toLocaleDateString()}`}
                            </p>
                          </div>
                          <FileText className="w-4 h-4 text-gray-300 flex-shrink-0 mt-0.5" />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Right: detail panel */}
              <div className="lg:col-span-1">
                {!selectedPO ? (
                  <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200">
                    <FileText className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                    <p className="text-xs text-gray-400">Select an order to view details</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-gray-800">{selectedPO.orderNumber}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${STATUS_META[selectedPO.status].cls}`}>{STATUS_META[selectedPO.status].label}</span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">{selectedPO.vendor.name}</p>
                      <div className="text-xs text-gray-400 mt-1 space-y-0.5">
                        <p>Ordered: {new Date(selectedPO.orderDate).toLocaleDateString()}</p>
                        {selectedPO.expectedDate && <p>Expected: {new Date(selectedPO.expectedDate).toLocaleDateString()}</p>}
                        {selectedPO.receivedDate && <p>Received: {new Date(selectedPO.receivedDate).toLocaleDateString()}</p>}
                      </div>
                    </div>

                    {/* Items */}
                    <div className="px-5 py-3 space-y-2">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Items</p>
                      {selectedPO.items.map(item => (
                        <div key={item.id} className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{item.title}</p>
                            {item.isbn && <p className="text-xs font-mono text-gray-400">{item.isbn}</p>}
                            <p className="text-xs text-gray-500">
                              Qty: {item.quantity} · {item.currency} {item.unitPrice.toFixed(2)}
                              {item.received > 0 && <span className="text-green-600 ml-1">· {item.received} received</span>}
                            </p>
                          </div>
                          {receiveMode && (
                            <input type="number" min={0} max={item.quantity - item.received}
                              value={receiveCounts[item.id] ?? 0}
                              onChange={e => setReceiveCounts(p => ({ ...p, [item.id]: Number(e.target.value) }))}
                              className="w-14 px-2 py-1 border border-gray-300 rounded-lg text-xs text-center focus:outline-none focus:ring-2 focus:ring-green-500" />
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Totals */}
                    <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
                      <div className="flex justify-between text-sm font-semibold text-gray-800">
                        <span>Total</span>
                        <span>{selectedPO.currency} {selectedPO.subtotal.toFixed(2)}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="px-5 py-4 border-t border-gray-100 space-y-2">
                      {/* Status transitions */}
                      {STATUS_FLOW[selectedPO.status].map(next => (
                        <button key={next} onClick={() => advanceStatus(selectedPO, next)} disabled={statusBusy}
                          className={`w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 ${
                            next === "CANCELLED" ? "border border-red-200 text-red-600 hover:bg-red-50"
                            : next === "RECEIVED" ? "bg-green-600 text-white hover:bg-green-700"
                            : "bg-blue-900 text-white hover:bg-blue-800"
                          }`}>
                          {statusBusy ? <Loader2 className="w-4 h-4 animate-spin" /> :
                            next === "SENT"      ? <Send       className="w-4 h-4" /> :
                            next === "RECEIVED"  ? <PackageCheck className="w-4 h-4" /> :
                            next === "CANCELLED" ? <X          className="w-4 h-4" /> :
                            <Package className="w-4 h-4" />}
                          Mark as {STATUS_META[next].label}
                        </button>
                      ))}

                      {/* Receive items */}
                      {(selectedPO.status === "SENT" || selectedPO.status === "PARTIAL") && (
                        receiveMode ? (
                          <div className="space-y-2">
                            <p className="text-xs text-gray-500 text-center">Enter qty received per item above</p>
                            <div className="flex gap-2">
                              <button onClick={() => setReceiveMode(false)} className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                              <button onClick={submitReceive} disabled={receivingBusy || Object.values(receiveCounts).every(v => v === 0)}
                                className="flex-1 flex items-center justify-center gap-2 py-2 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-50">
                                {receivingBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <PackageCheck className="w-4 h-4" />} Confirm
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => setReceiveMode(true)}
                            className="w-full flex items-center justify-center gap-2 py-2 border-2 border-green-300 text-green-700 rounded-xl text-sm font-semibold hover:bg-green-50 transition-colors">
                            <Package className="w-4 h-4" /> Receive Items…
                          </button>
                        )
                      )}
                    </div>

                    {selectedPO.notes && (
                      <div className="px-5 pb-4 text-xs text-gray-500 italic">{selectedPO.notes}</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ════════ VENDORS TAB ════════ */}
          {tab === "vendors" && (
            vendors.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200">
                <Building2 className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-sm text-gray-400">No vendors yet — add your first supplier</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
                <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                    <tr>
                      <th className="text-left px-4 py-3">Vendor</th>
                      <th className="text-left px-4 py-3">Contact</th>
                      <th className="text-center px-4 py-3">Orders</th>
                      <th className="text-center px-4 py-3">Active</th>
                      <th className="px-3 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {vendors.map(v => (
                      <tr key={v.id} className={`hover:bg-gray-50 transition-colors ${!v.isActive ? "opacity-50" : ""}`}>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-gray-800">{v.name}</p>
                          {v.website && <a href={v.website} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline flex items-center gap-0.5">{v.website}<ExternalLink className="w-3 h-3" /></a>}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600 space-y-0.5">
                          {v.contact && <p>{v.contact}</p>}
                          {v.phone   && <p>{v.phone}</p>}
                          {v.email   && <p>{v.email}</p>}
                        </td>
                        <td className="px-4 py-3 text-center font-mono text-gray-600">{v._count?.orders ?? 0}</td>
                        <td className="px-4 py-3 text-center">
                          <button onClick={() => toggleVendor(v)}>
                            {v.isActive ? <ToggleRight className="w-5 h-5 text-green-500 mx-auto" /> : <ToggleLeft className="w-5 h-5 text-gray-300 mx-auto" />}
                          </button>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1 justify-end">
                            <button onClick={() => openVendorEdit(v)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                            <button onClick={() => setVDelId(v.id)}   className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50   rounded-lg transition-colors"><Trash2  className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            )
          )}
        </>
      )}

      {/* ── New PO Modal ──────────────────────────────────────────────── */}
      {poModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
              <h2 className="font-bold text-gray-900 flex items-center gap-2"><ShoppingCart className="w-5 h-5 text-blue-600" /> New Purchase Order</h2>
              <button onClick={() => setPoModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Vendor + dates */}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Vendor <span className="text-red-400">*</span></label>
                  <select value={poVendorId} onChange={e => setPoVendorId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">— Select vendor —</option>
                    {vendors.filter(v => v.isActive).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Expected Delivery</label>
                  <input type="date" value={poExpected} onChange={e => setPoExpected(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Currency</label>
                  <select value={poCurrency} onChange={e => setPoCurrency(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {["USD","KHR","EUR","THB","SGD"].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {/* Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Order Items</p>
                  <button type="button" onClick={() => setPoItems(p => [...p, { ...BLANK_ITEM }])}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
                    <Plus className="w-3.5 h-3.5" /> Add item
                  </button>
                </div>
                <div className="space-y-2">
                  {poItems.map((item, idx) => (
                    <ItemRow key={idx} item={item} books={books}
                      onChange={patch => updateItem(idx, patch)}
                      onRemove={() => setPoItems(p => p.filter((_, i) => i !== idx))} />
                  ))}
                </div>
                <div className="mt-2 flex justify-end text-sm font-semibold text-gray-700">
                  Total: {poCurrency} {poItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0).toFixed(2)}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <textarea rows={2} value={poNotes} onChange={e => setPoNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              {poErr && <div className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{poErr}</div>}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 sticky bottom-0 bg-white">
              <button onClick={() => setPoModal(false)} className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={savePO} disabled={poSaving}
                className="flex items-center gap-2 px-4 py-2 bg-blue-900 text-white rounded-xl text-sm font-semibold hover:bg-blue-800 disabled:opacity-50">
                {poSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Create Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Vendor Modal ─────────────────────────────────────────────── */}
      {vModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">{vModal === "create" ? "New Vendor" : "Edit Vendor"}</h2>
              <button onClick={() => setVModal(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-5 space-y-3">
              {[["name","Name *","text"],["contact","Contact Person","text"],["phone","Phone","tel"],["email","Email","email"],["website","Website","url"]] .map(([k, label, type]) => (
                <div key={k}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                  <input type={type} value={(vForm as Record<string,string>)[k]} onChange={e => setVForm(f => ({ ...f, [k]: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Address</label>
                <textarea rows={2} value={vForm.address} onChange={e => setVForm(f => ({ ...f, address: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <textarea rows={2} value={vForm.notes} onChange={e => setVForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              {vErr && <div className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{vErr}</div>}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setVModal(null)} className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={saveVendor} disabled={vSaving}
                className="flex items-center gap-2 px-4 py-2 bg-blue-900 text-white rounded-xl text-sm font-semibold hover:bg-blue-800 disabled:opacity-50">
                {vSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {vModal === "create" ? "Create Vendor" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Vendor delete confirm ─────────────────────────────────────── */}
      {vDelId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
            <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
            <h3 className="font-bold text-gray-900 mb-1">Delete this vendor?</h3>
            <p className="text-sm text-gray-500 mb-5">Vendors with existing orders cannot be deleted — deactivate them instead.</p>
            <div className="flex gap-3">
              <button onClick={() => setVDelId(null)} className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={deleteVendor} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
