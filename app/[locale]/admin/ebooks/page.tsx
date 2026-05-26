"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import { Plus, Search, Edit, Trash2, FileText, BookMarked, Link2, Video, Music, Eye, CheckSquare, X } from "lucide-react";

interface Ebook {
  id: string; title: string; titleKm?: string; ebookType: string;
  views: number; isPublic: boolean; language: string;
  category?: { name: string } | null;
  author?:   { name: string } | null;
}

const TYPE_ICON: Record<string, React.ReactNode> = {
  PDF:   <FileText   className="w-3.5 h-3.5" />,
  EPUB:  <BookMarked className="w-3.5 h-3.5" />,
  LINK:  <Link2      className="w-3.5 h-3.5" />,
  VIDEO: <Video      className="w-3.5 h-3.5" />,
  AUDIO: <Music      className="w-3.5 h-3.5" />,
};

const TYPE_COLOR: Record<string, string> = {
  PDF:   "bg-red-50    text-red-600",
  EPUB:  "bg-blue-50   text-blue-600",
  LINK:  "bg-gray-100  text-gray-600",
  VIDEO: "bg-violet-50 text-violet-600",
  AUDIO: "bg-emerald-50 text-emerald-600",
};

export default function AdminEbooksPage() {
  const t  = useTranslations("ebooks");
  const tc = useTranslations("common");
  const locale = useLocale();

  const [ebooks,   setEbooks]   = useState<Ebook[]>([]);
  const [query,    setQuery]    = useState("");
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const fetchEbooks = useCallback(async () => {
    setLoading(true);
    // admin=true tells the API to return all ebooks (public + protected) with fileUrl
    const res = await fetch(`/api/ebooks?q=${encodeURIComponent(query)}&admin=true`);
    const _d = await res.json(); setEbooks(Array.isArray(_d) ? _d : []);
    setLoading(false);
  }, [query]);

  useEffect(() => { fetchEbooks(); }, [fetchEbooks]);

  async function handleDelete(id: string) {
    if (!confirm(t("confirmDelete"))) return;
    await fetch(`/api/ebooks/${id}`, { method: "DELETE" });
    fetchEbooks();
  }

  async function handleBulkDelete() {
    if (!selected.size) return;
    if (!confirm(t("confirmBulkDelete", { count: selected.size }))) return;
    await Promise.all([...selected].map((id) => fetch(`/api/ebooks/${id}`, { method: "DELETE" })));
    setSelected(new Set());
    fetchEbooks();
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === ebooks.length) setSelected(new Set());
    else setSelected(new Set(ebooks.map((e) => e.id)));
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
        <Link href={`/${locale}/admin/ebooks/new`}
          className="flex items-center gap-2 bg-blue-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 transition-colors">
          <Plus className="w-4 h-4" />
          {t("addEbook")}
        </Link>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 bg-gray-900 text-white px-5 py-3 rounded-2xl shadow-2xl">
          <CheckSquare className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-medium">{t("bulkSelected", { count: selected.size })}</span>
          <div className="h-4 w-px bg-white/20" />
          <button onClick={handleBulkDelete} className="text-sm text-red-400 hover:text-red-300 transition-colors">{tc("delete")}</button>
          <button onClick={() => setSelected(new Set())} className="ml-1 p-1 hover:bg-white/10 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">{tc("loading")}</div>
        ) : ebooks.length === 0 ? (
          <div className="p-8 text-center text-gray-400">{t("noEbooks")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="pl-4 pr-2 py-3 w-10">
                    <input type="checkbox" checked={selected.size === ebooks.length && ebooks.length > 0}
                      onChange={toggleAll}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                  </th>
                  <th className="px-6 py-3 text-left">{t("ebookType")}</th>
                  <th className="px-6 py-3 text-left">{t("ebookTitle")}</th>
                  <th className="px-6 py-3 text-left">{t("author")}</th>
                  <th className="px-6 py-3 text-left">{t("category")}</th>
                  <th className="px-6 py-3 text-left"><Eye className="w-3.5 h-3.5 inline" /></th>
                  <th className="px-6 py-3 text-left">{tc("status")}</th>
                  <th className="px-6 py-3 text-left">{tc("actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {ebooks.map((ebook) => (
                  <tr key={ebook.id} className={`hover:bg-gray-50 transition-colors ${selected.has(ebook.id) ? "bg-blue-50" : ""}`}>
                    <td className="pl-4 pr-2 py-4">
                      <input type="checkbox" checked={selected.has(ebook.id)} onChange={() => toggleSelect(ebook.id)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${TYPE_COLOR[ebook.ebookType]}`}>
                        {TYPE_ICON[ebook.ebookType]}
                        {ebook.ebookType}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-medium text-gray-900 text-sm">{ebook.title}</p>
                      {ebook.titleKm && <p className="text-xs text-gray-400">{ebook.titleKm}</p>}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{ebook.author?.name ?? "—"}</td>
                    <td className="px-6 py-4">
                      {ebook.category && (
                        <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{ebook.category.name}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">{ebook.views}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                        ebook.isPublic
                          ? "bg-green-100 text-green-700"
                          : "bg-amber-100 text-amber-700"
                      }`}>
                        {ebook.isPublic ? t("statusFree") : t("statusProtected")}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Link href={`/${locale}/admin/ebooks/${ebook.id}`}
                          className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                          <Edit className="w-4 h-4" />
                        </Link>
                        <button onClick={() => handleDelete(ebook.id)}
                          className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
