"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Loader2, Package, CheckCircle, AlertTriangle, PackageX, Archive, Edit2, X, Save, Printer, User, ExternalLink, ShoppingBasket, CheckSquare, Square, Tag } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";

interface Branch { id: string; name: string }

interface Copy {
  id:           string;
  copyNumber:   number;
  barcode:      string | null;
  rfid:         string | null;
  condition:    string;
  status:       string;
  loanable:     boolean;
  price:        number | null;
  acquiredAt:   string;
  notes:        string | null;
  branchId:     string | null;
  labelPrinted: boolean;
  branch:       { id: string; name: string } | null;
  currentLoan?: {
    id:      string;
    dueDate: string;
    status:  string;
    member:  { id: string; memberId: string; name: string };
  } | null;
  baskets?: { id: string; name: string; tagged: boolean; direct: boolean }[];
}

const STATUS_META: Record<string, { labelKey: string; cls: string; icon: typeof Package }> = {
  STOCK:     { labelKey: "statusStock",     cls: "bg-amber-50  text-amber-700",  icon: Package      },
  AVAILABLE: { labelKey: "statusAvailable", cls: "bg-green-50  text-green-700",  icon: CheckCircle  },
  FOR_SALE:  { labelKey: "statusForSale",   cls: "bg-violet-50 text-violet-700", icon: Package      },
  SOLD:      { labelKey: "statusSold",      cls: "bg-pink-50   text-pink-700",   icon: Package      },
  BORROWED:  { labelKey: "statusBorrowed",  cls: "bg-blue-50   text-blue-700",   icon: Package      },
  RESERVED:  { labelKey: "statusReserved",  cls: "bg-purple-50 text-purple-700", icon: Package      },
  LOST:      { labelKey: "statusLost",      cls: "bg-red-50    text-red-700",    icon: PackageX     },
  DAMAGED:   { labelKey: "statusDamaged",   cls: "bg-orange-50 text-orange-700", icon: AlertTriangle },
  WITHDRAWN: { labelKey: "statusWithdrawn", cls: "bg-gray-100  text-gray-500",   icon: Archive      },
};

const CONDITION_LABEL_KEYS: Record<string, string> = {
  EXCELLENT: "conditionExcellent",
  GOOD:      "conditionGood",
  FAIR:      "conditionFair",
  POOR:      "conditionPoor",
  DAMAGED:   "conditionDamaged",
  LOST:      "conditionLost",
  WITHDRAWN: "conditionWithdrawn",
  ARCHIVED:  "conditionArchived",
};

const CONDITIONS = ["EXCELLENT", "GOOD", "FAIR", "POOR", "DAMAGED"] as const;
const STATUSES   = ["STOCK", "AVAILABLE", "FOR_SALE", "BORROWED", "RESERVED", "SOLD", "LOST", "DAMAGED", "WITHDRAWN"] as const;

// BORROWED / RESERVED / SOLD are set exclusively by their own flows (loans, reservations, sale orders).
// Librarians must not set these manually — the dropdown only shows manually-safe statuses.
const MANUAL_STATUSES = STATUSES.filter(
  (s) => !["BORROWED", "RESERVED", "SOLD"].includes(s),
) as readonly string[];

interface BasketSummary { id: string; name: string }

export default function BookCopiesPanel({ bookId }: { bookId: string }) {
  const locale = useLocale();
  const t      = useTranslations("copies");
  const tb     = useTranslations("books");
  const [copies,     setCopies]     = useState<Copy[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [busy,       setBusy]       = useState(false);
  const [editing,    setEditing]    = useState<string | null>(null);
  const [error,      setError]      = useState<string | null>(null);
  const [success,    setSuccess]    = useState<string | null>(null);
  const [quantity,   setQuantity]   = useState(1);
  const [labelBusy,  setLabelBusy]  = useState<Set<string>>(new Set());

  // Branch list for the copy editor
  const [branches, setBranches] = useState<Branch[]>([]);
  useEffect(() => {
    fetch("/api/branches")
      .then((r) => r.ok ? r.json() : [])
      .then((brs: Branch[]) => { if (Array.isArray(brs)) setBranches(brs); })
      .catch(() => {});
  }, []);

  // Baskets dropdown state
  const [baskets,    setBaskets]    = useState<BasketSummary[]>([]);
  const [basketOpen, setBasketOpen] = useState<string | null>(null); // copyId whose picker is open
  const [basketBusy, setBasketBusy] = useState(false);
  const [basketMsg,  setBasketMsg]  = useState<{ copyId: string; ok: boolean; text: string } | null>(null);

  // Load baskets lazily — only once on first open
  async function ensureBaskets() {
    if (baskets.length > 0) return;
    try {
      const res = await fetch("/api/baskets");
      if (res.ok) setBaskets(await res.json());
    } catch { /* ignore */ }
  }

  async function addCopyToBasket(copyId: string, basketId: string, tagged: boolean) {
    setBasketBusy(true); setBasketMsg(null);
    const res = await fetch(`/api/baskets/${basketId}/items`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ copyId, tagged }),
    });
    if (res.ok) {
      const basket = baskets.find((b) => b.id === basketId);
      const label  = tagged ? "tagged" : "untagged";
      setBasketMsg({ copyId, ok: true, text: `Added (${label}) to "${basket?.name ?? "basket"}"` });
      setBasketOpen(null);
      fetchCopies();
    } else {
      const d = await res.json().catch(() => ({}));
      setBasketMsg({ copyId, ok: false, text: typeof d.error === "string" ? d.error : "Failed" });
    }
    setBasketBusy(false);
  }

  function printLabels(copyIds: string[]) {
    if (copyIds.length === 0) return;
    const url = `/${locale}/print/labels?copyIds=${copyIds.join(",")}&size=medium&copies=1`;
    window.open(url, "_blank", "width=900,height=700,menubar=yes,toolbar=yes");
  }

  async function fetchCopies() {
    setLoading(true);
    const res = await fetch(`/api/books/${bookId}/copies`);
    if (res.ok) setCopies(await res.json());
    setLoading(false);
  }

  useEffect(() => { fetchCopies(); }, [bookId]); // eslint-disable-line

  async function toggleLabel(copy: Copy) {
    setLabelBusy((s) => new Set(s).add(copy.id));
    const res = await fetch(`/api/copies/${copy.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ labelPrinted: !copy.labelPrinted }),
    });
    if (res.ok) {
      setCopies((prev) => prev.map((c) => c.id === copy.id ? { ...c, labelPrinted: !copy.labelPrinted } : c));
    }
    setLabelBusy((s) => { const ns = new Set(s); ns.delete(copy.id); return ns; });
  }

  async function addCopy() {
    setBusy(true); setError(null); setSuccess(null);
    const qty = Math.min(50, Math.max(1, quantity));
    const res = await fetch(`/api/books/${bookId}/copies`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ quantity: qty }),
    });
    if (res.ok) {
      fetchCopies();
      setSuccess(qty === 1 ? "1 copy added to stock." : `${qty} copies added to stock.`);
      setTimeout(() => setSuccess(null), 4000);
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Failed to add copies");
    }
    setBusy(false);
  }

  async function deleteCopy(id: string) {
    if (!confirm(t("confirmDelete"))) return;
    setBusy(true); setError(null);
    const res = await fetch(`/api/copies/${id}`, { method: "DELETE" });
    if (res.ok) {
      fetchCopies();
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Failed to delete copy");
    }
    setBusy(false);
  }

  async function saveCopy(id: string, patch: Partial<Copy>) {
    setBusy(true); setError(null); setSuccess(null);
    const res = await fetch(`/api/copies/${id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(patch),
    });
    if (res.ok) {
      setEditing(null);
      fetchCopies();
      if (res.headers.get("X-Cart-Item-Removed") === "1") {
        setSuccess("Copy updated. It was removed from a member's cart because it is no longer For Sale.");
        setTimeout(() => setSuccess(null), 6000);
      }
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Failed to update copy");
    }
    setBusy(false);
  }

  return (
    <div className="border border-gray-100 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-indigo-500" />
          <h3 className="text-sm font-semibold text-gray-700">{t("title")}</h3>
          <span className="text-xs px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded font-semibold">{copies.length}</span>
          <span className="text-xs text-green-600 font-medium">
            · {copies.filter((c) => c.status === "AVAILABLE").length} {t("available")}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {copies.length > 0 && (
            <button
              type="button"
              onClick={() => printLabels(copies.map((c) => c.id))}
              disabled={busy}
              className="flex items-center gap-1 text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50"
              title="Print barcode labels for all copies"
            >
              <Printer className="w-3.5 h-3.5" />
              {t("printAllLabels")}
            </button>
          )}
          {/* Quantity input */}
          <div className="flex items-center gap-0.5 border border-gray-200 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={busy || quantity <= 1}
              className="px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition-colors"
            >−</button>
            <input
              type="number"
              min={1}
              max={50}
              value={quantity}
              onChange={(e) => setQuantity(Math.min(50, Math.max(1, Number(e.target.value) || 1)))}
              className="w-9 text-center text-xs font-semibold text-gray-700 border-none outline-none py-1.5 bg-white"
            />
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.min(50, q + 1))}
              disabled={busy || quantity >= 50}
              className="px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition-colors"
            >+</button>
          </div>
          <button
            type="button"
            onClick={addCopy}
            disabled={busy}
            className="flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-2.5 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            {quantity > 1 ? `${t("addCopy")} ×${quantity}` : t("addCopy")}
          </button>
        </div>
      </div>
      <p className="text-[11px] text-gray-400 -mt-1">
        {t("eachCopyHint")}
      </p>

      {error   && <p className="text-xs text-red-600   bg-red-50   border border-red-200   px-3 py-2 rounded-lg">{error}</p>}
      {success && <p className="text-xs text-green-700 bg-green-50 border border-green-200 px-3 py-2 rounded-lg">✓ {success}</p>}

      {loading ? (
        <div className="text-center text-xs text-gray-400 py-6">{t("loading")}</div>
      ) : copies.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-6">{t("noCopies")}</p>
      ) : (
        <div className="space-y-2">
          {copies.map((c) => (
            <CopyRow
              key={c.id}
              copy={c}
              locale={locale}
              t={t}
              tb={tb}
              branches={branches}
              isEditing={editing === c.id}
              onEdit={() => setEditing(c.id)}
              onCancel={() => setEditing(null)}
              onSave={(patch) => saveCopy(c.id, patch)}
              onDelete={() => deleteCopy(c.id)}
              onPrint={() => printLabels([c.id])}
              busy={busy}
              baskets={baskets}
              basketOpen={basketOpen === c.id}
              basketBusy={basketBusy}
              basketMsg={basketMsg?.copyId === c.id ? basketMsg : null}
              onOpenBasketPicker={() => { ensureBaskets(); setBasketOpen(basketOpen === c.id ? null : c.id); setBasketMsg(null); }}
              onCloseBasketPicker={() => setBasketOpen(null)}
              onAddToBasket={(basketId, tagged) => addCopyToBasket(c.id, basketId, tagged)}
              onToggleLabel={() => toggleLabel(c)}
              isLabelBusy={labelBusy.has(c.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CopyRow({
  copy, locale, t, tb, branches, isEditing, onEdit, onCancel, onSave, onDelete, onPrint, busy,
  baskets, basketOpen, basketBusy, basketMsg, onOpenBasketPicker, onCloseBasketPicker, onAddToBasket,
  onToggleLabel, isLabelBusy,
}: {
  copy: Copy;
  locale: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: (...args: any[]) => string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tb: (...args: any[]) => string;
  branches: Branch[];
  isEditing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (patch: Partial<Copy>) => void;
  onDelete: () => void;
  onPrint: () => void;
  busy: boolean;
  baskets: BasketSummary[];
  basketOpen: boolean;
  basketBusy: boolean;
  basketMsg: { ok: boolean; text: string } | null;
  onOpenBasketPicker: () => void;
  onCloseBasketPicker: () => void;
  onAddToBasket: (basketId: string, tagged: boolean) => void;
  onToggleLabel: () => void;
  isLabelBusy: boolean;
}) {
  const [form, setForm] = useState({
    barcode:   copy.barcode   ?? "",
    rfid:      copy.rfid      ?? "",
    condition: copy.condition,
    status:    copy.status,
    loanable:  copy.loanable,
    price:     copy.price?.toString() ?? "",
    notes:     copy.notes ?? "",
    branchId:  copy.branchId  ?? "",
  });

  // Reset form when entering edit mode
  useEffect(() => {
    if (isEditing) {
      setForm({
        barcode:   copy.barcode   ?? "",
        rfid:      copy.rfid      ?? "",
        condition: copy.condition,
        status:    copy.status,
        loanable:  copy.loanable,
        price:     copy.price?.toString() ?? "",
        notes:     copy.notes ?? "",
        branchId:  copy.branchId  ?? "",
      });
    }
  }, [isEditing, copy]);

  const meta = STATUS_META[copy.status] ?? STATUS_META.AVAILABLE;
  const StatusIcon = meta.icon;

  if (!isEditing) {
    const loan      = copy.currentLoan;
    const isOverdue = loan?.status === "OVERDUE";
    return (
      <div className={`bg-gray-50 hover:bg-gray-100 rounded-lg px-3 py-2 text-sm transition-colors ${loan ? "border-l-2 " + (isOverdue ? "border-red-400" : "border-blue-400") : ""}`}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-100 text-indigo-700 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0">
            #{copy.copyNumber}
          </div>
          <div className="flex-1 min-w-0 grid grid-cols-2 md:grid-cols-5 gap-2 items-center">
            <span className="text-xs font-mono text-gray-700 truncate flex items-center gap-1.5" title={copy.barcode ?? ""}>
              {copy.barcode ?? "—"}
              {!copy.loanable && (
                <span className="text-[9px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded font-bold uppercase tracking-wide flex-shrink-0">
                  {t("reference")}
                </span>
              )}
            </span>
            <span className="text-xs text-gray-500">{t(CONDITION_LABEL_KEYS[copy.condition] ?? copy.condition)}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium w-fit flex items-center gap-1 ${meta.cls}`}>
              <StatusIcon className="w-3 h-3" /> {t(meta.labelKey)}
            </span>
            <span className="text-xs text-gray-500">{copy.price != null ? `$${copy.price.toFixed(2)}` : "—"}</span>
            {copy.branch ? (
              <span className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full font-medium truncate" title={copy.branch.name}>
                {copy.branch.name}
              </span>
            ) : (
              <span className="text-xs text-gray-300">—</span>
            )}
          </div>
          {/* Add to basket — only for copies that are on the shelf */}
          <div className="relative">
            <button
              type="button"
              onClick={onOpenBasketPicker}
              disabled={copy.status !== "AVAILABLE"}
              className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded transition-colors disabled:opacity-30"
              title={copy.status === "AVAILABLE" ? t("addToBasket") : t("notAvailable", { status: copy.status })}
            >
              <ShoppingBasket className="w-3.5 h-3.5" />
            </button>
            {basketOpen && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-xl z-20 overflow-hidden">
                <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-700">{t("addToBasket")}</span>
                  <button type="button" onClick={onCloseBasketPicker} className="text-gray-400 hover:text-gray-600">
                    <X className="w-3 h-3" />
                  </button>
                </div>
                {baskets.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-gray-400">{t("noBaskets")}</p>
                ) : (
                  <>
                    <div className="px-3 py-1.5 flex items-center justify-end gap-3 bg-gray-50 border-b border-gray-100">
                      <span className="text-[10px] text-gray-400 flex items-center gap-0.5 mr-auto">{t("basket")}</span>
                      <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                        <Square className="w-3 h-3" /> {t("untagged")}
                      </span>
                      <span className="text-[10px] text-indigo-500 flex items-center gap-0.5">
                        <CheckSquare className="w-3 h-3" /> {t("tagged")}
                      </span>
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      {baskets.map((b) => (
                        <div key={b.id} className="flex items-center border-b border-gray-50 last:border-0">
                          <span className="flex-1 px-3 py-2 text-xs text-gray-700 truncate">{b.name}</span>
                          <button
                            type="button"
                            onClick={() => onAddToBasket(b.id, false)}
                            disabled={basketBusy}
                            title="Add to basket (untagged)"
                            className="px-2.5 py-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-50 transition-colors"
                          >
                            {basketBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => onAddToBasket(b.id, true)}
                            disabled={basketBusy}
                            title="Add to basket (tagged)"
                            className="px-2.5 py-2 text-indigo-400 hover:text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 transition-colors"
                          >
                            {basketBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckSquare className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
          {/* Label applied toggle */}
          <button
            type="button"
            onClick={onToggleLabel}
            disabled={isLabelBusy}
            title={copy.labelPrinted ? "Spine label applied — click to unmark" : "Mark spine label as applied"}
            className={`p-1.5 rounded transition-colors disabled:opacity-50 ${
              copy.labelPrinted
                ? "text-green-500 hover:text-green-700 hover:bg-green-50"
                : "text-amber-400 hover:text-amber-600 hover:bg-amber-50"
            }`}
          >
            {isLabelBusy
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Tag className="w-3.5 h-3.5" />}
          </button>
          <button type="button" onClick={onPrint} disabled={!copy.barcode} className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors disabled:opacity-30" title={copy.barcode ? "Print barcode label" : "No barcode to print"}>
            <Printer className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={onEdit} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Edit">
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={onDelete} disabled={busy || copy.status === "BORROWED"} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-30" title={copy.status === "BORROWED" ? "Cannot delete borrowed copy" : "Delete"}>
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {basketMsg && (
          <p className={`mt-1.5 ml-11 text-[11px] ${basketMsg.ok ? "text-green-600" : "text-red-500"}`}>
            {basketMsg.ok ? "✓ " : "⚠ "}{basketMsg.text}
          </p>
        )}

        {/* Borrower row — only shown when the copy is currently borrowed */}
        {loan && (
          <div className="mt-1.5 ml-11 flex items-center gap-2 text-[11px] flex-wrap">
            <User className="w-3 h-3 text-gray-400 flex-shrink-0" />
            <span className="text-gray-500">{t("borrowedBy")}</span>
            <Link
              href={`/${locale}/admin/members/${loan.member.id}`}
              className="inline-flex items-center gap-1 font-medium text-blue-600 hover:text-blue-800 hover:underline"
              title="View borrower history"
            >
              {loan.member.name}
              <span className="font-mono text-gray-400">({loan.member.memberId})</span>
              <ExternalLink className="w-2.5 h-2.5" />
            </Link>
            <span className={`px-1.5 py-0.5 rounded font-semibold ${isOverdue ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}>
              {isOverdue ? t("overdue") : t("due")} {new Date(loan.dueDate).toLocaleDateString()}
            </span>
          </div>
        )}

        {/* Basket membership — only copies directly in a basket */}
        {copy.baskets && copy.baskets.some((b) => b.direct) && (
          <div className="mt-1.5 ml-11 flex items-center gap-2 text-[11px] flex-wrap">
            <ShoppingBasket className="w-3 h-3 text-purple-400 flex-shrink-0" />
            <span className="text-gray-500">{copy.baskets.filter((b) => b.direct).length > 1 ? t("inBasketsLabel") : t("inBasketLabel")}</span>
            {copy.baskets.filter((b) => b.direct).map((b) => (
              <Link
                key={b.id}
                href={`/${locale}/admin/baskets/${b.id}`}
                className="inline-flex items-center gap-1 font-medium text-purple-600 hover:text-purple-800 hover:underline"
                title={`This copy is in "${b.name}" — ${b.tagged ? "tagged" : "untagged"}`}
              >
                {b.name}
                <span className={`px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide text-[9px] ${b.tagged ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-500"}`}>
                  {b.tagged ? t("tagged") : t("untagged")}
                </span>
                <ExternalLink className="w-2.5 h-2.5" />
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="bg-blue-50/50 border border-blue-200 rounded-lg px-3 py-3 space-y-2"
      onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
    >
      <div className="flex items-center gap-2 mb-1">
        <div className="w-7 h-7 bg-indigo-100 text-indigo-700 rounded-lg flex items-center justify-center text-xs font-bold">#{copy.copyNumber}</div>
        <span className="text-xs font-semibold text-gray-700">{t("editCopy")}</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        <input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })}
          placeholder={t("barcode")} className="px-2 py-1.5 text-xs border border-gray-200 rounded font-mono" />
        <input value={form.rfid} onChange={(e) => setForm({ ...form, rfid: e.target.value })}
          placeholder={t("rfid")} className="px-2 py-1.5 text-xs border border-gray-200 rounded font-mono" />
        <input value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })}
          type="number" min={0} step={0.01} placeholder={t("price")}
          className="px-2 py-1.5 text-xs border border-gray-200 rounded" />
        <select value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })}
          className="px-2 py-1.5 text-xs border border-gray-200 rounded">
          {CONDITIONS.map((c) => <option key={c} value={c}>{t(CONDITION_LABEL_KEYS[c] ?? c)}</option>)}
        </select>
        <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
          className="px-2 py-1.5 text-xs border border-gray-200 rounded">
          {MANUAL_STATUSES.map((s) => <option key={s} value={s}>{t(STATUS_META[s]?.labelKey ?? s)}</option>)}
        </select>
        {branches.length > 0 ? (
          <select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}
            className="px-2 py-1.5 text-xs border border-gray-200 rounded">
            <option value="">{tb("noBranch")}</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        ) : (
          <input value="" readOnly placeholder={tb("noBranch")} className="px-2 py-1.5 text-xs border border-gray-200 rounded text-gray-400" />
        )}
        <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder={t("notes")} className="px-2 py-1.5 text-xs border border-gray-200 rounded col-span-2 md:col-span-3" />
      </div>
      {/* Warn when moving a FOR_SALE copy to another status */}
      {copy.status === "FOR_SALE" && form.status !== "FOR_SALE" && (
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1.5 rounded-lg">
          ⚠️ This copy may be in a member&apos;s cart. Changing its status will automatically remove it from any active cart.
        </p>
      )}
      {/* Remind librarian that BORROWED / RESERVED / SOLD are managed by their own flows */}
      <p className="text-[10px] text-gray-400">
        Borrowed, Reserved, and Sold statuses are set automatically by the loan / reservation / sale flows — they are not available here.
      </p>

      <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer pt-1">
        <input
          type="checkbox"
          checked={form.loanable}
          onChange={(e) => setForm({ ...form, loanable: e.target.checked })}
          className="w-3.5 h-3.5 rounded border-gray-300 text-amber-600 focus:ring-amber-400"
        />
        <span>{t("loanable")} <span className="text-gray-400">{t("loanableDesc")}</span></span>
      </label>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} disabled={busy}
          className="flex items-center gap-1 text-xs text-gray-600 hover:bg-gray-100 px-2.5 py-1.5 rounded transition-colors">
          <X className="w-3 h-3" /> {t("cancel")}
        </button>
        <button type="button" onClick={() => onSave({
          barcode:   form.barcode   || null,
          rfid:      form.rfid      || null,
          condition: form.condition,
          status:    form.status,
          loanable:  form.loanable,
          price:     form.price ? Number(form.price) : null,
          notes:     form.notes || null,
          branchId:  form.branchId  || null,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)} disabled={busy}
          className="flex items-center gap-1 text-xs bg-blue-600 text-white hover:bg-blue-700 px-3 py-1.5 rounded font-medium transition-colors disabled:opacity-50">
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} {t("save")}
        </button>
      </div>
    </div>
  );
}
