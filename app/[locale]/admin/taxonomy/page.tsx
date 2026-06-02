"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Tags, User, Building2, Plus, Trash2, Edit2, Save, X, Loader2, Search, AlertCircle, BookOpen, MapPin, Landmark, Phone, Mail, ToggleLeft, ToggleRight, CheckSquare, Users } from "lucide-react";
import AddToBasketButton from "@/components/admin/AddToBasketButton";

type Tab = "authors" | "categories" | "publishers" | "locations" | "branches" | "audience";

interface Entity {
  id:     string;
  name:   string;
  nameKm?: string | null;
  description?: string | null;
  _count?: { books?: number };
}

interface Branch {
  id:       string;
  name:     string;
  nameKm:   string | null;
  address:  string | null;
  phone:    string | null;
  email:    string | null;
  isActive: boolean;
  _count:   { books: number; copies: number; loans: number };
}

const TABS: { id: Tab; labelKey: string; singularKey: string; icon: typeof Tags; apiPath: string; hasKm: boolean; hasDescription?: boolean }[] = [
  { id: "authors",    labelKey: "tabAuthors",    singularKey: "singularAuthor",    icon: User,      apiPath: "/api/authors",    hasKm: false },
  { id: "categories", labelKey: "tabCategories", singularKey: "singularCategory",  icon: Tags,      apiPath: "/api/categories", hasKm: true  },
  { id: "publishers", labelKey: "tabPublishers", singularKey: "singularPublisher", icon: Building2, apiPath: "/api/publishers", hasKm: false },
  { id: "locations",  labelKey: "tabLocations",  singularKey: "singularLocation",  icon: MapPin,    apiPath: "/api/locations",  hasKm: false, hasDescription: true },
  { id: "branches",   labelKey: "tabBranches",   singularKey: "singularBranch",    icon: Landmark,  apiPath: "/api/branches",   hasKm: true  },
  { id: "audience",   labelKey: "tabAudience",   singularKey: "singularAudience",  icon: Users,     apiPath: "",                hasKm: false },
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
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {TABS.map((tabItem) => {
          const Icon = tabItem.icon;
          const isActive = tab === tabItem.id;
          return (
            <button
              key={tabItem.id}
              onClick={() => setTab(tabItem.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
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
      {tab === "branches" ? (
        <BranchPanel key="branches" />
      ) : tab === "audience" ? (
        <AudiencePanel key="audience" />
      ) : (
        <TaxonomyPanel
          key={tab}
          apiPath={active.apiPath}
          label={t(active.labelKey as Parameters<typeof t>[0])}
          singularLabel={t(active.singularKey as Parameters<typeof t>[0])}
          hasKm={active.hasKm}
          hasDescription={active.hasDescription ?? false}
          basketType={tab === "authors" ? "AUTHOR" : undefined}
        />
      )}
    </div>
  );
}

/* ── Branch Panel ──────────────────────────────────────────────────── */

function BranchPanel() {
  const t  = useTranslations("taxonomy");
  const tc = useTranslations("common");

  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [busy,     setBusy]     = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [editing,  setEditing]  = useState<string | null>(null);
  const [search,   setSearch]   = useState("");

  const blank = { name: "", nameKm: "", address: "", phone: "", email: "" };
  const [form, setForm] = useState(blank);

  async function fetchAll() {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/branches");
      if (!res.ok) throw new Error("Failed to load");
      setBranches(await res.json());
    } catch (e) { setError(e instanceof Error ? e.message : "Load failed"); }
    setLoading(false);
  }
  useEffect(() => { fetchAll(); }, []); // eslint-disable-line

  async function addNew() {
    if (!form.name.trim()) return;
    setBusy(true); setError(null);
    const res = await fetch("/api/branches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, name: form.name.trim() }),
    });
    if (res.ok) { setForm(blank); fetchAll(); }
    else { const d = await res.json().catch(() => ({})); setError(typeof d.error === "string" ? d.error : "Create failed"); }
    setBusy(false);
  }

  async function saveEdit(id: string, patch: Partial<Branch>) {
    setBusy(true); setError(null);
    const res = await fetch(`/api/branches/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) { setEditing(null); fetchAll(); }
    else { const d = await res.json().catch(() => ({})); setError(typeof d.error === "string" ? d.error : "Update failed"); }
    setBusy(false);
  }

  async function remove(id: string, name: string) {
    if (!confirm(t("confirmDeleteItem", { name }))) return;
    setBusy(true); setError(null);
    const res = await fetch(`/api/branches/${id}`, { method: "DELETE" });
    if (res.ok) { fetchAll(); }
    else { const d = await res.json().catch(() => ({})); setError(typeof d.error === "string" ? d.error : "Delete failed"); }
    setBusy(false);
  }

  const filtered = branches.filter((b) =>
    b.name.toLowerCase().includes(search.toLowerCase()) ||
    (b.nameKm ?? "").includes(search) ||
    (b.address ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Add new */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <Plus className="w-4 h-4 text-indigo-500" /> {t("addNew", { name: t("singularBranch") })}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input id="branch-new-name" type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder={t("branchNamePlaceholder")} disabled={busy}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50" />
          <input id="branch-new-namekm" type="text" value={form.nameKm} onChange={(e) => setForm((f) => ({ ...f, nameKm: e.target.value }))}
            placeholder={t("khmerPlaceholder")} disabled={busy}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50" />
          <input id="branch-new-address" type="text" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            placeholder={t("branchAddressPlaceholder")} disabled={busy}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50" />
          <input id="branch-new-phone" type="text" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            placeholder={t("branchPhonePlaceholder")} disabled={busy}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50" />
          <input id="branch-new-email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder={t("branchEmailPlaceholder")} disabled={busy}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50" />
          <button onClick={addNew} disabled={busy || !form.name.trim()}
            className="flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {tc("add")}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* List */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-700">{t("tabBranches")}</h2>
          <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded font-medium">{branches.length}</span>
          <div className="ml-auto relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder={t("filterPlaceholder")}
              className="pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs w-48 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
        </div>

        {loading ? (
          <div className="px-5 py-12 text-center text-gray-400 text-sm">{tc("loading")}</div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-12 text-center text-gray-400 text-sm">
            {branches.length === 0 ? t("noItems") : t("noMatches")}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filtered.map((branch) => (
              <BranchRow
                key={branch.id}
                branch={branch}
                isEditing={editing === branch.id}
                onEdit={() => setEditing(branch.id)}
                onCancel={() => setEditing(null)}
                onSave={(patch) => saveEdit(branch.id, patch)}
                onDelete={() => remove(branch.id, branch.name)}
                busy={busy}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BranchRow({ branch, isEditing, onEdit, onCancel, onSave, onDelete, busy }: {
  branch:    Branch;
  isEditing: boolean;
  onEdit:    () => void;
  onCancel:  () => void;
  onSave:    (patch: Partial<Branch>) => void;
  onDelete:  () => void;
  busy:      boolean;
}) {
  const t  = useTranslations("taxonomy");
  const tc = useTranslations("common");
  const [name,     setName]     = useState(branch.name);
  const [nameKm,   setNameKm]   = useState(branch.nameKm ?? "");
  const [address,  setAddress]  = useState(branch.address ?? "");
  const [phone,    setPhone]    = useState(branch.phone ?? "");
  const [email,    setEmail]    = useState(branch.email ?? "");
  const [isActive, setIsActive] = useState(branch.isActive);

  useEffect(() => {
    if (isEditing) {
      setName(branch.name); setNameKm(branch.nameKm ?? "");
      setAddress(branch.address ?? ""); setPhone(branch.phone ?? "");
      setEmail(branch.email ?? ""); setIsActive(branch.isActive);
    }
  }, [isEditing, branch]);

  const totalItems = branch._count.books + branch._count.copies + branch._count.loans;

  if (!isEditing) {
    return (
      <div className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-gray-900">{branch.name}</p>
            {branch.nameKm && <p className="text-sm text-gray-500">· {branch.nameKm}</p>}
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${branch.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
              {branch.isActive ? t("branchActive") : t("branchInactive")}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            {branch.address && <p className="text-xs text-gray-500 flex items-center gap-1"><MapPin className="w-3 h-3" />{branch.address}</p>}
            {branch.phone   && <p className="text-xs text-gray-500 flex items-center gap-1"><Phone className="w-3 h-3" />{branch.phone}</p>}
            {branch.email   && <p className="text-xs text-gray-500 flex items-center gap-1"><Mail className="w-3 h-3" />{branch.email}</p>}
          </div>
          {totalItems > 0 && (
            <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
              <BookOpen className="w-3 h-3" />
              {branch._count.books} {t("branchBooks")} · {branch._count.copies} {t("branchCopies")} · {branch._count.loans} {t("branchLoans")}
            </p>
          )}
        </div>
        <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title={tc("edit")}>
          <Edit2 className="w-3.5 h-3.5" />
        </button>
        <button onClick={onDelete} disabled={busy || totalItems > 0}
          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-30"
          title={totalItems > 0 ? t("branchCannotDelete") : tc("delete")}>
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="px-5 py-4 bg-blue-50/50 border-l-2 border-blue-300 space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input type="text" value={name} onChange={(e) => setName(e.target.value)}
          placeholder={t("branchNamePlaceholder")}
          className="px-2.5 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-300" />
        <input type="text" value={nameKm} onChange={(e) => setNameKm(e.target.value)}
          placeholder={t("khmerPlaceholder")}
          className="px-2.5 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-300" />
        <input type="text" value={address} onChange={(e) => setAddress(e.target.value)}
          placeholder={t("branchAddressPlaceholder")}
          className="px-2.5 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-300" />
        <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)}
          placeholder={t("branchPhonePlaceholder")}
          className="px-2.5 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-300" />
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder={t("branchEmailPlaceholder")}
          className="px-2.5 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-300" />
        <label className="flex items-center gap-2 cursor-pointer px-2.5 py-1.5">
          <button type="button" onClick={() => setIsActive((v) => !v)} className="text-indigo-600">
            {isActive ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5 text-gray-400" />}
          </button>
          <span className="text-sm text-gray-700">{isActive ? t("branchActive") : t("branchInactive")}</span>
        </label>
      </div>
      <div className="flex items-center gap-2 pt-1">
        <button onClick={onCancel} disabled={busy}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded transition-colors">
          <X className="w-3 h-3" /> {tc("cancel")}
        </button>
        <button onClick={() => onSave({ name: name.trim(), nameKm: nameKm.trim() || null, address: address.trim() || null, phone: phone.trim() || null, email: email.trim() || null, isActive })}
          disabled={busy || !name.trim()}
          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 text-white hover:bg-blue-700 rounded font-medium transition-colors disabled:opacity-50">
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} {tc("save")}
        </button>
      </div>
    </div>
  );
}

/* ── Generic Taxonomy Panel ────────────────────────────────────────── */

const PAGE_SIZE = 20;

function TaxonomyPanel({ apiPath, label, singularLabel, hasKm, hasDescription, basketType }: {
  apiPath: string;
  label: string;
  singularLabel: string;
  hasKm: boolean;
  hasDescription: boolean;
  basketType?: "ITEM" | "EBOOK" | "AUTHOR" | "MEMBER";
}) {
  const t  = useTranslations("taxonomy");
  const tc = useTranslations("common");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  function toggleSelect(id: string) {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    setSelected((prev) => prev.size === filtered.length ? new Set() : new Set(filtered.map((i) => i.id)));
  }

  const [items,   setItems]   = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [search,  setSearch]  = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [page,    setPage]    = useState(1);

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
    if (res.ok) { setEditing(null); fetchAll(); }
    else {
      const d = await res.json().catch(() => ({}));
      setError(typeof d.error === "string" ? d.error : "Update failed");
    }
    setBusy(false);
  }

  async function remove(id: string, name: string) {
    if (!confirm(t("confirmDeleteItem", { name }))) return;
    setBusy(true); setError(null);
    const res = await fetch(`${apiPath}/${id}`, { method: "DELETE" });
    if (res.ok) { fetchAll(); }
    else {
      const d = await res.json().catch(() => ({}));
      setError(typeof d.error === "string" ? d.error : "Delete failed");
    }
    setBusy(false);
  }

  const filtered = items.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase()) ||
    (i.nameKm ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const paginated  = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function handleSearch(v: string) { setSearch(v); setPage(1); }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <Plus className="w-4 h-4 text-indigo-500" /> {t("addNew", { name: singularLabel })}
        </h2>
        <div className="flex gap-2 flex-wrap">
          <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addNew()}
            placeholder={hasDescription ? t("codePlaceholder") : t("namePlaceholder")}
            disabled={busy}
            className="flex-1 min-w-[180px] px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50" />
          {hasKm && (
            <input type="text" value={newNameKm} onChange={(e) => setNewNameKm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addNew()}
              placeholder={t("khmerPlaceholder")} disabled={busy}
              className="flex-1 min-w-[180px] px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50" />
          )}
          {hasDescription && (
            <input type="text" value={newDescription} onChange={(e) => setNewDescription(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addNew()}
              placeholder={t("descPlaceholder")} disabled={busy}
              className="flex-[2] min-w-[220px] px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50" />
          )}
          <button onClick={addNew} disabled={busy || !newName.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {tc("add")}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3">
          {basketType && (
            <input type="checkbox"
              checked={filtered.length > 0 && selected.size === filtered.length}
              onChange={toggleAll}
              className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
          )}
          <h2 className="text-sm font-semibold text-gray-700">{label}</h2>
          <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded font-medium">{items.length}</span>
          {basketType && selected.size > 0 && (
            <>
              <span className="text-xs text-gray-500">{selected.size} selected</span>
              <AddToBasketButton
                basketType={basketType}
                selectedIds={[...selected]}
                entityField="authorIds"
                onAdded={() => setSelected(new Set())}
              />
            </>
          )}
          <div className="ml-auto relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input type="text" value={search} onChange={(e) => handleSearch(e.target.value)}
              placeholder={t("filterPlaceholder")}
              className="pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs w-48 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
        </div>

        {loading ? (
          <div className="px-5 py-12 text-center text-gray-400 text-sm">{tc("loading")}</div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-12 text-center text-gray-400 text-sm">
            {items.length === 0 ? t("noItems") : t("noMatches")}
          </div>
        ) : (
          <>
          <div className="divide-y divide-gray-100">
            {paginated.map((item) => (
              <div key={item.id} className={`flex items-center gap-2 ${selected.has(item.id) ? "bg-indigo-50/50" : ""}`}>
                {basketType && (
                  <div className="pl-5">
                    <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggleSelect(item.id)}
                      className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <EntityRow item={item} isEditing={editing === item.id} hasKm={hasKm}
                    hasDescription={hasDescription} onEdit={() => setEditing(item.id)}
                    onCancel={() => setEditing(null)} onSave={(patch) => saveEdit(item.id, patch)}
                    onDelete={() => remove(item.id, item.name)} busy={busy} />
                </div>
              </div>
            ))}
          </div>
          {totalPages > 1 && (
            <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between gap-3">
              <span className="text-xs text-gray-400">
                {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  className="px-2.5 py-1 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
                >
                  ‹ Prev
                </button>
                <span className="px-2.5 py-1 text-xs text-gray-600 font-medium">
                  {safePage} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage === totalPages}
                  className="px-2.5 py-1 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
                >
                  Next ›
                </button>
              </div>
            </div>
          )}
          </>
        )}
      </div>
    </div>
  );
}

/* ── Audience Panel ────────────────────────────────────────────────── */

const AUDIENCE_META: { value: string; defaultLabel: string; cls: string }[] = [
  { value: "CHILDREN",    defaultLabel: "Children",    cls: "bg-pink-50 text-pink-700 border-pink-200"      },
  { value: "YOUTH",       defaultLabel: "Youth",       cls: "bg-purple-50 text-purple-700 border-purple-200" },
  { value: "ADULTS",      defaultLabel: "Adults",      cls: "bg-blue-50 text-blue-700 border-blue-200"       },
  { value: "UNSPECIFIED", defaultLabel: "Unspecified", cls: "bg-gray-50 text-gray-600 border-gray-200"       },
];

interface AudienceBook {
  id: string; title: string; isbn: string | null;
  author: { name: string } | null;
  audienceLevel: string;
}

function AudiencePanel() {
  const [activeLevel, setActiveLevel] = useState<string>("UNSPECIFIED");
  const [books,   setBooks]   = useState<AudienceBook[]>([]);
  const [counts,  setCounts]  = useState<Record<string, number>>({});
  const [labels,  setLabels]  = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState("");
  const [busy,    setBusy]    = useState<string | null>(null);
  const [page,    setPage]    = useState(1);
  // inline label editing
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [labelDraft,   setLabelDraft]   = useState("");
  const [savingLabel,  setSavingLabel]  = useState(false);
  const PAGE = 30;

  async function safeJson(res: Response) {
    try { return await res.json(); } catch { return {}; }
  }

  async function loadLabels() {
    const res  = await fetch("/api/settings").catch(() => null);
    const data = res ? await safeJson(res) : {};
    try {
      const parsed = JSON.parse(data.AUDIENCE_LEVEL_LABELS ?? "{}");
      setLabels(parsed);
    } catch { /* use defaults */ }
  }

  async function saveLabel(value: string, newLabel: string) {
    setSavingLabel(true);
    const next = { ...labels, [value]: newLabel };
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ AUDIENCE_LEVEL_LABELS: JSON.stringify(next) }),
    }).catch(() => null);
    setLabels(next);
    setEditingLabel(null);
    setSavingLabel(false);
  }

  async function loadCounts() {
    const results = await Promise.all(
      AUDIENCE_META.map(async (lvl) => {
        const res  = await fetch(`/api/books?audienceLevel=${lvl.value}&limit=1&page=1`).catch(() => null);
        const data = res ? await safeJson(res) : {};
        return [lvl.value, data.total ?? 0] as const;
      })
    );
    setCounts(Object.fromEntries(results));
  }

  async function loadBooks(level: string, p = 1) {
    setLoading(true);
    const res  = await fetch(`/api/books?audienceLevel=${level}&page=${p}&limit=${PAGE}&sort=title`).catch(() => null);
    const data = res ? await safeJson(res) : {};
    setBooks(data.books ?? []);
    setLoading(false);
  }

  useEffect(() => { loadLabels(); loadCounts(); }, []);
  useEffect(() => { setPage(1); setSearch(""); loadBooks(activeLevel, 1); }, [activeLevel]);

  async function setAudience(bookId: string, newLevel: string) {
    setBusy(bookId);
    await fetch(`/api/books/${bookId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audienceLevel: newLevel }),
    }).catch(() => null);
    setBusy(null);
    await Promise.all([loadBooks(activeLevel, page), loadCounts()]);
  }

  function getLabel(value: string) {
    return labels[value] || AUDIENCE_META.find((m) => m.value === value)?.defaultLabel || value;
  }

  const filtered = books.filter((b) =>
    b.title.toLowerCase().includes(search.toLowerCase()) ||
    (b.author?.name ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (b.isbn ?? "").includes(search)
  );

  return (
    <div className="space-y-4">
      {/* Level cards — click to browse, double-click label to rename */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {AUDIENCE_META.map((lvl) => (
          <div key={lvl.value}
            onClick={() => setActiveLevel(lvl.value)}
            className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 cursor-pointer transition-all ${
              activeLevel === lvl.value
                ? `${lvl.cls} border-current shadow-sm`
                : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
            }`}>
            <span className="text-2xl font-extrabold">{counts[lvl.value] ?? "—"}</span>

            {editingLabel === lvl.value ? (
              <div className="flex items-center gap-1 w-full" onClick={(e) => e.stopPropagation()}>
                <input
                  autoFocus
                  value={labelDraft}
                  onChange={(e) => setLabelDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveLabel(lvl.value, labelDraft.trim() || lvl.defaultLabel);
                    if (e.key === "Escape") setEditingLabel(null);
                  }}
                  className="flex-1 min-w-0 px-1.5 py-0.5 text-xs border border-indigo-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-400 text-gray-900 bg-white"
                />
                <button onClick={() => saveLabel(lvl.value, labelDraft.trim() || lvl.defaultLabel)}
                  disabled={savingLabel}
                  className="p-0.5 text-indigo-600 hover:text-indigo-800 disabled:opacity-50">
                  {savingLabel ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                </button>
                <button onClick={() => setEditingLabel(null)} className="p-0.5 text-gray-400 hover:text-gray-600">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1 group/label">
                <span className="text-xs font-medium">{getLabel(lvl.value)}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); setEditingLabel(lvl.value); setLabelDraft(getLabel(lvl.value)); }}
                  className="opacity-0 group-hover/label:opacity-100 p-0.5 text-gray-400 hover:text-indigo-600 transition-opacity"
                  title="Rename">
                  <Edit2 className="w-2.5 h-2.5" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-400">Hover a card and click ✎ to rename the label.</p>

      {/* Books in selected level */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3">
          <span className="text-sm font-semibold text-gray-700">
            {getLabel(activeLevel)} books
          </span>
          <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded font-medium">
            {counts[activeLevel] ?? 0}
          </span>
          <div className="ml-auto relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Filter by title / author…"
              className="pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs w-52 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-gray-400 text-sm flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">No books found</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map((book) => (
              <div key={book.id} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{book.title}</p>
                  <p className="text-xs text-gray-400 truncate">
                    {book.author?.name ?? "No author"}
                    {book.isbn && <span className="ml-2 font-mono">{book.isbn}</span>}
                  </p>
                </div>
                <select
                  value={book.audienceLevel}
                  disabled={busy === book.id}
                  onChange={(e) => setAudience(book.id, e.target.value)}
                  className="px-2 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white disabled:opacity-50">
                  {AUDIENCE_META.map((lvl) => (
                    <option key={lvl.value} value={lvl.value}>{getLabel(lvl.value)}</option>
                  ))}
                </select>
                {busy === book.id && <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500 flex-shrink-0" />}
              </div>
            ))}
          </div>
        )}

        {(counts[activeLevel] ?? 0) > PAGE && (
          <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
            <span className="text-xs text-gray-400">
              Page {page} of {Math.ceil((counts[activeLevel] ?? 0) / PAGE)}
            </span>
            <div className="flex gap-1">
              <button onClick={() => { const p = Math.max(1, page - 1); setPage(p); loadBooks(activeLevel, p); }}
                disabled={page === 1}
                className="px-2.5 py-1 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40">‹ Prev</button>
              <button onClick={() => { const p = page + 1; setPage(p); loadBooks(activeLevel, p); }}
                disabled={page >= Math.ceil((counts[activeLevel] ?? 0) / PAGE)}
                className="px-2.5 py-1 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40">Next ›</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EntityRow({ item, isEditing, hasKm, hasDescription, onEdit, onCancel, onSave, onDelete, busy }: {
  item: Entity; isEditing: boolean; hasKm: boolean; hasDescription: boolean;
  onEdit: () => void; onCancel: () => void;
  onSave: (patch: { name: string; nameKm?: string | null; description?: string | null }) => void;
  onDelete: () => void; busy: boolean;
}) {
  const t  = useTranslations("taxonomy");
  const tc = useTranslations("common");
  const [name,        setName]        = useState(item.name);
  const [nameKm,      setNameKm]      = useState(item.nameKm ?? "");
  const [description, setDescription] = useState(item.description ?? "");

  useEffect(() => {
    if (isEditing) { setName(item.name); setNameKm(item.nameKm ?? ""); setDescription(item.description ?? ""); }
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
          {item.description && <p className="text-xs text-gray-500 mt-0.5 truncate">{item.description}</p>}
          {inUse > 0 && (
            <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
              <BookOpen className="w-3 h-3" /> {t("usedByBooks", { count: inUse })}
            </p>
          )}
        </div>
        <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title={tc("edit")}>
          <Edit2 className="w-3.5 h-3.5" />
        </button>
        <button onClick={onDelete} disabled={busy || inUse > 0}
          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-30"
          title={inUse > 0 ? t("cannotDelete", { count: inUse }) : tc("delete")}>
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="px-5 py-3 bg-blue-50/50 border-l-2 border-blue-300 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <input type="text" value={name} onChange={(e) => setName(e.target.value)}
          placeholder={hasDescription ? t("codeEditPlaceholder") : t("namePlaceholder")}
          className="flex-1 min-w-[160px] px-2.5 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-300" />
        {hasKm && (
          <input type="text" value={nameKm} onChange={(e) => setNameKm(e.target.value)}
            placeholder="ឈ្មោះខ្មែរ"
            className="flex-1 min-w-[140px] px-2.5 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-300" />
        )}
        {hasDescription && (
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder={t("descEditPlaceholder")}
            className="flex-[2] min-w-[200px] px-2.5 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-300" />
        )}
        <button onClick={onCancel} disabled={busy}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded transition-colors">
          <X className="w-3 h-3" /> {tc("cancel")}
        </button>
        <button onClick={() => onSave({ name: name.trim(), ...(hasKm && { nameKm: nameKm.trim() || null }), ...(hasDescription && { description: description.trim() || null }) })}
          disabled={busy || !name.trim()}
          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 text-white hover:bg-blue-700 rounded font-medium transition-colors disabled:opacity-50">
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} {tc("save")}
        </button>
      </div>
    </div>
  );
}
