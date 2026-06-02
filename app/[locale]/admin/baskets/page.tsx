"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  ShoppingBasket, Plus, Pencil, Trash2, ChevronRight,
  Tag, Loader2, X, AlertTriangle, BookOpen,
  BookMarked, UserRound, Users,
} from "lucide-react";

async function safeJson<T>(res: Response, fallback: T): Promise<T> {
  try { return (await res.json()) as T; } catch { return fallback; }
}

type BasketType = "ITEM" | "EBOOK" | "AUTHOR" | "MEMBER";

interface BasketSummary {
  id:         string;
  name:       string;
  basketType: BasketType;
  notes:      string | null;
  createdAt:  string;
  updatedAt:  string;
  total:      number;
  tagged:     number;
  untagged:   number;
}

const BASKET_TYPES: { value: BasketType; label: string; icon: React.ElementType; color: string; bg: string; desc: string }[] = [
  { value: "ITEM",   label: "Item Basket",     icon: BookOpen,   color: "text-indigo-700", bg: "bg-indigo-50",  desc: "Physical book copies" },
  { value: "EBOOK",  label: "E-Resource",      icon: BookMarked, color: "text-teal-700",   bg: "bg-teal-50",    desc: "Digital e-books" },
  { value: "AUTHOR", label: "Author Basket",   icon: UserRound,  color: "text-violet-700", bg: "bg-violet-50",  desc: "Author records" },
  { value: "MEMBER", label: "Member Basket",   icon: Users,      color: "text-blue-700",   bg: "bg-blue-50",    desc: "Member records" },
];

export default function BasketsPage() {
  const locale = useLocale();
  const t  = useTranslations("baskets");
  const tc = useTranslations("common");

  const [baskets,   setBaskets]   = useState<BasketSummary[]>([]);
  const [loading,   setLoading]   = useState(true);

  /* ── Create modal ── */
  const [creating,    setCreating]    = useState(false);
  const [newName,     setNewName]     = useState("");
  const [newNotes,    setNewNotes]    = useState("");
  const [newType,     setNewType]     = useState<BasketType>("ITEM");
  const [createBusy,  setCreateBusy]  = useState(false);
  const [createErr,   setCreateErr]   = useState("");

  /* ── Rename modal ── */
  const [editing,     setEditing]     = useState<BasketSummary | null>(null);
  const [editName,    setEditName]    = useState("");
  const [editNotes,   setEditNotes]   = useState("");
  const [editBusy,    setEditBusy]    = useState(false);
  const [editErr,     setEditErr]     = useState("");

  /* ── Toast ── */
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  const fetchBaskets = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch("/api/baskets");
      const data = await safeJson<BasketSummary[]>(res, []);
      setBaskets(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchBaskets(); }, [fetchBaskets]);

  /* ── Create basket ── */
  async function handleCreate() {
    if (!newName.trim()) { setCreateErr(t("nameRequired")); return; }
    setCreateBusy(true); setCreateErr("");
    try {
      const res  = await fetch("/api/baskets", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name: newName.trim(), notes: newNotes.trim() || null, basketType: newType }),
      });
      const data = await safeJson<{ error?: string; id?: string }>(res, {});
      if (res.ok) {
        setCreating(false); setNewName(""); setNewNotes(""); setNewType("ITEM");
        fetchBaskets();
      } else {
        setCreateErr(data.error ?? t("toastCreateFail"));
      }
    } catch (e) { setCreateErr(String(e)); }
    finally { setCreateBusy(false); }
  }

  /* ── Rename basket ── */
  async function handleEdit() {
    if (!editing || !editName.trim()) { setEditErr(t("nameRequired")); return; }
    setEditBusy(true); setEditErr("");
    try {
      const res  = await fetch(`/api/baskets/${editing.id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name: editName.trim(), notes: editNotes.trim() || null }),
      });
      const data = await safeJson<{ error?: string }>(res, {});
      if (res.ok) {
        setEditing(null);
        fetchBaskets();
        showToast(t("toastRenamed"));
      } else {
        setEditErr(data.error ?? t("toastRenameFail"));
      }
    } catch (e) { setEditErr(String(e)); }
    finally { setEditBusy(false); }
  }

  /* ── Delete basket ── */
  async function handleDelete(basket: BasketSummary) {
    if (!confirm(t("confirmDelete", { name: basket.name }))) return;
    const res = await fetch(`/api/baskets/${basket.id}`, { method: "DELETE" });
    if (res.ok) {
      showToast(t("toastDeleted", { name: basket.name }));
      fetchBaskets();
    } else {
      showToast(t("toastDeleteFail"), false);
    }
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ShoppingBasket className="w-6 h-6 text-indigo-600" />
            {t("title")}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {t("subtitle")}
          </p>
        </div>
        <button
          onClick={() => { setCreating(true); setCreateErr(""); setNewName(""); setNewNotes(""); setNewType("ITEM"); }}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          {t("newBasket")}
        </button>
      </div>

      {/* Baskets list */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-gray-400 flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin" /> {t("loading")}
          </div>
        ) : baskets.length === 0 ? (
          <div className="p-12 text-center">
            <ShoppingBasket className="w-12 h-12 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">{t("noBaskets")}</p>
            <p className="text-gray-400 text-sm mt-1">
              {t("noBasketsDesc")}
            </p>
            <button
              onClick={() => { setCreating(true); setNewName(""); setNewNotes(""); setNewType("ITEM"); }}
              className="mt-4 inline-flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              <Plus className="w-4 h-4" /> {t("createFirst")}
            </button>
          </div>
        ) : (
          <>
            {/* Table header */}
            <div className="px-5 py-3 border-b border-gray-100 grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <span>{t("colBasket")}</span>
              <span className="text-center w-20">{t("colTotal")}</span>
              <span className="text-center w-24">{t("colTagged")}</span>
              <span className="text-center w-24">{t("colUntagged")}</span>
              <span className="w-24"></span>
            </div>

            <div className="divide-y divide-gray-50">
              {baskets.map((basket) => {
                const typeMeta = BASKET_TYPES.find((t) => t.value === basket.basketType) ?? BASKET_TYPES[0];
                const TypeIcon = typeMeta.icon;
                return (
                <div key={basket.id} className="px-5 py-3.5 grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 items-center hover:bg-gray-50 transition-colors">
                  {/* Name + type + notes */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-800 truncate">{basket.name}</p>
                      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${typeMeta.bg} ${typeMeta.color}`}>
                        <TypeIcon className="w-2.5 h-2.5" />
                        {typeMeta.label}
                      </span>
                    </div>
                    {basket.notes && (
                      <p className="text-xs text-gray-400 truncate mt-0.5">{basket.notes}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-0.5">
                      {t("created", { date: new Date(basket.createdAt).toLocaleDateString() })}
                    </p>
                  </div>

                  {/* Total */}
                  <div className="w-20 text-center">
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-gray-700">
                      <TypeIcon className="w-3.5 h-3.5 text-gray-400" />
                      {basket.total}
                    </span>
                  </div>

                  {/* Tagged */}
                  <div className="w-24 text-center">
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-semibold ${
                      basket.tagged > 0 ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-400"
                    }`}>
                      <Tag className="w-3 h-3" />
                      {basket.tagged} {t("tagged")}
                    </span>
                  </div>

                  {/* Untagged */}
                  <div className="w-24 text-center">
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-semibold ${
                      basket.untagged > 0 ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-400"
                    }`}>
                      {basket.untagged} {t("untagged")}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="w-24 flex items-center justify-end gap-1">
                    <button
                      onClick={() => { setEditing(basket); setEditName(basket.name); setEditNotes(basket.notes ?? ""); setEditErr(""); }}
                      title={t("rename")}
                      className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(basket)}
                      title={tc("delete")}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <Link
                      href={`/${locale}/admin/baskets/${basket.id}`}
                      title={t("openBasket")}
                      className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ── Create Basket Modal ─────────────────────────────────────── */}
      {creating && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          onClick={() => setCreating(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-gray-900 text-lg">{t("createTitle")}</h2>
              <button onClick={() => setCreating(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              {/* Basket type selector */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Basket Type</p>
                <div className="grid grid-cols-2 gap-2">
                  {BASKET_TYPES.map(({ value, label, icon: Icon, color, bg, desc }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setNewType(value)}
                      className={`flex items-start gap-2.5 p-3 rounded-xl border-2 text-left transition-all ${
                        newType === value
                          ? `border-indigo-400 ${bg}`
                          : "border-gray-200 hover:border-gray-300 bg-gray-50"
                      }`}
                    >
                      <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${newType === value ? color : "text-gray-400"}`} />
                      <div>
                        <p className={`text-xs font-semibold ${newType === value ? color : "text-gray-700"}`}>{label}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="basket-new-name" className="block text-sm font-medium text-gray-700 mb-1">
                  {t("basketName")} <span className="text-red-500">*</span>
                </label>
                <input
                  id="basket-new-name"
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  placeholder="e.g. Damaged Books Q1, Section A Move…"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  autoFocus
                />
              </div>
              <div>
                <label htmlFor="basket-new-notes" className="block text-sm font-medium text-gray-700 mb-1">{t("notesOptional")}</label>
                <textarea
                  id="basket-new-notes"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Any notes about this basket's purpose…"
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                />
              </div>
              {createErr && (
                <p className="text-sm text-red-600 flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" /> {createErr}
                </p>
              )}
              <div className="flex gap-2 pt-1">
                <button onClick={() => setCreating(false)}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                  {tc("cancel")}
                </button>
                <button
                  onClick={handleCreate}
                  disabled={createBusy || !newName.trim()}
                  className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-60 flex items-center justify-center gap-2 transition-colors"
                >
                  {createBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                  {t("createBtn")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Rename Modal ────────────────────────────────────────────── */}
      {editing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          onClick={() => setEditing(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-gray-900 text-lg">{t("renameTitle")}</h2>
              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label htmlFor="basket-edit-name" className="block text-sm font-medium text-gray-700 mb-1">{t("basketName")}</label>
                <input
                  id="basket-edit-name"
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleEdit()}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  autoFocus
                />
              </div>
              <div>
                <label htmlFor="basket-edit-notes" className="block text-sm font-medium text-gray-700 mb-1">{t("notes")}</label>
                <textarea
                  id="basket-edit-notes"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                />
              </div>
              {editErr && (
                <p className="text-sm text-red-600 flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" /> {editErr}
                </p>
              )}
              <div className="flex gap-2 pt-1">
                <button onClick={() => setEditing(null)}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                  {tc("cancel")}
                </button>
                <button
                  onClick={handleEdit}
                  disabled={editBusy || !editName.trim()}
                  className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-60 flex items-center justify-center gap-2 transition-colors"
                >
                  {editBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                  {t("saveChanges")}
                </button>
              </div>
            </div>
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
