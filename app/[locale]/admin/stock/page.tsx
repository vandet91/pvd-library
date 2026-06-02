"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Package, ArrowRightLeft, TrendingDown, TrendingUp, ShoppingBag,
  BookOpen, CheckCircle2, ChevronDown, ChevronUp,
  Loader2, AlertCircle, Filter, RefreshCw, X,
  Download, Upload, ArrowRight, Warehouse,
  DollarSign, AlertTriangle, Pencil, Check, XCircle,
} from "lucide-react";
import { formatPrice } from "@/lib/price-format";

// ── Types ──────────────────────────────────────────────────────────────────
interface StockSummary {
  inStock:          number;
  forSale:          number;
  available:        number;
  totalCopies:      number;
  // Bookstore sales stats
  forSaleValue:     number;
  soldThisMonth:    number;
  revenueThisMonth: number;
  lowStockBooks:    Array<{ id: string; title: string; author: { name: string } | null }>;
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

  // Sale mode state
  const [saleEnabled,     setSaleEnabled]     = useState(false);
  const [saleCurrency,    setSaleCurrency]    = useState("USD");

  // For Sale copies panel
  const [forSaleCopies,   setForSaleCopies]   = useState<StockCopy[]>([]);
  const [forSaleLoading,  setForSaleLoading]  = useState(false);
  const [forSaleLoaded,   setForSaleLoaded]   = useState(false);
  const [forSaleOpen,     setForSaleOpen]     = useState(false);

  // Inline price edit
  const [editingPriceId,  setEditingPriceId]  = useState<string | null>(null);
  const [editingPriceVal, setEditingPriceVal] = useState("");
  const [savingPrice,     setSavingPrice]     = useState(false);

  // Per-book batch price (For Sale table)
  const [bookPriceInput,  setBookPriceInput]  = useState<Record<string, string>>({});   // bookId → price string
  const [bookPriceSaving, setBookPriceSaving] = useState<Record<string, boolean>>({});  // bookId → saving

  // Per-book price inputs inside the deploy modal
  const [deployBookPrices, setDeployBookPrices] = useState<Record<string, string>>({});  // bookId → price

  // Deploy form state
  const [selected,     setSelected]     = useState<Set<string>>(new Set());
  const [deployBranch, setDeployBranch] = useState("");
  const [deployTarget, setDeployTarget] = useState<"AVAILABLE" | "FOR_SALE">("AVAILABLE");
  const [deployPrice,  setDeployPrice]  = useState("");   // bulk price at deploy time
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

  // Scan queue for receive modal
  const [scanInput,    setScanInput]    = useState("");
  const [scanQueue,    setScanQueue]    = useState<{ value: string; label: string }[]>([]);
  const [scanResolving, setScanResolving] = useState(false);

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

  // ── Fetch FOR_SALE copies for price management ────────────────────────
  const fetchForSaleCopies = useCallback(async () => {
    setForSaleLoading(true);
    const res  = await fetch("/api/stock/copies?status=FOR_SALE");
    const data = await res.json();
    setForSaleCopies(Array.isArray(data) ? data : []);
    setForSaleLoaded(true);
    setForSaleLoading(false);
  }, []);

  useEffect(() => { fetchMovements(); }, [fetchMovements]);
  useEffect(() => { fetchBranches();  }, [fetchBranches]);
  useEffect(() => { fetchStockCopies(); }, [fetchStockCopies]);

  // ── Fetch settings (bookstore currency / enabled) ─────────────────────
  useEffect(() => {
    fetch("/api/settings")
      .then(r => r.ok ? r.json() : {})
      .then((s: Record<string, string>) => {
        setSaleEnabled(s.BOOK_SALE_ENABLED === "true");
        setSaleCurrency(s.STOCK_CURRENCY || "USD");
      });
  }, []);

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

    // After deploying FOR_SALE, apply per-book prices to selected copies
    if (deployTarget === "FOR_SALE" && Object.keys(deployBookPrices).length > 0) {
      const pricePatchPromises: Promise<unknown>[] = [];
      for (const c of stockCopies) {
        if (!selected.has(c.id)) continue;
        const priceStr = deployBookPrices[c.book.id];
        const price    = priceStr ? parseFloat(priceStr) : NaN;
        if (!isNaN(price) && price >= 0) {
          pricePatchPromises.push(
            fetch(`/api/copies/${c.id}`, {
              method:  "PATCH",
              headers: { "Content-Type": "application/json" },
              body:    JSON.stringify({ price }),
            }),
          );
        }
      }
      await Promise.all(pricePatchPromises);
    }

    setDeploying(false);
    setShowDeploy(false);
    setSelected(new Set());
    setDeployBranch(""); setDeployNotes(""); setDeployBookPrices({});
    fetchMovements();
  }

  // ── Scan-and-queue handler ────────────────────────────────────────────
  async function handleScan(raw: string) {
    const value = raw.trim();
    if (!value) return;
    if (scanQueue.some(q => q.value === value)) { setScanInput(""); return; } // duplicate
    setScanResolving(true);
    // Preview: resolve barcode → copy title so user can confirm
    const res  = await fetch(`/api/copies?ids=${encodeURIComponent(value)}`);
    const data = await res.json();
    const copy = Array.isArray(data) ? data[0] : null;
    const label = copy
      ? `${copy.book?.title ?? "Unknown"} · #${copy.copyNumber} (${copy.status})`
      : `Barcode: ${value}`;
    setScanQueue(prev => [...prev, { value, label }]);
    setScanInput("");
    setScanResolving(false);
  }

  // ── Receive-back handler ──────────────────────────────────────────────
  async function handleReceive() {
    // Merge scan queue + manual textarea
    const manualIds = receiveIds.split(/[\s,]+/).filter(Boolean);
    const ids = [...new Set([...scanQueue.map(q => q.value), ...manualIds])];
    if (ids.length === 0) { setReceiveErr("Scan or enter at least one copy ID or barcode"); return; }
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
    setScanQueue([]); setScanInput("");
    fetchMovements();
    fetchStockCopies();
  }

  const totalPages = Math.ceil(total / pageSize);

  // ── Price quick-edit ──────────────────────────────────────────────────
  function startPriceEdit(c: StockCopy) {
    setEditingPriceId(c.id);
    setEditingPriceVal(c.price != null ? String(c.price) : "");
  }
  function cancelPriceEdit() {
    setEditingPriceId(null);
    setEditingPriceVal("");
  }
  async function savePrice(copyId: string) {
    const val = parseFloat(editingPriceVal);
    if (isNaN(val) || val < 0) { cancelPriceEdit(); return; }
    setSavingPrice(true);
    const res = await fetch(`/api/copies/${copyId}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ price: val }),
    });
    if (res.ok) {
      // Update local list immediately
      setForSaleCopies(prev => prev.map(c => c.id === copyId ? { ...c, price: val } : c));
      fetchMovements(); // refresh summary forSaleValue
    }
    setEditingPriceId(null);
    setEditingPriceVal("");
    setSavingPrice(false);
  }

  // ── Set same price for all copies of one book ────────────────────────
  async function saveBookPrice(bookId: string, copyIds: string[]) {
    const val = parseFloat(bookPriceInput[bookId] ?? "");
    if (isNaN(val) || val < 0) return;
    setBookPriceSaving((prev) => ({ ...prev, [bookId]: true }));
    await Promise.all(copyIds.map((id) =>
      fetch(`/api/copies/${id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ price: val }),
      }),
    ));
    setForSaleCopies((prev) => prev.map((c) => copyIds.includes(c.id) ? { ...c, price: val } : c));
    setBookPriceInput((prev) => ({ ...prev, [bookId]: "" }));
    setBookPriceSaving((prev) => ({ ...prev, [bookId]: false }));
    fetchMovements();
  }

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

      {/* ── Sales stats (bookstore mode) ─────────────────────────────── */}
      {saleEnabled && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: "FOR SALE Value",     value: formatPrice(summary?.forSaleValue ?? 0, saleCurrency),     icon: DollarSign,  color: "violet",  desc: "Total value of copies listed for sale" },
            { label: "Sold This Month",    value: String(summary?.soldThisMonth ?? 0),                       icon: TrendingDown, color: "pink",    desc: "Copies sold since the 1st of this month" },
            { label: "Revenue This Month", value: formatPrice(summary?.revenueThisMonth ?? 0, saleCurrency), icon: TrendingUp,  color: "emerald", desc: "From completed sale orders this month" },
          ].map(({ label, value, icon: Icon, color, desc }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-gray-500">{label}</p>
                <div className={`w-8 h-8 rounded-lg bg-${color}-100 flex items-center justify-center`}>
                  <Icon className={`w-4 h-4 text-${color}-600`} />
                </div>
              </div>
              <p className="text-xl font-bold text-gray-900">{value}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{desc}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Low FOR SALE stock warning ────────────────────────────────── */}
      {saleEnabled && !!summary?.lowStockBooks?.length && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">
              Low FOR SALE Stock —{" "}{summary.lowStockBooks.length}{" "}
              {summary.lowStockBooks.length === 1 ? "book" : "books"} with only 1 copy remaining
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {summary.lowStockBooks.map(b => (
                <span key={b.id} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
                  {b.title}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── In Stock inventory ───────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Package className="w-4 h-4 text-amber-500" />
            In Stock
            <span className="text-xs font-normal text-gray-400">({stockCopies.length})</span>
          </h2>
          <button onClick={fetchStockCopies} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <RefreshCw className="w-3.5 h-3.5 text-gray-400" />
          </button>
        </div>

        {/* Info note */}
        <div className="flex items-start gap-2 px-4 py-2.5 bg-blue-50 border-b border-blue-100 text-xs text-blue-700">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>
            Only copies explicitly <strong>received into stock</strong> appear here. Copies added directly to a book
            (or imported before the stock workflow) have <strong>Available</strong> status and are managed on the branch shelf —
            use <em>Receive to Stock</em> to bring them into this workflow.
          </span>
        </div>

        {stockLoading ? (
          <div className="flex items-center justify-center py-10 text-gray-400 gap-2 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : stockCopies.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400">
            <Package className="w-8 h-8 mx-auto mb-2 text-gray-200" />
            No copies currently in stock
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {(() => {
              const groups = new Map<string, { book: StockCopy["book"]; copies: StockCopy[] }>();
              for (const c of stockCopies) {
                if (!groups.has(c.bookId)) groups.set(c.bookId, { book: c.book, copies: [] });
                groups.get(c.bookId)!.copies.push(c);
              }
              return [...groups.entries()].map(([bookId, { book, copies: bCopies }]) => (
                <div key={bookId}>
                  <div className="px-4 py-2 bg-gray-50 flex items-center gap-2">
                    <BookOpen className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <span className="text-xs font-semibold text-gray-700 flex-1 truncate">{book.title}</span>
                    {book.author && <span className="text-xs text-gray-400 truncate hidden sm:block">{book.author.name}</span>}
                    <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium shrink-0">
                      {bCopies.length} cop{bCopies.length !== 1 ? "ies" : "y"}
                    </span>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {bCopies.map((copy) => (
                      <div key={copy.id} className="flex items-center gap-3 px-5 py-2.5 hover:bg-gray-50 text-sm">
                        <span className="text-gray-400 w-6 text-right shrink-0">#{copy.copyNumber}</span>
                        <span className="font-mono text-xs text-gray-600 flex-1">{copy.barcode ?? "—"}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                          copy.condition === "GOOD"      ? "bg-green-50 text-green-700" :
                          copy.condition === "FAIR"      ? "bg-amber-50 text-amber-700" :
                          copy.condition === "POOR"      ? "bg-red-50 text-red-700" :
                          "bg-gray-100 text-gray-500"
                        }`}>{copy.condition}</span>
                        {copy.price != null && (
                          <span className="text-xs text-gray-500">${copy.price.toFixed(2)}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ));
            })()}
          </div>
        )}
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

      {/* ── For Sale Inventory (price management) ───────────────────── */}
      {saleEnabled && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-violet-500" />
              For Sale Inventory
              {forSaleLoaded && (
                <span className="text-xs font-normal text-gray-400">({forSaleCopies.length})</span>
              )}
            </h2>
            <button
              onClick={() => {
                if (!forSaleLoaded) fetchForSaleCopies();
                setForSaleOpen(p => !p);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded-lg hover:bg-violet-100 transition-colors"
            >
              {forSaleOpen ? "Hide" : "Manage Prices"}
            </button>
          </div>

          {/* Body */}
          {forSaleOpen && (
            forSaleLoading ? (
              <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin" /> Loading…
              </div>
            ) : forSaleCopies.length === 0 ? (
              <div className="py-12 text-center">
                <ShoppingBag className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No copies currently listed for sale</p>
                <p className="text-xs text-gray-400 mt-1">Deploy stock as "For Sale" to list books for member purchase</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {(() => {
                  // Group copies by book
                  const groups = new Map<string, { book: StockCopy["book"]; copies: StockCopy[] }>();
                  for (const c of forSaleCopies) {
                    if (!groups.has(c.book.id)) groups.set(c.book.id, { book: c.book, copies: [] });
                    groups.get(c.book.id)!.copies.push(c);
                  }
                  return [...groups.entries()].map(([bookId, { book, copies }]) => {
                    const missingCount = copies.filter((c) => c.price == null).length;
                    const saving = bookPriceSaving[bookId] ?? false;
                    return (
                      <div key={bookId}>
                        {/* ── Book header row ────────────────────────── */}
                        <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-100">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-gray-900 truncate">{book.title}</p>
                            <p className="text-[10px] text-gray-400">{book.author?.name} · {copies.length} {copies.length === 1 ? "copy" : "copies"}</p>
                          </div>
                          {missingCount > 0 && (
                            <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full flex-shrink-0">
                              {missingCount} missing price
                            </span>
                          )}
                          {/* Set price for ALL copies of this book */}
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <span className="text-[11px] text-gray-500 hidden sm:block">All copies:</span>
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-[10px] pointer-events-none">{saleCurrency}</span>
                              <input
                                type="number" min="0" step="0.01"
                                value={bookPriceInput[bookId] ?? ""}
                                onChange={(e) => setBookPriceInput((prev) => ({ ...prev, [bookId]: e.target.value }))}
                                onKeyDown={(e) => e.key === "Enter" && saveBookPrice(bookId, copies.map((c) => c.id))}
                                placeholder="0.00"
                                className="w-24 border border-violet-200 rounded-lg pl-9 pr-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-violet-400"
                              />
                            </div>
                            <button
                              onClick={() => saveBookPrice(bookId, copies.map((c) => c.id))}
                              disabled={saving || !bookPriceInput[bookId]}
                              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-40 transition-colors"
                            >
                              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                              Set all
                            </button>
                          </div>
                        </div>

                        {/* ── Copy rows ───────────────────────────────── */}
                        <table className="w-full text-sm">
                          <tbody className="divide-y divide-gray-50">
                            {copies.map((c) => (
                              <tr key={c.id} className="hover:bg-gray-50/40 transition-colors">
                                <td className="pl-8 pr-2 py-2.5 text-xs text-gray-500 font-mono w-20">#{c.copyNumber}</td>
                                <td className="px-2 py-2.5 text-xs text-gray-500 w-28">{c.condition}</td>
                                <td className="px-2 py-2.5 text-xs text-gray-400 font-mono">{c.barcode ?? "—"}</td>
                                <td className="px-2 py-2.5">
                                  {editingPriceId === c.id ? (
                                    <div className="flex items-center gap-1">
                                      <input
                                        type="number" step="0.01" min="0"
                                        value={editingPriceVal}
                                        onChange={(e) => setEditingPriceVal(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter")  savePrice(c.id);
                                          if (e.key === "Escape") cancelPriceEdit();
                                        }}
                                        autoFocus
                                        className="w-24 border border-blue-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                                      />
                                      <button onClick={() => savePrice(c.id)} disabled={savingPrice} className="p-1 rounded text-emerald-600 hover:bg-emerald-50 disabled:opacity-50">
                                        <Check className="w-3.5 h-3.5" />
                                      </button>
                                      <button onClick={cancelPriceEdit} className="p-1 rounded text-gray-400 hover:bg-gray-100">
                                        <XCircle className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1.5">
                                      {c.price == null ? (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-red-500">
                                          <AlertTriangle className="w-3 h-3" /> No price
                                        </span>
                                      ) : (
                                        <span className="text-xs font-semibold text-gray-900">{formatPrice(c.price, saleCurrency)}</span>
                                      )}
                                      <button
                                        onClick={() => startPriceEdit(c)}
                                        className="p-1 rounded text-gray-300 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                        title="Edit this copy's price individually"
                                      >
                                        <Pencil className="w-3 h-3" />
                                      </button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  });
                })()}
              </div>
            )
          )}
        </div>
      )}

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

              {/* FOR_SALE hint */}
              {deployTarget === "FOR_SALE" && (
                <div className="flex items-start gap-2 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2.5 text-xs text-violet-700">
                  <DollarSign className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <span>Set a price for each book below. Different books can have different prices. Leave blank to set later in the For Sale Inventory panel.</span>
                </div>
              )}

              {/* Copies in stock — grouped by book */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Copies in Stock
                  <span className="ml-2 text-gray-400">({selected.size} of {stockCopies.length} selected)</span>
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
                  <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-64 overflow-y-auto">
                    {(() => {
                      // Group stock copies by book
                      const groups = new Map<string, { title: string; copies: typeof stockCopies }>();
                      for (const c of stockCopies) {
                        if (!groups.has(c.book.id)) groups.set(c.book.id, { title: c.book.title, copies: [] });
                        groups.get(c.book.id)!.copies.push(c);
                      }
                      return [...groups.entries()].map(([bookId, { title, copies: bookCopies }]) => {
                        const allSelected = bookCopies.every((c) => selected.has(c.id));
                        const someSelected = bookCopies.some((c) => selected.has(c.id));
                        return (
                          <div key={bookId}>
                            {/* Book group header with select-all + price input for this book */}
                            <div className="px-3 py-2 bg-gray-50 flex items-center gap-2 flex-wrap">
                              <input
                                type="checkbox"
                                checked={allSelected}
                                ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                                onChange={(e) => {
                                  const next = new Set(selected);
                                  bookCopies.forEach((c) => e.target.checked ? next.add(c.id) : next.delete(c.id));
                                  setSelected(next);
                                }}
                                className="rounded text-blue-600"
                              />
                              <span className="text-xs font-semibold text-gray-700 truncate flex-1 min-w-0">{title}</span>
                              <span className="text-[10px] text-gray-400 flex-shrink-0">
                                {bookCopies.filter((c) => selected.has(c.id)).length}/{bookCopies.length}
                              </span>
                              {/* Per-book price — only shown when FOR_SALE */}
                              {deployTarget === "FOR_SALE" && (
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <span className="text-[10px] text-gray-400">Price:</span>
                                  <div className="relative">
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-[10px] pointer-events-none">{saleCurrency}</span>
                                    <input
                                      type="number" min="0" step="0.01"
                                      value={deployBookPrices[bookId] ?? ""}
                                      onChange={(e) => setDeployBookPrices((prev) => ({ ...prev, [bookId]: e.target.value }))}
                                      placeholder="0.00"
                                      className="w-24 border border-violet-200 rounded-lg pl-9 pr-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-violet-400 bg-white"
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                            {/* Individual copies */}
                            {bookCopies.map((c) => (
                              <label key={c.id} className="flex items-center gap-3 pl-7 pr-3 py-2 hover:bg-gray-50 cursor-pointer">
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
                                <p className="text-[11px] text-gray-600">
                                  Copy #{c.copyNumber}
                                  {c.barcode    && ` · ${c.barcode}`}
                                  {c.condition  && ` · ${c.condition}`}
                                </p>
                              </label>
                            ))}
                          </div>
                        );
                      });
                    })()}
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
              {/* Scan input */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Scan Barcode
                  <span className="ml-1 font-normal text-gray-400">(press Enter or scan to queue)</span>
                </label>
                <div className="flex gap-2">
                  <input
                    value={scanInput}
                    onChange={(e) => setScanInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleScan(scanInput); } }}
                    placeholder="Scan or type barcode…"
                    className="flex-1 border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                    autoFocus
                  />
                  <button
                    onClick={() => handleScan(scanInput)}
                    disabled={!scanInput.trim() || scanResolving}
                    className="px-3 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-40 transition-colors"
                  >
                    {scanResolving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add"}
                  </button>
                </div>

                {/* Scan queue */}
                {scanQueue.length > 0 && (
                  <div className="mt-2 border border-gray-200 rounded-lg divide-y divide-gray-50 max-h-40 overflow-y-auto">
                    {scanQueue.map((q, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-2 text-xs">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                        <span className="flex-1 text-gray-700 font-mono truncate">{q.label}</span>
                        <button
                          onClick={() => setScanQueue(prev => prev.filter((_, j) => j !== i))}
                          className="text-gray-300 hover:text-red-500 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Manual fallback */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Or paste IDs / barcodes manually
                  <span className="ml-1 font-normal text-gray-400">(comma or newline separated)</span>
                </label>
                <textarea
                  value={receiveIds}
                  onChange={(e) => setReceiveIds(e.target.value)}
                  rows={2}
                  placeholder="e.g. copy-id-1, barcode2…"
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
              <button
                onClick={() => { setShowReceive(false); setScanQueue([]); setScanInput(""); }}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleReceive}
                disabled={receiving}
                className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50"
              >
                {receiving && <Loader2 className="w-4 h-4 animate-spin" />}
                Receive{scanQueue.length + receiveIds.split(/[\s,]+/).filter(Boolean).length > 0
                  ? ` ${scanQueue.length + receiveIds.split(/[\s,]+/).filter(Boolean).length}`
                  : ""} to Stock
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
