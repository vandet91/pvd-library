"use client";

import {
  createContext, useContext, useState, useEffect, useCallback,
  type ReactNode,
} from "react";

/* ── types ── */
export interface BasketBook {
  id:            string;
  title:         string;
  isbn?:         string | null;
  location?:     string | null;
  shelfLocation?: { name: string } | null;
}

interface BasketCtx {
  items:      BasketBook[];
  count:      number;
  add:        (book: BasketBook) => void;
  remove:     (id: string) => void;
  toggle:     (book: BasketBook) => void;
  has:        (id: string) => boolean;
  clear:      () => void;
  addMany:    (books: BasketBook[]) => void;
}

const Ctx = createContext<BasketCtx | null>(null);

const KEY = "pvd-book-basket";

export function BasketProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<BasketBook[]>([]);
  const [ready, setReady] = useState(false);

  /* Hydrate from localStorage once, client-side only */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch { /* ignore */ }
    setReady(true);
  }, []);

  /* Persist to localStorage on every change (after hydration) */
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* ignore */ }
  }, [items, ready]);

  const has      = useCallback((id: string) => items.some((b) => b.id === id), [items]);
  const add      = useCallback((book: BasketBook) =>
    setItems((prev) => (prev.some((b) => b.id === book.id) ? prev : [...prev, book])), []);
  const remove   = useCallback((id: string) =>
    setItems((prev) => prev.filter((b) => b.id !== id)), []);
  const toggle   = useCallback((book: BasketBook) =>
    setItems((prev) =>
      prev.some((b) => b.id === book.id)
        ? prev.filter((b) => b.id !== book.id)
        : [...prev, book]
    ), []);
  const clear    = useCallback(() => setItems([]), []);
  const addMany  = useCallback((books: BasketBook[]) =>
    setItems((prev) => {
      const ids = new Set(prev.map((b) => b.id));
      return [...prev, ...books.filter((b) => !ids.has(b.id))];
    }), []);

  return (
    <Ctx.Provider value={{ items, count: items.length, add, remove, toggle, has, clear, addMany }}>
      {children}
    </Ctx.Provider>
  );
}

export function useBasket(): BasketCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useBasket must be used inside <BasketProvider>");
  return ctx;
}
