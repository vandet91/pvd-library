"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Package, ArrowRightLeft, TrendingDown, ShoppingBag,
  BookOpen, CheckCircle2, ChevronDown, ChevronUp,
  Loader2, AlertCircle, Filter, RefreshCw, X,
  Download, Upload, ArrowRight, Warehouse,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────
interface StockSummary {
  inStock:      number;
  forSale:      number;
  available:    number;
  totalCopies:  number;
}

interface Movement {
  id:          string;
  type:        string;
  fromStatus:  string | null;
  toStatus:    string;
  source:      string | null;
  reference:   string | null;
  unitCost:    number | null;
  currency:    string | null;
  notes:       string | null;
  actorName:   string | null;
  createdAt:   string;
  copy: { id: string; copyNumber: number; barcode: string | null };
  book: { id: string; title: string; isbn: string | null; author: { name: string } | null };
  fromBranch:  { id: string; name: string } | null;
  toBranch:    { id: string; name: string } | null;
}

interface Branch {
  id: string; name: string; isActive: boolean;
}

interface StockCopy {
  id: string; copyNumber: number; barcode: string | null;
  condition: string; price: number | null; notes: string | null;
  bookId: string;
  book: { id: string; title: string; isbn: string | null; author: { name: string } | null };
}

// ── Helpers ────────────────────────────────────────────────────────────────
const TYPE_LABEL: Record<string, { label: string; color: string }> = {
  RECEIVED:           { label: "Received",         color: "bg-emerald-100 text-emerald-700" },
  DEPLOYED:           { label: "Deployed",          color: "bg-blue-100 text-blue-700"      },
  DEPLOYED_FOR_SALE:  { label: "For Sale",          color: "bg-violet-100 text-violet-700"  },
  TRANSFERRED:        { label: "Transferred",       color: "bg-amber-100 text-amber-700"    },
  RETURNED_TO_STOCK:  { label: "Back to Stock",     color: "bg-orange-100 text-orange-700"  },
  WITHDRAWN:          { label: "Withdrawn",         color: "bg-red-100 text-red-700"        },
  STATUS_CHANGE:      { label: "Status Change",     color: "bg-gray-100 text-gray-600"      },
  SOLD:               { label: "Sold",              color: "bg-pink-100 text-pink-700"      },
  SALE_RETURNED:      { label: "Sale Returned",     color: "bg-teal-100 text-teal-700"      },
};

const SOURCE_LABEL: Record<string, string> = {
  PURCHASE:  "Purchase",
  DONATION:  "Donation",
  TRANSFER:  "Transfer",
  RETURN:    "Return",
  MANUAL:    "Manual",
};

function fmt(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function StockPage() {
  const [summary,      setSummary]      = useState<StockSummary | null>(null);
  const [movements,    setMovements]    = useState<Movement[]>([]);
  const [total,        setTotal]        = useState(0);
  const [page,         setPage]         = useState(1);
  const [typeFilter,   setTypeFilter]   = useState("");
  const [loading,      setLoading]      = useState(true);
  const [branches,     setBranches]     = useState<Branch[]>([]);

  // in-stock copies for Deploy modal
  const [stockCopies,  setStockCopies]  = useState<StockCopy[]>([]);
  const [stockLoading, setStockLoading] = useState(false);

  // Modals
  const [showDeploy,   setShowDeploy]   = useState(false);
  const [showReceive,  setShowReceive]  = useState(false);

  // Deploy form state
  const [selected,     setSelected]     = useState<Set<string>>(new Set());
  const [deployBranch, setDeployBranch] = useState("");
  const [deployTarget, setDeployTarget] = useState<"AVAILABLE" | "FOR_SALE">("AVAILABLE");
  const [deployNotes,  setDeployNotes]  = useState("");
  const [deploying,    setDeploying]    = useState(false);
  const [deployErr,    setDeployErr]    = useState("");

  // Receive-back form state
  const [receiveIds,   setReceiveIds]   = useState("");
  const [recSource,    setRecSource]    = useState("MANUAL");
  const [recRef,       setRecRef]       = useState("");
  const [recNotes,     setRecNotes]     = useState("");
  const [receiving,    setReceiving]    = useState(false);
  const [receiveErr,   setReceiveErr]   = useState("");

  const pageSize = 30;

  // ── Fetch movements & summary ──────────────────────────────────────────
  const fetchMovements = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({
      page:     String(page),
      pageSize: String(pageSize),
      ...(typeFilter && { type: typeFilter }),
    });
    const res  = await fetch(`/api/stock?${qs}`);
    const data = await res.json();
    setSummary(data.summary);
    setMovements(data.movements ?? []);
    setTotal(data.total ?? 0);
    setLoading(false);
  }, [page, typeFilter]);

  // ── Fetch branches ──────────────────────────────────────────────────────
  const fetchBranches = useCallback(async () => {
    const res  = await fetch("/api/branches");
    const data = await res.json();
    setBranches((data.branches ?? data).filter((b: Branch) => b.isActive));
  }, []);

  // ── Fetch copies currently in STOCK ────────────────────────────────────
  const fetchStockCopies = useCallback(async () => {
    setStockLoading(true);
    const res  = await fetch("/api/stock/copies");
    const data = await res.json();
    setStockCopies(Array.isArray(data) ? data : []);
    setStockLoading(false);
  }, []);

  useEffect(() => { fetchMovements(); }, [fetchMovements]);
  useEffect(() => { fetchBranches();  }, [fetchBranches]);

  // ── Deploy handler ────────────────────────────────────────────────────
  async function handleDeploy() {
    if (selected.size === 0) { setDeployErr("Select at least one copy"); return; }
    if (!deployBranch)        { setDeployErr("Select a branch");          return; }
    setDeploying(true); setDeployErr("");
    const res = await fetch("/api/stock/deploy", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        copyIds:      [...selected],
        targetStatus: deployTarget,
        branchId:     deployBranch,
        notes:        deployNotes || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) { setDeployErr(data.error ?? "Deploy failed"); setDeploying(false); return; }
    setDeploying(false);
    setShowDeploy(false);
    setSelected(new Set());
    setDeployBranch(""); setDeployNotes("");
    fetchMovements();
  }

  // ── Receive-back handler ──────────────────────────────────────────────
  async function handleReceive() {
    const ids = receiveIds.split(/[\s,]+/).filter(Boolean);
    if (ids.length === 0) { setReceiveErr("Enter at least one copy ID or barcode"); return; }
    setReceiving(true); setReceiveErr("");

    // Resolve barcodes → IDs if needed
    const res = await fetch("/api/stock/receive", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        copyIds:   ids,
        source:    recSource,
        reference: recRef   || undefined,
        notes:     recNotes || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) { setReceiveErr(data.error ?? "Receive failed"); setReceiving(false); return; }
    setReceiving(false);
    setShowReceive(false);
    setReceiveIds(""); setRecRef(""); setRecNotes("");
    fetchMovements();
  }

  const totalPages = Math.ceil(total / pageSize);

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── Page header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
            <Warehouse className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Stock Management</h1>
            <p className="text-xs text-gray-400">Receive, deploy and track every physical copy</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowReceive(true); }}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Download className="w-4 h-4" />
            Receive to Stock
          </button>
          <button
            onClick={() => { fetchStockCopies(); setShowDeploy(true); }}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Upload className="w-4 h-4" />
            Deploy Stock
          </button>
        </div>
      </div>

      {/* ── Summary cards ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "In Stock",          value: summary?.inStock,     icon: Package,        color: "amber",  desc: "Received, not yet deployed" },
          { label: "Available (Shelf)", value: summary?.available,   icon: CheckCircle2,   color: "green",  desc: "On shelf, loanable" },
          { label: "For Sale",          value: summary?.forSale,     icon: ShoppingBag,    color: "violet", desc: "Listed for member purchase" },
          { label: "Total Copies",      value: summary?.totalCopies, icon: BookOpen,       color: "blue",   desc: "All physical copies" },
        ].map(({ label, value, icon: Icon, color, desc }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-gray-500">{label}</p>
              <div className={`w-8 h-8 rounded-lg bg-${color}-100 flex items-center justify-center`}>
                <Icon className={`w-4 h-4 text-${color}-600`} />
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900">{value ?? "—"}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{desc}</p>
          </div>
        ))}
      </div>

      {/* ── Movements table ──────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-gray-400" />
            Movement History
            <span className="text-xs font-normal text-gray-400">({total})</span>
          </h2>
          <div className="flex items-center gap-2">
            {/* Type filter */}
            <div className="relative">
              <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              <select
                value={typeFilter}
                onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
                className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
              >
                <option value="">All types</option>
                {Object.entries(TYPE_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
            <button onClick={fetchMovements} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
              <RefreshCw className={`w-4 h-4 text-gray-400 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" /> Loading…
          </div>
        ) : movements.length === 0 ? (
          <div className="py-16 text-center">
            <Package className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No movements yet</p>
            <p className="text-xs text-gray-400 mt-1">Receive your first copies to stock to get started</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {["Type", "Book", "Copy", "From → To", "Branch", "Source / Ref", "By", "Date"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {movements.map((m) => {
                  const t = TYPE_LABEL[m.type] ?? { label: m.type, color: "bg-gray-100 text-gray-600" };
                  return (
                    <tr key={m.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${t.color}`}>
                          {t.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-[180px]">
                        <p className="font-medium text-gray-900 truncate text-xs">{m.book.title}</p>
                        <p className="text-[10px] text-gray-400">{m.book.author?.name}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 font-mono whitespace-nowrap">
                        #{m.copy.copyNumber}
                        {m.copy.barcode && <span className="ml-1 text-gray-400">· {m.copy.barcode}</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 text-xs">
                          {m.fromStatus && (
                            <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[10px] font-medium">{m.fromStatus}</span>
                          )}
                          {m.fromStatus && <ArrowRight className="w-3 h-3 text-gray-300" />}
                          <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-medium">{m.toStatus}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {m.fromBranch && m.toBranch
                          ? <span>{m.fromBranch.name} → {m.toBranch.name}</span>
                          : m.toBranch?.name ?? m.fromBranch?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {m.source ? SOURCE_LABEL[m.source] ?? m.source : "—"}
                        {m.reference && <span className="block text-[10px] text-gray-400 font-mono">{m.reference}</span>}
                        {m.unitCost != null && (
                          <span className="block text-[10px] text-emerald-600">${m.unitCost.toFixed(2)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{m.actorName ?? "System"}</td>
                      <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{fmt(m.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-400">Page {page} of {totalPages}</p>
            <div className="flex gap-1">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
              >
                <ChevronUp className="w-3.5 h-3.5 rotate-90 inline" /> Prev
              </button>
              <button
                disabled={page === totalPages}
                onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
              >
                Next <ChevronDown className="w-3.5 h-3.5 -rotate-90 inline" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ══ DEPLOY MODAL ════════════════════════════════════════════════ */}
      {showDeploy && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <Upload className="w-4 h-4 text-blue-600" /> Deploy Stock to Branch
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">Select copies → choose branch → mark as Available or For Sale</p>
              </div>
              <button onClick={() => setShowDeploy(false)} className="p-1.5 rounded-lg hover:bg-gray-100">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Target status */}
              <div className="flex gap-2">
                {(["AVAILABLE", "FOR_SALE"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setDeployTarget(s)}
                    className={`flex-1 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                      deployTarget === s
                        ? s === "FOR_SALE"
                          ? "border-violet-500 bg-violet-50 text-violet-700"
                          : "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {s === "AVAILABLE" ? "📚 Loanable (Available)" : "🏷️ For Sale"}
                  </button>
                ))}
              </div>

              {/* Branch selector */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Deploy to Branch *</label>
                <select
                  value={deployBranch}
                  onChange={(e) => setDeployBranch(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">— Select branch —</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              {/* Copies in stock */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Copies in Stock
                  <span className="ml-2 text-gray-400">({selected.size} selected)</span>
                </label>

                {stockLoading ? (
                  <div className="flex items-center justify-center py-8 text-gray-400 gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading stock…
                  </div>
                ) : stockCopies.length === 0 ? (
                  <div className="py-8 text-center text-sm text-gray-400">
                    <Package className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    No copies currently in stock
                  </div>
                ) : (
                  <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-52 overflow-y-auto">
                    {/* Select all */}
                    <div className="px-3 py-2 bg-gray-50 flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="select-all"
                        checked={selected.size === stockCopies.length && stockCopies.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) setSelected(new Set(stockCopies.map(c => c.id)));
                          else setSelected(new Set());
                        }}
                        className="rounded text-blue-600"
                      />
                      <label htmlFor="select-all" className="text-xs font-medium text-gray-600 cursor-pointer">
                        Select all ({stockCopies.length})
                      </label>
                    </div>
                    {stockCopies.map((c) => (
                      <label key={c.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selected.has(c.id)}
                          onChange={(e) => {
                            const next = new Set(selected);
                            if (e.target.checked) next.add(c.id); else next.delete(c.id);
                            setSelected(next);
                          }}
                          className="rounded text-blue-600"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-800 truncate">{c.book.title}</p>
                          <p className="text-[10px] text-gray-400">
                            Copy #{c.copyNumber}
                            {c.barcode && ` · ${c.barcode}`}
                            {c.condition && ` · ${c.condition}`}
                            {c.price != null && ` · $${c.price.toFixed(2)}`}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
                <textarea
                  value={deployNotes}
                  onChange={(e) => setDeployNotes(e.target.value)}
                  rows={2}
                  placeholder="e.g. Batch deployment for new semester…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              {deployErr && (
                <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" /> {deployErr}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setShowDeploy(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                Cancel
              </button>
              <button
                onClick={handleDeploy}
                disabled={deploying || selected.size === 0}
                className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {deploying && <Loader2 className="w-4 h-4 animate-spin" />}
                Deploy {selected.size > 0 ? `${selected.size} ` : ""}
                {deployTarget === "FOR_SALE" ? "For Sale" : "as Available"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ RECEIVE TO STOCK MODAL ═══════════════════════════════════════ */}
      {showReceive && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Download className="w-4 h-4 text-amber-600" /> Receive Copies to Stock
              </h3>
              <button onClick={() => setShowReceive(false)} className="p-1.5 rounded-lg hover:bg-gray-100">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Copy IDs (comma or newline separated) *</label>
                <textarea
                  value={receiveIds}
                  onChange={(e) => setReceiveIds(e.target.value)}
                  rows={3}
                  placeholder="Paste copy IDs or barcodes here…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Source</label>
                  <select
                    value={recSource}
                    onChange={(e) => setRecSource(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    {Object.entries(SOURCE_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Reference / PO No.</label>
                  <input
                    value={recRef}
                    onChange={(e) => setRecRef(e.target.value)}
                    placeholder="PO-2025-001"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
                <textarea
                  value={recNotes}
                  onChange={(e) => setRecNotes(e.target.value)}
                  rows={2}
                  placeholder="e.g. Returned from Main Branch for redistribution"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
                />
              </div>
              {receiveErr && (
                <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" /> {receiveErr}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setShowReceive(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
                Cancel
              </button>
              <button
                onClick={handleReceive}
                disabled={receiving}
                className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50"
              >
                {receiving && <Loader2 className="w-4 h-4 animate-spin" />}
                Receive to Stock
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
