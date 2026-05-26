"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Tags, User, Building2, Plus, Trash2, Edit2, Save, X, Loader2, Search, AlertCircle, BookOpen, MapPin } from "lucide-react";

type Tab = "authors" | "categories" | "publishers" | "locations";

interface Entity {
  id:     string;
  name:   string;
  nameKm?: string | null;
  description?: string | null;
  _count?: { books?: number };
}

const TABS: { id: Tab; labelKey: string; singularKey: string; icon: typeof Tags; apiPath: string; hasKm: boolean; hasDescription?: boolean }[] = [
  { id: "authors",    labelKey: "tabAuthors",    singularKey: "singularAuthor",    icon: User,      apiPath: "/api/authors",    hasKm: false },
  { id: "categories", labelKey: "tabCategories", singularKey: "singularCategory",  icon: Tags,      apiPath: "/api/categories", hasKm: true  },
  { id: "publishers", labelKey: "tabPublishers", singularKey: "singularPublisher", icon: Building2, apiPath: "/api/publishers", hasKm: false },
  { id: "locations",  labelKey: "tabLocations",  singularKey: "singularLocation",  icon: MapPin,    apiPath: "/api/locations",  hasKm: false, hasDescription: true },
];

export default function TaxonomyAdminPage() {
  const t = useTranslations("taxonomy");
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as Tab | null);
  const [tab, setTab] = useState<Tab>(
    TABS.some((tabItem) => tabItem.id === initialTab) ? initialTab! : "authors"
  );
  const active = TABS.find((tabItem) => tabItem.id === tab)!;

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Heading */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Tags className="w-6 h-6 text-indigo-600" />
          {t("title")}
        </h1>
        <p className="text-sm text-gray-500 mt-1">{t("subtitle")}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map((tabItem) => {
          const Icon = tabItem.icon;
          const isActive = tab === tabItem.id;
          return (
            <button
              key={tabItem.id}
              onClick={() => setTab(tabItem.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                isActive
                  ? "border-indigo-600 text-indigo-700"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              <Icon className="w-4 h-4" />
              {t(tabItem.labelKey as Parameters<typeof t>[0])}
            </button>
          );
        })}
      </div>

      {/* Active panel */}
      <TaxonomyPanel
        key={tab}
        apiPath={active.apiPath}
        label={t(active.labelKey as Parameters<typeof t>[0])}
        singularLabel={t(active.singularKey as Parameters<typeof t>[0])}
        hasKm={active.hasKm}
        hasDescription={active.hasDescription ?? false}
      />
    </div>
  );
}

function TaxonomyPanel({ apiPath, label, singularLabel, hasKm, hasDescription }: {
  apiPath: string;
  label: string;
  singularLabel: string;
  hasKm: boolean;
  hasDescription: boolean;
}) {
  const t  = useTranslations("taxonomy");
  const tc = useTranslations("common");

  const [items,   setItems]   = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [search,  setSearch]  = useState("");
  const [editing, setEditing] = useState<string | null>(null);

  // Add-new form
  const [newName,        setNewName]        = useState("");
  const [newNameKm,      setNewNameKm]      = useState("");
  const [newDescription, setNewDescription] = useState("");

  async function fetchAll() {
    setLoading(true); setError(null);
    try {
      const res = await fetch(apiPath);
      if (!res.ok) throw new Error("Failed to load");
      setItems(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    }
    setLoading(false);
  }

  useEffect(() => { fetchAll(); }, [apiPath]); // eslint-disable-line

  async function addNew() {
    if (!newName.trim()) return;
    setBusy(true); setError(null);
    const res = await fetch(apiPath, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        name:   newName.trim(),
        ...(hasKm && newNameKm.trim() && { nameKm: newNameKm.trim() }),
        ...(hasDescription && newDescription.trim() && { description: newDescription.trim() }),
      }),
    });
    if (res.ok) {
      setNewName(""); setNewNameKm(""); setNewDescription("");
      fetchAll();
    } else {
      const d = await res.json().catch(() => ({}));
      setError(typeof d.error === "string" ? d.error : "Create failed");
    }
    setBusy(false);
  }

  async function saveEdit(id: string, patch: { name: string; nameKm?: string | null; description?: string | null }) {
    setBusy(true); setError(null);
    const res = await fetch(`${apiPath}/${id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(patch),
    });
    if (res.ok) {
      setEditing(null);
      fetchAll();
    } else {
      const d = await res.json().catch(() => ({}));
      setError(typeof d.error === "string" ? d.error : "Update failed");
    }
    setBusy(false);
  }

  async function remove(id: string, name: string) {
    if (!confirm(t("confirmDeleteItem", { name }))) return;
    setBusy(true); setError(null);
    const res = await fetch(`${apiPath}/${id}`, { method: "DELETE" });
    if (res.ok) {
      fetchAll();
    } else {
      const d = await res.json().catch(() => ({}));
      setError(typeof d.error === "string" ? d.error : "Delete failed");
    }
    setBusy(false);
  }

  const filtered = items.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase()) ||
    (i.nameKm ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Add new */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <Plus className="w-4 h-4 text-indigo-500" /> {t("addNew", { name: singularLabel })}
        </h2>
        <div className="flex gap-2 flex-wrap">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addNew()}
            placeholder={hasDescription ? t("codePlaceholder") : t("namePlaceholder")}
            disabled={busy}
            className="flex-1 min-w-[180px] px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50"
          />
          {hasKm && (
            <input
              type="text"
              value={newNameKm}
              onChange={(e) => setNewNameKm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addNew()}
              placeholder={t("khmerPlaceholder")}
              disabled={busy}
              className="flex-1 min-w-[180px] px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50"
            />
          )}
          {hasDescription && (
            <input
              type="text"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addNew()}
              placeholder={t("descPlaceholder")}
              disabled={busy}
              className="flex-[2] min-w-[220px] px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50"
            />
          )}
          <button
            onClick={addNew}
            disabled={busy || !newName.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {tc("add")}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* List */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        {/* Search + count */}
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-700">{label}</h2>
          <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded font-medium">{items.length}</span>
          <div className="ml-auto relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("filterPlaceholder")}
              className="pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs w-48 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
        </div>

        {loading ? (
          <div className="px-5 py-12 text-center text-gray-400 text-sm">{tc("loading")}</div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-12 text-center text-gray-400 text-sm">
            {items.length === 0 ? t("noItems") : t("noMatches")}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filtered.map((item) => (
              <EntityRow
                key={item.id}
                item={item}
                isEditing={editing === item.id}
                hasKm={hasKm}
                hasDescription={hasDescription}
                onEdit={() => setEditing(item.id)}
                onCancel={() => setEditing(null)}
                onSave={(patch) => saveEdit(item.id, patch)}
                onDelete={() => remove(item.id, item.name)}
                busy={busy}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EntityRow({ item, isEditing, hasKm, hasDescription, onEdit, onCancel, onSave, onDelete, busy }: {
  item: Entity;
  isEditing: boolean;
  hasKm: boolean;
  hasDescription: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (patch: { name: string; nameKm?: string | null; description?: string | null }) => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const t  = useTranslations("taxonomy");
  const tc = useTranslations("common");
  const [name,        setName]        = useState(item.name);
  const [nameKm,      setNameKm]      = useState(item.nameKm ?? "");
  const [description, setDescription] = useState(item.description ?? "");

  useEffect(() => {
    if (isEditing) {
      setName(item.name);
      setNameKm(item.nameKm ?? "");
      setDescription(item.description ?? "");
    }
  }, [isEditing, item]);

  const inUse = item._count?.books ?? 0;

  if (!isEditing) {
    return (
      <div className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
            {item.nameKm && <p className="text-sm text-gray-500 truncate">· {item.nameKm}</p>}
          </div>
          {item.description && (
            <p className="text-xs text-gray-500 mt-0.5 truncate">{item.description}</p>
          )}
          {inUse > 0 && (
            <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
              <BookOpen className="w-3 h-3" /> {t("usedByBooks", { count: inUse })}
            </p>
          )}
        </div>
        <button
          onClick={onEdit}
          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
          title={tc("edit")}
        >
          <Edit2 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onDelete}
          disabled={busy || inUse > 0}
          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-30"
          title={inUse > 0 ? t("cannotDelete", { count: inUse }) : tc("delete")}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="px-5 py-3 bg-blue-50/50 border-l-2 border-blue-300 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={hasDescription ? t("codeEditPlaceholder") : t("namePlaceholder")}
          className="flex-1 min-w-[160px] px-2.5 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
        {hasKm && (
          <input
            type="text"
            value={nameKm}
            onChange={(e) => setNameKm(e.target.value)}
            placeholder="ឈ្មោះខ្មែរ"
            className="flex-1 min-w-[140px] px-2.5 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        )}
        {hasDescription && (
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("descEditPlaceholder")}
            className="flex-[2] min-w-[200px] px-2.5 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        )}
        <button
          onClick={onCancel}
          disabled={busy}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded transition-colors"
        >
          <X className="w-3 h-3" /> {tc("cancel")}
        </button>
        <button
          onClick={() => onSave({
            name: name.trim(),
            ...(hasKm && { nameKm: nameKm.trim() || null }),
            ...(hasDescription && { description: description.trim() || null }),
          })}
          disabled={busy || !name.trim()}
          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 text-white hover:bg-blue-700 rounded font-medium transition-colors disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} {tc("save")}
        </button>
      </div>
    </div>
  );
}
