"use client";

import { useState, useEffect, useRef } from "react";
import { ShoppingBasket, Plus, Loader2, Check, ChevronDown, X } from "lucide-react";

type BasketType = "ITEM" | "EBOOK" | "AUTHOR" | "MEMBER";

interface BasketOption {
  id:    string;
  name:  string;
  total: number;
}

interface Props {
  /** Type of basket to show — only baskets of this type are listed */
  basketType: BasketType;
  /** IDs of the selected entities to add */
  selectedIds: string[];
  /** The field name to use in the POST body, e.g. "memberIds", "ebookIds", "authorIds" */
  entityField: string;
  /** Optional label override */
  label?: string;
  /** Called after a successful add */
  onAdded?: (basketId: string, basketName: string, count: number) => void;
}

const TYPE_COLOR: Record<BasketType, string> = {
  ITEM:   "bg-indigo-600 hover:bg-indigo-700",
  EBOOK:  "bg-teal-600   hover:bg-teal-700",
  AUTHOR: "bg-violet-600 hover:bg-violet-700",
  MEMBER: "bg-blue-600   hover:bg-blue-700",
};

export default function AddToBasketButton({
  basketType, selectedIds, entityField, label, onAdded,
}: Props) {
  const [open,       setOpen]       = useState(false);
  const [baskets,    setBaskets]    = useState<BasketOption[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [busy,       setBusy]       = useState<string | null>(null);
  const [done,       setDone]       = useState<{ name: string; count: number } | null>(null);
  const [newName,    setNewName]    = useState("");
  const [creating,   setCreating]   = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  /* Close on outside click */
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  async function loadBaskets() {
    try {
      const r = await fetch("/api/baskets");
      const d = await r.json() as (BasketOption & { basketType: string })[];
      setBaskets(d.filter((b) => b.basketType === basketType));
    } catch { /* ignore */ }
  }

  /* Load baskets when opened */
  useEffect(() => {
    if (!open) return;
    setLoading(true); setError(null);
    loadBaskets().finally(() => setLoading(false));
  }, [open, basketType]); // eslint-disable-line

  async function addToBasket(basketId: string, basketName: string) {
    setBusy(basketId); setError(null);
    try {
      const res  = await fetch(`/api/baskets/${basketId}/items`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ [entityField]: selectedIds }),
      });
      const data = await res.json().catch(() => ({})) as { added?: number; error?: string };
      if (!res.ok) { setError(data.error ?? `Server error ${res.status}`); return; }
      const count = data.added ?? selectedIds.length;
      setDone({ name: basketName, count });
      onAdded?.(basketId, basketName, count);
      setTimeout(() => { setDone(null); setOpen(false); }, 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add items");
    } finally {
      setBusy(null);
    }
  }

  async function createAndAdd() {
    if (!newName.trim()) return;
    setCreateBusy(true); setError(null);
    let createdId: string | null = null;
    try {
      // Step 1 — create basket
      const res  = await fetch("/api/baskets", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name: newName.trim(), basketType }),
      });
      const data = await res.json().catch(() => ({})) as { id?: string; name?: string; error?: string };
      if (!res.ok) { setError(data.error ?? `Server error ${res.status}`); return; }
      if (!data.id) { setError("Invalid response from server"); return; }

      createdId = data.id;
      setNewName(""); setCreating(false);

      // Step 2 — add items; refresh basket list regardless so it shows the new basket
      await loadBaskets();
      await addToBasket(data.id, data.name ?? newName.trim());
    } catch (e) {
      // If item-add threw after basket was created, delete the orphan
      if (createdId) {
        fetch(`/api/baskets/${createdId}`, { method: "DELETE" }).catch(() => {});
        await loadBaskets();
      }
      setError(e instanceof Error ? e.message : "Failed to create basket");
    } finally {
      setCreateBusy(false);
    }
  }

  if (selectedIds.length === 0) return null;

  const colorCls = TYPE_COLOR[basketType];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg text-white font-medium transition-colors ${colorCls}`}
      >
        <ShoppingBasket className="w-3.5 h-3.5" />
        {label ?? "Add to Basket"}
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute bottom-full mb-2 left-0 w-64 bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100 bg-gray-50">
            <p className="text-xs font-semibold text-gray-600">
              Add {selectedIds.length} item{selectedIds.length !== 1 ? "s" : ""} to basket
            </p>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Done state */}
          {done && (
            <div className="px-4 py-3 flex items-center gap-2 bg-green-50 text-green-700 text-sm font-medium">
              <Check className="w-4 h-4 flex-shrink-0" />
              Added {done.count} to "{done.name}"
            </div>
          )}

          {/* Error */}
          {error && !done && (
            <p className="px-4 py-2 text-xs text-red-600 bg-red-50">{error}</p>
          )}

          {/* Basket list */}
          {!done && (
            <div className="max-h-48 overflow-y-auto divide-y divide-gray-50">
              {loading ? (
                <div className="flex items-center justify-center py-6 gap-2 text-gray-400 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                </div>
              ) : baskets.length === 0 && !creating ? (
                <p className="px-4 py-3 text-xs text-gray-400 text-center">
                  No {basketType.toLowerCase()} baskets yet
                </p>
              ) : (
                baskets.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => addToBasket(b.id, b.name)}
                    disabled={!!busy}
                    className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors text-left disabled:opacity-50"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{b.name}</p>
                      <p className="text-xs text-gray-400">{b.total} item{b.total !== 1 ? "s" : ""}</p>
                    </div>
                    {busy === b.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400 flex-shrink-0" />
                      : <Plus className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />}
                  </button>
                ))
              )}
            </div>
          )}

          {/* Create new basket */}
          {!done && (
            <div className="border-t border-gray-100 p-2">
              {creating ? (
                <div className="flex gap-1.5">
                  <input
                    autoFocus
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") createAndAdd(); if (e.key === "Escape") setCreating(false); }}
                    placeholder="New basket name…"
                    className="flex-1 text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                  <button
                    onClick={createAndAdd}
                    disabled={createBusy || !newName.trim()}
                    className="flex-shrink-0 px-2.5 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                  >
                    {createBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : "Create"}
                  </button>
                  <button onClick={() => setCreating(false)} className="text-gray-400 hover:text-gray-600 px-1">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setCreating(true)}
                  className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> New basket
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
