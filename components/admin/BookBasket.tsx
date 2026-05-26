"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useBasket } from "@/contexts/BasketContext";
import {
  Tag, X, MapPin, Wrench, Archive, RotateCcw, Trash2,
  CheckSquare, Loader2, Package, Download, Star,
  BookX, BookCheck, AlignLeft,
} from "lucide-react";

/* ── Condition options ─────────────────────────────────────────── */
const CONDITIONS = [
  { value: "EXCELLENT", tKey: "conditionExcellent" as const },
  { value: "GOOD",      tKey: "conditionGood"      as const },
  { value: "FAIR",      tKey: "conditionFair"      as const },
  { value: "POOR",      tKey: "conditionPoor"      as const },
  { value: "DAMAGED",   tKey: "conditionDamaged"   as const },
  { value: "LOST",      tKey: "conditionLost"      as const },
];

/* ── All batch actions ─────────────────────────────────────────── */
type ActionKey =
  | "location" | "condition" | "withdraw" | "archive"
  | "restore"  | "repair"   | "note"     | "export"
  | null;

const ACTIONS = [
  { key: "location",  tKey: "moveLocation" as const, icon: MapPin,      color: "text-blue-600",   bg: "bg-blue-50"   },
  { key: "condition", tKey: "setCondition" as const, icon: Star,        color: "text-violet-600", bg: "bg-violet-50" },
  { key: "repair",    tKey: "sendRepair"   as const, icon: Wrench,      color: "text-orange-600", bg: "bg-orange-50" },
  { key: "withdraw",  tKey: "withdraw"     as const, icon: BookX,       color: "text-red-600",    bg: "bg-red-50"    },
  { key: "archive",   tKey: "archive"      as const, icon: Archive,     color: "text-amber-600",  bg: "bg-amber-50"  },
  { key: "restore",   tKey: "restore"      as const, icon: BookCheck,   color: "text-green-600",  bg: "bg-green-50"  },
  { key: "note",      tKey: "addReason"    as const, icon: AlignLeft,   color: "text-slate-600",  bg: "bg-slate-50"  },
  { key: "export",    tKey: "exportList"   as const, icon: Download,    color: "text-teal-600",   bg: "bg-teal-50"   },
] as const;

export default function BookBasket() {
  const basket = useBasket();
  const t  = useTranslations("bookBasket");
  const tc = useTranslations("common");

  const [open,        setOpen]        = useState(false);
  const [action,      setAction]      = useState<ActionKey>(null);
  const [busy,        setBusy]        = useState(false);
  const [toast,       setToast]       = useState<{ msg: string; ok: boolean } | null>(null);

  /* action payloads */
  const [location,    setLocation]    = useState("");
  const [condition,   setCondition]   = useState("GOOD");
  const [reason,      setReason]      = useState("");
  const [withdrawnAt, setWithdrawnAt] = useState(new Date().toISOString().slice(0, 10));

  if (basket.count === 0) return null;

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  async function runBatch(act: string, payload: Record<string, string> = {}) {
    setBusy(true);
    try {
      const res  = await fetch("/api/books/batch", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ action: act, bookIds: basket.items.map((b) => b.id), payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast(t("updatedToast", { count: data.updated ?? basket.count }));
        setAction(null);
        setReason("");
      } else {
        showToast(data.error ?? t("operationFailed"), false);
      }
    } catch {
      showToast(t("networkError"), false);
    } finally {
      setBusy(false);
    }
  }

  function handleAction(key: ActionKey) {
    if (key === "export") {
      const ids = basket.items.map((b) => b.id).join(",");
      window.location.href = `/api/books/export?format=xlsx&ids=${ids}`;
      return;
    }
    setAction(key);
  }

  function handleSubmit() {
    switch (action) {
      case "location":  return runBatch("location",  { location });
      case "condition": return runBatch("condition", { condition });
      case "withdraw":  return runBatch("withdraw",  { reason, withdrawnAt });
      case "archive":   return runBatch("archive",   { reason, withdrawnAt });
      case "restore":   return runBatch("restore");
      case "repair":    return runBatch("repair",    { reason });
      case "note":      return runBatch("repair",    { reason }); // reuse repair notes field
    }
  }

  const currentAction = ACTIONS.find((a) => a.key === action);

  return (
    <>
      {/* ── Floating tag button ─────────────────────────────────── */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white px-4 py-3 rounded-2xl shadow-2xl transition-colors"
      >
        <Tag className="w-5 h-5" />
        <span className="font-bold text-sm">{basket.count}</span>
        <span className="text-sm font-normal opacity-80">{t(basket.count === 1 ? "taggedSingular" : "taggedPlural")}</span>
      </button>

      {/* ── Slide-up panel ─────────────────────────────────────── */}
      {open && (
        <div className="fixed bottom-20 right-6 z-50 w-72 bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col max-h-[78vh]">
          {/* header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-indigo-500" />
              <span className="text-sm font-semibold text-gray-800">
                {t("taggedCount", { count: basket.count })}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { basket.clear(); setOpen(false); }}
                className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
              >
                {t("clearAll")}
              </button>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* tagged book list */}
          <div className="overflow-y-auto flex-1 divide-y divide-gray-50 min-h-0">
            {basket.items.map((book) => (
              <div key={book.id} className="flex items-center gap-2 px-4 py-2">
                <Package className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-800 truncate">{book.title}</p>
                  {(book.shelfLocation?.name ?? book.location) && (
                    <p className="text-xs text-gray-400 truncate">{book.shelfLocation?.name ?? book.location}</p>
                  )}
                </div>
                <button
                  onClick={() => basket.remove(book.id)}
                  className="shrink-0 p-1 text-gray-300 hover:text-red-400 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>

          {/* action grid */}
          <div className="border-t border-gray-100 p-3">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
              {t("actionsForTagged")}
            </p>
            <div className="grid grid-cols-4 gap-1.5">
              {ACTIONS.map(({ key, tKey, icon: Icon, color, bg }) => (
                <button
                  key={key}
                  onClick={() => handleAction(key as ActionKey)}
                  title={t(tKey)}
                  className={`flex flex-col items-center gap-1 py-2 px-1 rounded-xl ${bg} hover:brightness-95 transition-all`}
                >
                  <Icon className={`w-4 h-4 ${color}`} />
                  <span className={`text-[10px] font-semibold leading-tight text-center ${color}`}>
                    {t(tKey)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Action modal (opens over everything) ───────────────── */}
      {action && currentAction && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-[70]"
          onClick={() => setAction(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-sm shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* modal header */}
            <div className={`flex items-center gap-3 px-5 py-4 rounded-t-2xl ${currentAction.bg}`}>
              <currentAction.icon className={`w-5 h-5 ${currentAction.color}`} />
              <div>
                <p className={`font-bold text-sm ${currentAction.color}`}>{t(currentAction.tKey)}</p>
                <p className="text-xs text-gray-500">{t(basket.count === 1 ? "applyingTo" : "applyingToPlural", { count: basket.count })}</p>
              </div>
              <button onClick={() => setAction(null)} className="ml-auto text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* form */}
            <div className="px-5 py-4 space-y-3">
              {action === "location" && (
                <input
                  type="text"
                  placeholder={t("locationPlaceholder")}
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  autoFocus
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              )}

              {action === "condition" && (
                <select
                  value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400"
                >
                  {CONDITIONS.map((c) => (
                    <option key={c.value} value={c.value}>{t(c.tKey)}</option>
                  ))}
                </select>
              )}

              {(action === "withdraw" || action === "archive") && (
                <>
                  <div>
                    <label htmlFor="basket-withdrawn-at" className="block text-xs font-medium text-gray-600 mb-1">{t("dateLabel")}</label>
                    <input
                      id="basket-withdrawn-at"
                      type="date"
                      value={withdrawnAt}
                      onChange={(e) => setWithdrawnAt(e.target.value)}
                      className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                  </div>
                  <div>
                    <label htmlFor="basket-reason" className="block text-xs font-medium text-gray-600 mb-1">{t("reasonOptional")}</label>
                    <input
                      id="basket-reason"
                      type="text"
                      placeholder={t("reasonPlaceholder")}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                  </div>
                </>
              )}

              {(action === "repair" || action === "note") && (
                <div>
                  <label htmlFor="basket-notes" className="block text-xs font-medium text-gray-600 mb-1">{t("notesOptional")}</label>
                  <textarea
                    id="basket-notes"
                    rows={3}
                    placeholder={t("notesPlaceholder")}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                  />
                </div>
              )}

              {action === "restore" && (
                <div className="bg-green-50 rounded-xl px-4 py-3 text-sm text-green-700">
                  {t("restoreInfo")}
                </div>
              )}
            </div>

            {/* footer */}
            <div className="flex gap-2 px-5 pb-5">
              <button
                onClick={() => setAction(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                {tc("cancel")}
              </button>
              <button
                onClick={handleSubmit}
                disabled={busy}
                className={`flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2 transition-colors ${
                  currentAction.color.replace("text-", "bg-").replace("-600", "-600 hover:") + currentAction.color.replace("text-", "").replace("-600", "-700")
                } bg-indigo-600 hover:bg-indigo-700`}
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                {t(basket.count === 1 ? "applyTo" : "applyToPlural", { count: basket.count })}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ──────────────────────────────────────────────── */}
      {toast && (
        <div className={`fixed bottom-20 right-6 z-[80] px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all
          ${toast.ok ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>
          {toast.msg}
        </div>
      )}
    </>
  );
}
