"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  ShoppingBasket, ArrowLeft, Barcode, Search, Tag, CheckSquare,
  Square, Loader2, X, AlertTriangle, CheckCircle2, Trash2, BookOpen,
  Wrench, Archive, RotateCcw, BookX, BookCheck, AlignLeft,
  Package, Download, Star, ChevronDown, BookMarked, UserCheck, UserX,
  CalendarPlus, MapPin, Building2,
} from "lucide-react";
import { BookCondition } from "@prisma/client";

async function safeJson<T>(res: Response, fallback: T): Promise<T> {
  try { return (await res.json()) as T; } catch { return fallback; }
}

/* ── Types ─────────────────────────────────────────────────────── */
interface BasketBook {
  id:            string;
  title:         string;
  isbn:          string | null;
  barcode:       string | null;
  location:      string | null;
  shelfLocation?: { name: string } | null;
  condition:     string;
  materialType:  string;
  availableCopies: number;
  author:        { name: string } | null;
  category:      { name: string } | null;
}

interface BasketItem {
  id:       string;
  basketId: string;
  bookId:   string | null;
  copyId:   string | null;
  ebookId:  string | null;
  authorId: string | null;
  memberId: string | null;
  tagged:   boolean;
  addedAt:  string;
  book:     BasketBook | null;
  copy:     { id: string; copyNumber: number; barcode: string | null; condition: string } | null;
  ebook:    { id: string; title: string; ebookType: string; language: string | null; coverImage: string | null; author: { name: string } | null } | null;
  author:   { id: string; name: string; _count: { books: number } } | null;
  member:   { id: string; memberId: string; name: string; memberType: string; isActive: boolean; gender: string; school: string | null; className: string | null } | null;
}

interface CopyPickerRow {
  id: string; copyNumber: number; barcode: string | null;
  condition: string; status: string;
}

type BasketType = "ITEM" | "EBOOK" | "AUTHOR" | "MEMBER";

interface Basket {
  id:         string;
  name:       string;
  basketType: BasketType;
  notes:      string | null;
  createdAt:  string;
  updatedAt:  string;
  items:      BasketItem[];
}

interface BookSearch {
  id: string; title: string; isbn: string | null; barcode: string | null;
  location: string | null; materialType: string;
  author: { name: string } | null;
  shelfLocation?: { name: string } | null;
}

/* ── Material type badge ────────────────────────────────────────── */
const MAT_CLS: Record<string, string> = {
  BOOK:      "bg-blue-50   text-blue-700",
  MAGAZINE:  "bg-pink-50   text-pink-700",
  JOURNAL:   "bg-purple-50 text-purple-700",
  NEWSPAPER: "bg-yellow-50 text-yellow-700",
  DVD:       "bg-red-50    text-red-700",
  AUDIO_CD:  "bg-orange-50 text-orange-700",
  THESIS:    "bg-teal-50   text-teal-700",
  MAP:       "bg-green-50  text-green-700",
  OTHER:     "bg-gray-100  text-gray-600",
};
function MatBadge({ type }: { type: string }) {
  if (type === "BOOK") return null;
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide ${MAT_CLS[type] ?? "bg-gray-100 text-gray-600"}`}>
      {type.replace("_", " ")}
    </span>
  );
}

/* ── Condition badge ────────────────────────────────────────────── */
const COND: Record<string, string> = {
  EXCELLENT: "bg-emerald-100 text-emerald-700",
  GOOD:      "bg-green-100  text-green-700",
  FAIR:      "bg-yellow-100 text-yellow-700",
  POOR:      "bg-orange-100 text-orange-700",
  DAMAGED:   "bg-red-100    text-red-700",
  LOST:      "bg-gray-100   text-gray-500",
  WITHDRAWN: "bg-slate-100  text-slate-500",
  ARCHIVED:  "bg-zinc-100   text-zinc-500",
};

function CondBadge({ cond }: { cond: string }) {
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide ${COND[cond] ?? "bg-gray-100 text-gray-500"}`}>
      {cond}
    </span>
  );
}

/* ── Tab type ───────────────────────────────────────────────────── */
type Tab = "collection" | "tag" | "actions";

export default function BasketDetailPage() {
  const params   = useParams();
  const basketId = params.id as string;
  const locale   = useLocale();
  const t        = useTranslations("basketDetail");

  const [basket,    setBasket]    = useState<Basket | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("collection");

  /* ── Collection: scan / search (ITEM baskets) ── */
  const [scanQuery,   setScanQuery]   = useState("");
  const [scanBusy,    setScanBusy]    = useState(false);
  const [scanMsg,     setScanMsg]     = useState<{ text: string; ok: boolean } | null>(null);
  const [scanTagged,  setScanTagged]  = useState(false);
  const [searchRes,   setSearchRes]   = useState<BookSearch[]>([]);
  const [searchBusy,  setSearchBusy]  = useState(false);
  const [searchQ,     setSearchQ]     = useState("");

  /* ── Entity search (AUTHOR / MEMBER / EBOOK baskets) ── */
  const [entityQ,       setEntityQ]       = useState("");
  const [entityBusy,    setEntityBusy]    = useState(false);
  const [entityResults, setEntityResults] = useState<{ id: string; label: string; sub: string }[]>([]);
  const [addingId,      setAddingId]      = useState<string | null>(null);
  const [entityMsg,     setEntityMsg]     = useState<{ text: string; ok: boolean } | null>(null);
  const inBasketEntityIds = new Set(basket?.items.flatMap(i => [i.ebookId, i.authorId, i.memberId]).filter(Boolean) as string[]);
  const scanRef = useRef<HTMLInputElement>(null);

  /* ── Copy picker for search results ── */
  const [pickerBookId,   setPickerBookId]   = useState<string | null>(null);
  const [pickerCopies,   setPickerCopies]   = useState<CopyPickerRow[]>([]);
  const [pickerSel,      setPickerSel]      = useState<Set<string>>(new Set());
  const [pickerTagged,   setPickerTagged]   = useState(false);
  const [pickerLoading,  setPickerLoading]  = useState(false);
  const [pickerBusy,     setPickerBusy]     = useState(false);

  /* ── Actions ── */
  const defaultActionTab = (type: BasketType) =>
    type === "ITEM" ? "condition" : type === "EBOOK" ? "toggle-public" : type === "MEMBER" ? "activate" : "export";
  const [actionTab,   setActionTab]   = useState<string>("condition");
  const [actionBusy,  setActionBusy]  = useState(false);
  const [actionMsg,   setActionMsg]   = useState<{ text: string; ok: boolean } | null>(null);
  /* Action payloads */
  const [locValue,    setLocValue]    = useState("");
  const [condValue,   setCondValue]   = useState<string>("");
  const [reasonVal,   setReasonVal]   = useState("");
  const [scope,       setScope]       = useState<"tagged" | "all">("tagged");
  /* Location / branch pickers */
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [branches,  setBranches]  = useState<{ id: string; name: string }[]>([]);
  const [moveLocId, setMoveLocId] = useState("");
  const [moveBranchId, setMoveBranchId] = useState("");

  /* ── Toast ── */
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  /* ── Fetch basket ── */
  const fetchBasket = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/baskets/${basketId}`);
      if (!res.ok) {
        const errBody = await res.text().catch(() => "(no body)");
        console.error("[basket] API error", res.status, errBody);
        setLoading(false); return;
      }
      const data = await safeJson<Basket | null>(res, null);
      if (data) { setBasket(data); setActionTab(defaultActionTab(data.basketType)); }
      else console.error("[basket] safeJson returned null");
    } catch (e) { console.error("[basket] fetch threw:", e); }
    finally { setLoading(false); }
  }, [basketId]);

  useEffect(() => { fetchBasket(); }, [fetchBasket]);

  useEffect(() => {
    if (!basket || basket.basketType !== "ITEM") return;
    fetch("/api/locations").then(r => r.json()).then(d => setLocations(Array.isArray(d) ? d : [])).catch(() => {});
    fetch("/api/branches").then(r => r.json()).then(d => setBranches(Array.isArray(d) ? d : [])).catch(() => {});
  }, [basket?.basketType]);

  /* ── Scan book by ISBN / ID ── */
  async function handleScan() {
    if (!scanQuery.trim()) return;
    setScanBusy(true); setScanMsg(null);
    try {
      const q    = scanQuery.trim();
      const body = {
        tagged: scanTagged,
        ...(q.startsWith("PVD-")
          ? { barcode: q }
          : /^[\d\-X]{9,}$/.test(q)
          ? { isbn: q }
          : { bookId: q }),
      };
      const res    = await fetch(`/api/baskets/${basketId}/items`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      const data = await safeJson<{ error?: string; book?: { title: string } }>(res, {});
      if (res.ok) {
        setScanMsg({ text: t("addedToBasket"), ok: true });
        setScanQuery("");
        fetchBasket();
        setTimeout(() => setScanMsg(null), 2500);
      } else {
        setScanMsg({ text: data.error ?? t("bookNotFound"), ok: false });
      }
    } catch (e) { setScanMsg({ text: String(e), ok: false }); }
    finally { setScanBusy(false); scanRef.current?.focus(); }
  }

  /* ── Search books to add ── */
  async function handleSearch() {
    if (!searchQ.trim()) return;
    setSearchBusy(true);
    try {
      const res  = await fetch(`/api/books?q=${encodeURIComponent(searchQ)}&limit=20`);
      const data = await safeJson<BookSearch[]>(res, []);
      setSearchRes(Array.isArray(data) ? data : []);
    } catch { setSearchRes([]); }
    finally { setSearchBusy(false); }
  }


  /* ── Toggle tagged (by copyId) ── */
  async function toggleTag(copyIdOrItemId: string, tagged: boolean) {
    const isItem = basket?.basketType !== "ITEM";
    const res = await fetch(`/api/baskets/${basketId}/items`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(isItem ? { itemId: copyIdOrItemId, tagged } : { copyId: copyIdOrItemId, tagged }),
    });
    if (res.ok) fetchBasket();
  }

  /* ── Tag / untag all ── */
  async function tagAll(mode: "tag" | "untag") {
    const res = await fetch(`/api/baskets/${basketId}/items`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ all: mode }),
    });
    if (res.ok) fetchBasket();
  }

  /* ── Live entity search — debounced ── */
  useEffect(() => {
    if (!entityQ.trim() || !basket || basket.basketType === "ITEM") {
      setEntityResults([]);
      return;
    }
    const timer = setTimeout(() => handleEntitySearch(), 300);
    return () => clearTimeout(timer);
  }, [entityQ]); // eslint-disable-line

  /* ── Entity search (AUTHOR / MEMBER / EBOOK) ── */
  async function handleEntitySearch() {
    if (!entityQ.trim() || !basket) return;
    setEntityBusy(true); setEntityResults([]); setEntityMsg(null);
    const q = entityQ.trim();
    try {
      if (basket.basketType === "AUTHOR") {
        const data: { id: string; name: string; _count?: { books: number } }[] = await fetch("/api/authors").then(r => r.json());
        const filtered = data.filter(a => a.name.toLowerCase().includes(q.toLowerCase()));
        setEntityResults(filtered.map(a => ({ id: a.id, label: a.name, sub: `${a._count?.books ?? 0} books` })));
      } else if (basket.basketType === "MEMBER") {
        const data: { members: { id: string; name: string; memberId: string; memberType: string }[] } =
          await fetch(`/api/members?q=${encodeURIComponent(q)}&limit=20`).then(r => r.json());
        setEntityResults((data.members ?? []).map(m => ({ id: m.id, label: m.name, sub: `${m.memberId} · ${m.memberType}` })));
      } else if (basket.basketType === "EBOOK") {
        const data: { id: string; title: string; ebookType: string }[] =
          await fetch(`/api/ebooks?q=${encodeURIComponent(q)}`).then(r => r.json());
        setEntityResults((data ?? []).map(e => ({ id: e.id, label: e.title, sub: e.ebookType })));
      }
    } catch { setEntityMsg({ text: "Search failed", ok: false }); }
    finally { setEntityBusy(false); }
  }

  async function addEntity(entityId: string) {
    if (!basket) return;
    setAddingId(entityId); setEntityMsg(null);
    const fieldMap: Record<string, string> = { AUTHOR: "authorId", MEMBER: "memberId", EBOOK: "ebookId" };
    const field = fieldMap[basket.basketType];
    try {
      const res = await fetch(`/api/baskets/${basketId}/items`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: entityId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setEntityMsg({ text: data.error ?? "Failed to add", ok: false }); return; }
      setEntityMsg({ text: "Added successfully", ok: true });
      fetchBasket();
      setTimeout(() => setEntityMsg(null), 2000);
    } catch { setEntityMsg({ text: "Network error", ok: false }); }
    finally { setAddingId(null); }
  }

  async function removeEntity(field: string, entityId: string) {
    await fetch(`/api/baskets/${basketId}/items`, {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: entityId }),
    });
    fetchBasket();
  }

  /* ── Remove a single copy from basket ── */
  async function removeCopy(copyId: string) {
    const res = await fetch(`/api/baskets/${basketId}/items`, {
      method:  "DELETE",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ copyId }),
    });
    if (res.ok) fetchBasket();
  }

  /* ── Empty basket ── */
  async function emptyBasket() {
    if (!confirm(t("confirmEmpty"))) return;
    const res = await fetch(`/api/baskets/${basketId}/items`, {
      method:  "DELETE",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ all: true }),
    });
    if (res.ok) { showToast(t("emptied")); fetchBasket(); }
  }

  /* ── Copy picker for search results ── */
  async function openCopyPicker(bookId: string) {
    if (pickerBookId === bookId) { setPickerBookId(null); return; }
    setPickerBookId(bookId);
    setPickerLoading(true);
    setPickerSel(new Set());
    try {
      const res  = await fetch(`/api/books/${bookId}/copies`);
      const data = await res.json() as CopyPickerRow[];
      setPickerCopies(data);
      const inBasket = new Set(basket?.items.map((i) => i.copy?.id) ?? []);
      setPickerSel(new Set(data.filter((c) => (c.status === "AVAILABLE" || c.status === "STOCK") && !inBasket.has(c.id)).map((c) => c.id)));
    } catch { setPickerCopies([]); }
    setPickerLoading(false);
  }

  async function submitCopyPicker() {
    if (!pickerBookId || pickerSel.size === 0) return;
    setPickerBusy(true);
    const res = await fetch(`/api/baskets/${basketId}/items`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ copyIds: [...pickerSel], tagged: pickerTagged }),
    });
    if (res.ok) {
      setPickerBookId(null);
      fetchBasket();
      showToast(t("copiesAddedToBasket", { count: pickerSel.size }));
    }
    setPickerBusy(false);
  }

  /* ── Run an action ── */
  async function runAction(action: string, extraPayload: Record<string, string> = {}) {
    setActionBusy(true); setActionMsg(null);
    const payload: Record<string, string> = { ...extraPayload };
    if (action === "condition") payload.condition = condValue;
    if (["withdraw", "archive", "repair"].includes(action)) payload.reason = reasonVal;
    if (action === "extend-expiry") payload.expireDate = locValue;

    try {
      const res  = await fetch(`/api/baskets/${basketId}/actions`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ action, payload, scope }),
      });
      const data = await safeJson<{ error?: string; updated?: number; deleted?: number }>(res, {});
      if (res.ok) {
        const count = data.updated ?? data.deleted ?? 0;
        setActionMsg({ text: t("doneUpdated", { count }), ok: true });
        fetchBasket();
        setLocValue(""); setCondValue(""); setReasonVal(""); setMoveLocId(""); setMoveBranchId("");
      } else {
        setActionMsg({ text: data.error ?? t("actionFailed"), ok: false });
      }
    } catch (e) { setActionMsg({ text: String(e), ok: false }); }
    finally { setActionBusy(false); }
  }

  /* ── Export list as CSV ── */
  function exportCSV() {
    if (!basket) return;
    const rows = basket.items.map((i) => [
      `"${i.book?.title.replace(/"/g, '""')}"`,
      i.book?.materialType,
      i.copy?.barcode ?? "",
      `Copy #${i.copy?.copyNumber}`,
      i.book?.isbn ?? "",
      i.book?.shelfLocation?.name ?? i.book?.location ?? "",
      i.copy?.condition,
      i.tagged ? "TAGGED" : "UNTAGGED",
      new Date(i.addedAt).toLocaleDateString(),
    ].join(","));
    const csv  = ["Title,MaterialType,CopyBarcode,CopyNumber,ISBN,Location,Condition,Status,Added", ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `basket-${basket.name.replace(/\s+/g, "-")}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-2 text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin" /> {t("loading")}
      </div>
    );
  }

  if (!basket) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">{t("notFound")}</p>
        <Link href={`/${locale}/admin/baskets`} className="text-indigo-600 text-sm mt-2 inline-block">
          {t("backToBaskets")}
        </Link>
      </div>
    );
  }

  const taggedCount    = basket.items.filter((i) => i.tagged).length;
  const untaggedCount  = basket.items.filter((i) => !i.tagged).length;
  const totalCount     = basket.items.length;
  const inBasketCopyIds = new Set(basket.items.map((i) => i.copy?.id).filter(Boolean) as string[]);
  const inBasketBookIds = new Set(basket.items.map((i) => i.bookId).filter(Boolean) as string[]);

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex flex-wrap items-start gap-3">
        <Link
          href={`/${locale}/admin/baskets`}
          className="mt-1 p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ShoppingBasket className="w-6 h-6 text-indigo-600" />
            {basket.name}
          </h1>
          {basket.notes && <p className="text-sm text-gray-500 mt-0.5">{basket.notes}</p>}
          <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
            <span className="font-semibold text-gray-700">{totalCount}</span>
            <span className="text-indigo-600 font-semibold">{taggedCount} {t("tagged")}</span>
            <span className="text-amber-600 font-semibold">{untaggedCount} {t("untagged")}</span>
          </div>
        </div>
        <button onClick={exportCSV} title="Export CSV"
          className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition-colors">
          <Download className="w-4 h-4" /> {t("export")}
        </button>
        {totalCount > 0 && (
          <button onClick={emptyBasket}
            className="flex items-center gap-1.5 px-3 py-2 border border-red-200 text-red-600 rounded-lg text-sm hover:bg-red-50 transition-colors">
            <Trash2 className="w-4 h-4" /> {t("empty")}
          </button>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {(["collection", "tag", "actions"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
              activeTab === tab
                ? "bg-white shadow text-indigo-700"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab === "collection" && t("tabCollection")}
            {tab === "tag"        && `${t("tabTag")}${totalCount > 0 ? ` (${taggedCount}/${totalCount})` : ""}`}
            {tab === "actions"    && `${t("tabActions")}${taggedCount > 0 ? ` (${taggedCount})` : ""}`}
          </button>
        ))}
      </div>

      {/* ══════════════════════ COLLECTION TAB ═════════════════════ */}
      {activeTab === "collection" && (
        <div className="space-y-5">

          {/* ── AUTHOR / MEMBER / EBOOK: entity search panel ── */}
          {basket.basketType !== "ITEM" && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-3">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                <Search className="w-4 h-4 text-indigo-500" />
                {basket.basketType === "AUTHOR" ? "Search by author name" :
                 basket.basketType === "MEMBER" ? "Search by member ID or name" :
                 "Search by ebook title"}
              </h2>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="text" value={entityQ}
                  onChange={e => setEntityQ(e.target.value)}
                  placeholder={
                    basket.basketType === "MEMBER" ? "Member ID or name…" :
                    basket.basketType === "AUTHOR" ? "Author name…" : "Ebook title…"
                  }
                  className="w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  autoFocus
                />
                {entityBusy && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />}
              </div>

              {entityMsg && (
                <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${entityMsg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                  {entityMsg.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
                  {entityMsg.text}
                </div>
              )}

              {entityResults.length > 0 && (
                <div className="border border-gray-100 rounded-lg divide-y divide-gray-50 max-h-64 overflow-y-auto">
                  {entityResults.map(r => {
                    const already = inBasketEntityIds.has(r.id);
                    return (
                      <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{r.label}</p>
                          <p className="text-xs text-gray-400">{r.sub}</p>
                        </div>
                        <button onClick={() => !already && addEntity(r.id)}
                          disabled={already || addingId === r.id}
                          className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1 ${
                            already ? "bg-gray-100 text-gray-400 cursor-default" :
                            "bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                          }`}>
                          {addingId === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                          {already ? "In basket" : "Add"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── ITEM: Scan by barcode ── */}
          {basket.basketType === "ITEM" && <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h2 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <Barcode className="w-4 h-4 text-indigo-500" /> {t("addByBarcode")}
              <span className="text-xs font-normal text-gray-400">{t("addByBarcodeHint")}</span>
            </h2>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  ref={scanRef}
                  type="text"
                  value={scanQuery}
                  onChange={(e) => setScanQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleScan()}
                  placeholder={t("scanPlaceholder")}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  autoFocus
                />
              </div>
              <button
                onClick={() => setScanTagged(!scanTagged)}
                title={scanTagged ? "Will add as TAGGED — click to switch to untagged" : "Will add as UNTAGGED — click to switch to tagged"}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border font-medium transition-colors ${
                  scanTagged
                    ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                    : "border-gray-200 text-gray-400 hover:text-gray-600"
                }`}
              >
                {scanTagged ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                <span className="hidden sm:inline text-xs">{scanTagged ? t("taggedCap") : t("untaggedCap")}</span>
              </button>
              <button onClick={handleScan} disabled={scanBusy || !scanQuery.trim()}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {scanBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : t("add")}
              </button>
            </div>
            {scanMsg && (
              <div className={`mt-2 flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${
                scanMsg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
              }`}>
                {scanMsg.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
                {scanMsg.text}
              </div>
            )}
          </div>}

          {/* ── ITEM: Book title search ── */}
          {basket.basketType === "ITEM" && <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h2 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <Search className="w-4 h-4 text-indigo-500" /> {t("addBySearch")}
            </h2>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  placeholder={t("searchPlaceholder")}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>
              <button onClick={handleSearch} disabled={searchBusy || !searchQ.trim()}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {searchBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </button>
            </div>

            {searchRes.length > 0 && (
              <div className="mt-3 border border-gray-100 rounded-lg overflow-hidden">
                {searchRes.map((book) => {
                  const isOpen = pickerBookId === book.id;
                  return (
                    <div key={book.id} className="divide-y divide-gray-50">
                      <div className="flex items-center gap-3 px-4 py-2.5">
                        <BookOpen className="w-4 h-4 text-gray-300 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-sm font-medium text-gray-800 truncate">{book.title}</p>
                            <MatBadge type={book.materialType} />
                          </div>
                          <p className="text-xs text-gray-400">
                            {book.author?.name ?? "—"}
                            {(book.shelfLocation?.name ?? book.location) ? ` · ${book.shelfLocation?.name ?? book.location}` : ""}
                          </p>
                        </div>
                        <button
                          onClick={() => openCopyPicker(book.id)}
                          className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                            isOpen ? "bg-indigo-600 text-white" : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                          }`}
                        >
                          {isOpen ? t("cancel") : t("addCopies")}
                        </button>
                      </div>
                      {isOpen && (
                        <div className="bg-indigo-50/50 px-4 py-3 space-y-2">
                          {pickerLoading ? (
                            <div className="flex items-center gap-2 text-xs text-gray-400 py-1">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t("loadingCopies")}
                            </div>
                          ) : pickerCopies.length === 0 ? (
                            <p className="text-xs text-gray-400">{t("noCopies")}</p>
                          ) : (
                            <>
                              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                                {pickerCopies.map((c) => {
                                  const avail   = c.status === "AVAILABLE" || c.status === "STOCK";
                                  const inBskt  = inBasketCopyIds.has(c.id);
                                  const disabled = !avail || inBskt;
                                  return (
                                    <label key={c.id} className={`flex items-center gap-2 text-xs ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}>
                                      <input type="checkbox" checked={pickerSel.has(c.id)} disabled={disabled}
                                        onChange={() => {
                                          setPickerSel((prev) => { const n = new Set(prev); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; });
                                        }}
                                        className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-400" />
                                      <span className="font-bold text-indigo-700 w-5">#{c.copyNumber}</span>
                                      <span className="font-mono text-gray-700 flex-1 truncate">{c.barcode ?? "—"}</span>
                                      <span className="text-gray-500">{c.condition}</span>
                                      <span className={`px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide text-[9px] ${inBskt ? "bg-purple-100 text-purple-600" : avail ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                                        {inBskt ? t("inBasket") : c.status}
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                              <div className="flex items-center gap-2 pt-1 flex-wrap">
                                <button onClick={submitCopyPicker} disabled={pickerBusy || pickerSel.size === 0}
                                  className="flex items-center gap-1 text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                                  {pickerBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                                  Add {pickerSel.size > 0 ? pickerSel.size : ""} cop{pickerSel.size !== 1 ? "ies" : "y"}
                                </button>
                                <button onClick={() => {
                                  setPickerSel(new Set(pickerCopies.filter((c) => (c.status === "AVAILABLE" || c.status === "STOCK") && !inBasketCopyIds.has(c.id)).map((c) => c.id)));
                                }} className="text-xs text-indigo-600 hover:underline">{t("allAvailable")}</button>
                                <button
                                  onClick={() => setPickerTagged(!pickerTagged)}
                                  title={pickerTagged ? "Will add as TAGGED" : "Will add as UNTAGGED"}
                                  className={`ml-auto flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-colors ${
                                    pickerTagged
                                      ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                                      : "border-gray-200 text-gray-400 hover:text-gray-600"
                                  }`}
                                >
                                  {pickerTagged ? <CheckSquare className="w-3 h-3" /> : <Square className="w-3 h-3" />}
                                  {pickerTagged ? t("taggedCap") : t("untaggedCap")}
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>}

          {/* ── Items list (type-aware) ── */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800">
                {basket.basketType === "ITEM"   ? t("copiesInBasket", { count: totalCount }) :
                 basket.basketType === "AUTHOR" ? `Authors in basket (${totalCount})` :
                 basket.basketType === "MEMBER" ? `Members in basket (${totalCount})` :
                 `E-books in basket (${totalCount})`}
              </h2>
            </div>
            {totalCount === 0 ? (
              <div className="p-10 text-center text-gray-400 text-sm">
                <ShoppingBasket className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                {t("basketEmpty")}
              </div>
            ) : (
              <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
                {basket.items.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 px-5 py-2.5">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${item.tagged ? "bg-indigo-500" : "bg-gray-300"}`} />

                    {/* ITEM */}
                    {basket.basketType === "ITEM" && (
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm font-medium text-gray-800 truncate">{item.book?.title}</p>
                          <MatBadge type={item.book?.materialType ?? ""} />
                        </div>
                        <p className="text-xs font-mono mt-0.5 flex items-center gap-1.5 flex-wrap">
                          <span className="text-indigo-600 font-semibold">{item.copy?.barcode ?? "—"}</span>
                          <span className="text-[10px] px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded font-bold uppercase tracking-wide">
                            Copy #{item.copy?.copyNumber}
                          </span>
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {(item.book?.shelfLocation?.name ?? item.book?.location) ? `${item.book?.shelfLocation?.name ?? item.book?.location} · ` : ""}
                          {item.book?.author?.name ?? ""}
                        </p>
                      </div>
                    )}

                    {/* AUTHOR */}
                    {basket.basketType === "AUTHOR" && (
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800">{item.author?.name ?? "—"}</p>
                        <p className="text-xs text-gray-400">{item.author?._count?.books ?? 0} books</p>
                      </div>
                    )}

                    {/* MEMBER */}
                    {basket.basketType === "MEMBER" && (
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800">{item.member?.name ?? "—"}</p>
                        <p className="text-xs text-gray-400 font-mono">
                          {item.member?.memberId ?? "—"}
                          {item.member?.memberType && <span className="ml-2 normal-case font-sans">{item.member.memberType}</span>}
                        </p>
                      </div>
                    )}

                    {/* EBOOK */}
                    {basket.basketType === "EBOOK" && (
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800">{item.ebook?.title ?? "—"}</p>
                        <p className="text-xs text-gray-400">{item.ebook?.ebookType ?? ""}</p>
                      </div>
                    )}

                    {basket.basketType === "ITEM" && <CondBadge cond={item.copy?.condition ?? ""} />}
                    <button
                      onClick={() => {
                        if (basket.basketType === "ITEM")   removeCopy(item.copy?.id ?? "");
                        else if (basket.basketType === "AUTHOR") removeEntity("authorId", item.authorId ?? "");
                        else if (basket.basketType === "MEMBER") removeEntity("memberId", item.memberId ?? "");
                        else if (basket.basketType === "EBOOK")  removeEntity("ebookId",  item.ebookId  ?? "");
                      }}
                      className="p-1 text-gray-300 hover:text-red-500 transition-colors shrink-0">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════ TAG TAB ═══════════════════════════ */}
      {activeTab === "tag" && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">{t("tagBooksOnOff")}</h2>
            <div className="flex gap-2">
              <button onClick={() => tagAll("tag")}
                className="flex items-center gap-1 text-xs px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 font-medium transition-colors">
                <CheckSquare className="w-3.5 h-3.5" /> {t("tagAll")}
              </button>
              <button onClick={() => tagAll("untag")}
                className="flex items-center gap-1 text-xs px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 font-medium transition-colors">
                <Square className="w-3.5 h-3.5" /> {t("untagAll")}
              </button>
            </div>
          </div>

          {totalCount === 0 ? (
            <div className="p-10 text-center text-gray-400 text-sm">
              <Tag className="w-10 h-10 text-gray-200 mx-auto mb-2" />
              {t("addCopiesFirst")}
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {basket.items.map((item) => (
                <div
                  key={item.id}
                  onClick={() => toggleTag(item.copy?.id ?? item.id, !item.tagged)}
                  className="flex items-center gap-4 px-5 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  {item.tagged
                    ? <CheckSquare className="w-5 h-5 text-indigo-500 shrink-0" />
                    : <Square      className="w-5 h-5 text-gray-300 shrink-0" />
                  }
                  <div className="flex-1 min-w-0">
                    {basket.basketType === "ITEM" && <>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-medium text-gray-800 truncate">{item.book?.title}</p>
                        <MatBadge type={item.book?.materialType ?? ""} />
                      </div>
                      <p className="text-xs font-mono mt-0.5 flex items-center gap-1.5">
                        <span className="text-indigo-600 font-semibold">{item.copy?.barcode ?? "—"}</span>
                        <span className="text-[10px] px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded font-bold uppercase tracking-wide">Copy #{item.copy?.copyNumber}</span>
                      </p>
                    </>}
                    {basket.basketType === "AUTHOR" && <p className="text-sm font-medium text-gray-800">{item.author?.name ?? "—"}</p>}
                    {basket.basketType === "MEMBER" && <>
                      <p className="text-sm font-medium text-gray-800">{item.member?.name ?? "—"}</p>
                      <p className="text-xs text-gray-400 font-mono">{item.member?.memberId ?? ""}</p>
                    </>}
                    {basket.basketType === "EBOOK" && <p className="text-sm font-medium text-gray-800">{item.ebook?.title ?? "—"}</p>}
                  </div>
                  {basket.basketType === "ITEM" && <CondBadge cond={item.copy?.condition ?? ""} />}
                  <span className={`text-xs font-semibold ${item.tagged ? "text-indigo-600" : "text-gray-400"}`}>
                    {item.tagged ? t("taggedCap") : t("untaggedCap")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════ ACTIONS TAB ═══════════════════════ */}
      {activeTab === "actions" && (
        <div className="space-y-4">

          {/* Scope selector */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <p className="text-sm font-semibold text-gray-700 mb-3">{t("applyActionsTo")}</p>
            <div className="flex gap-2">
              {(["tagged", "all"] as const).map((s) => (
                <button key={s} onClick={() => setScope(s)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    scope === s ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}>
                  {s === "tagged" ? t("taggedOnly", { count: taggedCount }) : t("allInBasket", { count: totalCount })}
                </button>
              ))}
            </div>
          </div>

          {/* Action sub-tabs — filtered per basket type */}
          <div className="flex gap-2 flex-wrap">
            {[
              // ITEM only
              { id: "condition",      label: t("setCondition"),    icon: Star,        types: ["ITEM"] },
              { id: "move-location",  label: "Move Location",      icon: MapPin,      types: ["ITEM"] },
              { id: "move-branch",    label: "Move Branch",        icon: Building2,   types: ["ITEM"] },
              { id: "repair",         label: t("sendRepair"),      icon: Wrench,      types: ["ITEM"] },
              { id: "withdraw",       label: t("withdraw"),        icon: BookX,       types: ["ITEM"] },
              { id: "archive",        label: t("archive"),         icon: Archive,     types: ["ITEM"] },
              { id: "restore",        label: t("restore"),         icon: RotateCcw,   types: ["ITEM"] },
              { id: "inventory-mark", label: t("markInventoried"), icon: BookCheck,   types: ["ITEM"] },
              // EBOOK only
              { id: "toggle-public",  label: "Set Public/Private", icon: BookMarked,  types: ["EBOOK"] },
              // MEMBER only
              { id: "activate",       label: "Activate",           icon: UserCheck,   types: ["MEMBER"] },
              { id: "deactivate",     label: "Deactivate",         icon: UserX,       types: ["MEMBER"] },
              { id: "extend-expiry",  label: "Extend Expiry",      icon: CalendarPlus, types: ["MEMBER"] },
              // Delete — not for ITEM (books are deleted individually or via withdraw/archive)
              { id: "delete",         label: "Delete",             icon: Trash2,      types: ["AUTHOR","MEMBER","EBOOK"] },
              // All types
              { id: "export",         label: t("exportList"),      icon: Download,    types: ["ITEM","EBOOK","AUTHOR","MEMBER"] },
            ]
              .filter(a => a.types.includes(basket.basketType))
              .map(({ id, label, icon: Icon }) => (
                <button key={id} onClick={() => { setActionTab(id); setActionMsg(null); }}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    actionTab === id ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}>
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
          </div>

          {/* Action panel */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-4">

            {actionTab === "condition" && basket.basketType === "ITEM" && (
              <>
                <p className="text-sm text-gray-600">{t("conditionDesc")}</p>
                <select
                  value={condValue}
                  onChange={(e) => setCondValue(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                >
                  <option value="">{t("selectCondition")}</option>
                  {Object.keys(BookCondition)
                    .filter((c) => !["WITHDRAWN", "ARCHIVED"].includes(c))
                    .map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <button onClick={() => runAction("condition")} disabled={actionBusy || !condValue}
                  className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-60 transition-colors">
                  {actionBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                  <Star className="w-4 h-4" /> {t("setConditionBtn")}
                </button>
              </>
            )}

            {actionTab === "repair" && basket.basketType === "ITEM" && (
              <>
                <p className="text-sm text-gray-600">{t("repairDesc")}</p>
                <input
                  type="text"
                  value={reasonVal}
                  onChange={(e) => setReasonVal(e.target.value)}
                  placeholder={t("reasonPlaceholder")}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
                <button onClick={() => runAction("repair")} disabled={actionBusy}
                  className="flex items-center gap-2 px-4 py-2.5 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-60 transition-colors">
                  {actionBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                  <Wrench className="w-4 h-4" /> {t("sendRepairBtn")}
                </button>
              </>
            )}

            {actionTab === "withdraw" && basket.basketType === "ITEM" && (
              <>
                <p className="text-sm text-gray-600">{t("withdrawDesc")}</p>
                <input
                  type="text"
                  value={reasonVal}
                  onChange={(e) => setReasonVal(e.target.value)}
                  placeholder={t("withdrawReasonPlaceholder")}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
                <button onClick={() => runAction("withdraw")} disabled={actionBusy}
                  className="flex items-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60 transition-colors">
                  {actionBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                  <BookX className="w-4 h-4" /> {t("withdrawBtn")}
                </button>
              </>
            )}

            {actionTab === "archive" && basket.basketType === "ITEM" && (
              <>
                <p className="text-sm text-gray-600">{t("archiveDesc")}</p>
                <input
                  type="text"
                  value={reasonVal}
                  onChange={(e) => setReasonVal(e.target.value)}
                  placeholder={t("reasonPlaceholder")}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
                <button onClick={() => runAction("archive")} disabled={actionBusy}
                  className="flex items-center gap-2 px-4 py-2.5 bg-slate-700 text-white rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-60 transition-colors">
                  {actionBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                  <Archive className="w-4 h-4" /> {t("archiveBtn")}
                </button>
              </>
            )}

            {actionTab === "restore" && basket.basketType === "ITEM" && (
              <>
                <p className="text-sm text-gray-600">{t("restoreDesc")}</p>
                <button onClick={() => runAction("restore")} disabled={actionBusy}
                  className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-60 transition-colors">
                  {actionBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                  <RotateCcw className="w-4 h-4" /> {t("restoreBtn")}
                </button>
              </>
            )}

            {actionTab === "inventory-mark" && basket.basketType === "ITEM" && (
              <>
                <p className="text-sm text-gray-600">{t("inventoryDesc")}</p>
                <button onClick={() => runAction("inventory-mark")} disabled={actionBusy}
                  className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition-colors">
                  {actionBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                  <BookCheck className="w-4 h-4" /> {t("markInventoriedBtn")}
                </button>
              </>
            )}

            {actionTab === "move-location" && basket.basketType === "ITEM" && (
              <>
                <p className="text-sm text-gray-600">Move selected books to a different shelf location.</p>
                <select value={moveLocId} onChange={e => setMoveLocId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                  <option value="">Select shelf location…</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                <button onClick={() => runAction("move-location", { locationId: moveLocId })} disabled={actionBusy || !moveLocId}
                  className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-60 transition-colors">
                  {actionBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                  <MapPin className="w-4 h-4" /> Move Location
                </button>
              </>
            )}

            {actionTab === "move-branch" && basket.basketType === "ITEM" && (
              <>
                <p className="text-sm text-gray-600">Transfer selected copies to a different branch.</p>
                <select value={moveBranchId} onChange={e => setMoveBranchId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                  <option value="">Select branch…</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <button onClick={() => runAction("move-branch", { branchId: moveBranchId })} disabled={actionBusy || !moveBranchId}
                  className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-60 transition-colors">
                  {actionBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                  <Building2 className="w-4 h-4" /> Move Branch
                </button>
              </>
            )}

            {actionTab === "delete" && basket.basketType !== "ITEM" && (
              <>
                <p className="text-sm text-gray-600">
                  Permanently delete all {scope === "tagged" ? "tagged" : ""}{" "}
                  {basket.basketType === "AUTHOR" ? "authors" : basket.basketType === "MEMBER" ? "members" : "e-books"} in this basket.
                  <span className="ml-1 font-semibold text-red-600">This cannot be undone.</span>
                </p>
                <button
                  onClick={() => {
                    const label = basket.basketType === "AUTHOR" ? "authors" : basket.basketType === "MEMBER" ? "members" : "e-books";
                    if (confirm(`Delete all ${scope} ${label}? This is permanent.`)) runAction("delete");
                  }}
                  disabled={actionBusy}
                  className="flex items-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60 transition-colors">
                  {actionBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                  <Trash2 className="w-4 h-4" /> Delete permanently
                </button>
              </>
            )}

            {actionTab === "export" && (
              <>
                <p className="text-sm text-gray-600">{t("exportDesc")}</p>
                <button onClick={exportCSV}
                  className="flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors">
                  <Download className="w-4 h-4" /> {t("downloadCSV")}
                </button>
              </>
            )}

            {/* ── EBOOK: Toggle public/private ── */}
            {actionTab === "toggle-public" && (
              <>
                <p className="text-sm text-gray-600">
                  Set all {scope === "tagged" ? "tagged" : ""} e-books in this basket to public or private.
                </p>
                <div className="flex gap-2">
                  <button onClick={() => runAction("set-public", { isPublic: "true" })} disabled={actionBusy}
                    className="flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-60 transition-colors">
                    {actionBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                    <BookMarked className="w-4 h-4" /> Set Public
                  </button>
                  <button onClick={() => runAction("set-public", { isPublic: "false" })} disabled={actionBusy}
                    className="flex items-center gap-2 px-4 py-2.5 bg-gray-600 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-60 transition-colors">
                    {actionBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                    <BookMarked className="w-4 h-4" /> Set Private
                  </button>
                </div>
              </>
            )}

            {/* ── MEMBER: Activate / Deactivate ── */}
            {(actionTab === "activate" || actionTab === "deactivate") && (
              <>
                <p className="text-sm text-gray-600">
                  {actionTab === "activate"
                    ? `Activate all ${scope === "tagged" ? "tagged" : ""} members in this basket.`
                    : `Deactivate all ${scope === "tagged" ? "tagged" : ""} members in this basket.`}
                </p>
                <button onClick={() => runAction(actionTab)} disabled={actionBusy}
                  className={`flex items-center gap-2 px-4 py-2.5 text-white rounded-lg text-sm font-medium disabled:opacity-60 transition-colors ${
                    actionTab === "activate" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"
                  }`}>
                  {actionBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                  {actionTab === "activate" ? <UserCheck className="w-4 h-4" /> : <UserX className="w-4 h-4" />}
                  {actionTab === "activate" ? "Activate members" : "Deactivate members"}
                </button>
              </>
            )}

            {/* ── MEMBER: Extend expiry ── */}
            {actionTab === "extend-expiry" && (
              <>
                <p className="text-sm text-gray-600">
                  Set a new expiry date for all {scope === "tagged" ? "tagged" : ""} members in this basket.
                </p>
                <input type="date" value={locValue} onChange={e => setLocValue(e.target.value)}
                  min={new Date().toISOString().slice(0, 10)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
                <button onClick={() => runAction("extend-expiry", { expireDate: locValue })} disabled={actionBusy || !locValue}
                  className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition-colors">
                  {actionBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                  <CalendarPlus className="w-4 h-4" /> Apply expiry date
                </button>
              </>
            )}

            {/* Action result message */}
            {actionMsg && (
              <div className={`flex items-center gap-2 text-sm px-3 py-2.5 rounded-lg ${
                actionMsg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
              }`}>
                {actionMsg.ok
                  ? <CheckCircle2 className="w-4 h-4 shrink-0" />
                  : <AlertTriangle className="w-4 h-4 shrink-0" />}
                {actionMsg.text}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium
          ${toast.ok ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
