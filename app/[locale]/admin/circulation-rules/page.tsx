"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus, Pencil, Trash2, Check, X, Loader2, BookOpen, Users,
  ToggleLeft, ToggleRight, Info, ListFilter,
} from "lucide-react";

/* ── Types ─────────────────────────────────────────────────────── */
interface Branch { id: string; name: string }

interface CircRule {
  id:           string;
  name:         string;
  memberType:   string | null;
  materialType: string | null;
  branchId:     string | null;
  branch?:      Branch | null;
  loanDays:     number;
  maxLoans:     number;
  maxRenewals:  number;
  renewalDays:  number;
  finePerDay:   number;
  allowHomeLoan: boolean;
  isActive:     boolean;
  notes?:       string | null;
}

const MEMBER_TYPES = ["STUDENT", "TEACHER", "STAFF", "PUBLIC"];
const MATERIAL_TYPES = [
  "BOOK", "MAGAZINE", "JOURNAL", "NEWSPAPER",
  "DVD", "AUDIO_CD", "THESIS", "MAP", "OTHER",
];

const MEMBER_COLOR: Record<string, string> = {
  STUDENT:  "bg-blue-100   text-blue-700",
  TEACHER:  "bg-purple-100 text-purple-700",
  STAFF:    "bg-green-100  text-green-700",
  PUBLIC:   "bg-orange-100 text-orange-700",
};
const MATERIAL_COLOR: Record<string, string> = {
  BOOK:      "bg-indigo-100 text-indigo-700",
  MAGAZINE:  "bg-pink-100   text-pink-700",
  JOURNAL:   "bg-violet-100 text-violet-700",
  NEWSPAPER: "bg-yellow-100 text-yellow-800",
  DVD:       "bg-red-100    text-red-700",
  AUDIO_CD:  "bg-orange-100 text-orange-700",
  THESIS:    "bg-teal-100   text-teal-700",
  MAP:       "bg-lime-100   text-lime-700",
  OTHER:     "bg-gray-100   text-gray-600",
};

function pill(label: string, colorMap: Record<string, string>) {
  const cls = colorMap[label] ?? "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}

/* ── Blank form ─────────────────────────────────────────────────── */
const BLANK: Omit<CircRule, "id" | "branch"> = {
  name: "", memberType: null, materialType: null, branchId: null,
  loanDays: 14, maxLoans: 3, maxRenewals: 2, renewalDays: 14,
  finePerDay: 0.50, allowHomeLoan: true, isActive: true, notes: null,
};

/* ── Number input helper ─────────────────────────────────────────── */
function NumInput({
  label, value, onChange, min = 0, step = 1,
}: { label: string; value: number; onChange: (v: number) => void; min?: number; step?: number }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type="number" min={min} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}

/* ── Main page ───────────────────────────────────────────────────── */
export default function CirculationRulesPage() {
  const [rules,    setRules]    = useState<CircRule[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  /* modal state */
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [form,  setForm]  = useState<Omit<CircRule, "id" | "branch">>(BLANK);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  /* delete confirm */
  const [deleteId,   setDeleteId]   = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  /* filter */
  const [filterMember,   setFilterMember]   = useState("");
  const [filterMaterial, setFilterMaterial] = useState("");

  const fetchAll = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [r, b] = await Promise.all([
        fetch("/api/circulation-rules").then((x) => x.json()),
        fetch("/api/branches").then((x) => x.json()),
      ]);
      setRules(Array.isArray(r) ? r : []);
      setBranches(Array.isArray(b) ? b.filter((br: Branch & { isActive?: boolean }) => br.isActive !== false) : []);
    } catch { setError("Failed to load rules."); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  function openCreate() {
    setForm(BLANK); setEditId(null); setSaveErr(null); setModal("create");
  }
  function openEdit(r: CircRule) {
    setForm({
      name: r.name, memberType: r.memberType, materialType: r.materialType,
      branchId: r.branchId, loanDays: r.loanDays, maxLoans: r.maxLoans,
      maxRenewals: r.maxRenewals, renewalDays: r.renewalDays,
      finePerDay: r.finePerDay, allowHomeLoan: r.allowHomeLoan,
      isActive: r.isActive, notes: r.notes ?? null,
    });
    setEditId(r.id); setSaveErr(null); setModal("edit");
  }

  async function handleSave() {
    if (!form.name.trim()) { setSaveErr("Name is required"); return; }
    setSaving(true); setSaveErr(null);
    try {
      const url    = editId ? `/api/circulation-rules/${editId}` : "/api/circulation-rules";
      const method = editId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setSaveErr(d.error ?? "Failed to save rule");
      } else {
        setModal(null); fetchAll();
      }
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!deleteId) return;
    setDeleteBusy(true);
    try {
      await fetch(`/api/circulation-rules/${deleteId}`, { method: "DELETE" });
      setDeleteId(null); fetchAll();
    } finally { setDeleteBusy(false); }
  }

  async function toggleActive(r: CircRule) {
    await fetch(`/api/circulation-rules/${r.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !r.isActive }),
    });
    fetchAll();
  }

  const filtered = rules.filter((r) => {
    if (filterMember   && r.memberType   !== filterMember)   return false;
    if (filterMaterial && r.materialType !== filterMaterial) return false;
    return true;
  });

  /* ── Specificity badge ─────────────────────────────────────────── */
  function specificityLabel(r: CircRule) {
    const parts = [];
    if (r.memberType)   parts.push("Patron");
    if (r.materialType) parts.push("Material");
    if (r.branchId)     parts.push("Branch");
    if (parts.length === 0) return <span className="text-xs text-gray-400 italic">Global fallback</span>;
    return <span className="text-xs text-emerald-700 font-medium">{parts.join(" + ")}</span>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Circulation Rules</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Define loan duration, quotas, renewals and fines per patron type, material type, or branch.
            More specific rules override less specific ones.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-900 text-white rounded-xl text-sm font-semibold hover:bg-blue-800 transition-colors"
        >
          <Plus className="w-4 h-4" /> New Rule
        </button>
      </div>

      {/* Info box */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-800">
        <Info className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-500" />
        <div>
          <strong>How rules are matched:</strong> When a loan is created, the system picks the most specific
          active rule. A rule matching Patron + Material + Branch wins over Patron + Material, which wins over
          Patron only. Rules with no criteria act as a global override. If no rule matches, global Settings values are used.
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <ListFilter className="w-4 h-4 text-gray-400" />
        <select value={filterMember} onChange={(e) => setFilterMember(e.target.value)}
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All patron types</option>
          {MEMBER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filterMaterial} onChange={(e) => setFilterMaterial(e.target.value)}
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All material types</option>
          {MATERIAL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        {(filterMember || filterMaterial) && (
          <button onClick={() => { setFilterMember(""); setFilterMaterial(""); }}
            className="text-xs text-gray-400 hover:text-gray-600 underline">Clear filters</button>
        )}
        <span className="ml-auto text-xs text-gray-400">{filtered.length} rule{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center gap-2 py-12 justify-center text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading…
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200">
          <BookOpen className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-400 font-medium">No circulation rules yet</p>
          <p className="text-xs text-gray-300 mt-1">Create a rule to override the global loan settings for specific patron or material types.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3">Rule / Scope</th>
                <th className="text-center px-3 py-3">Loan Days</th>
                <th className="text-center px-3 py-3">Max Loans</th>
                <th className="text-center px-3 py-3">Renewals</th>
                <th className="text-center px-3 py-3">Fine/Day</th>
                <th className="text-center px-3 py-3">Home Loan</th>
                <th className="text-center px-3 py-3">Active</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((r) => (
                <tr key={r.id} className={`hover:bg-gray-50 transition-colors ${!r.isActive ? "opacity-50" : ""}`}>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-gray-800">{r.name}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {r.memberType   ? pill(r.memberType,   MEMBER_COLOR)   : <span className="text-xs text-gray-300">Any patron</span>}
                      {r.materialType ? pill(r.materialType, MATERIAL_COLOR) : <span className="text-xs text-gray-300">Any material</span>}
                      {r.branch       ? <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-semibold">{r.branch.name}</span> : null}
                    </div>
                    <div className="mt-1">{specificityLabel(r)}</div>
                  </td>
                  <td className="px-3 py-3 text-center font-mono font-semibold text-gray-700">{r.loanDays}d</td>
                  <td className="px-3 py-3 text-center font-mono font-semibold text-gray-700">{r.maxLoans}</td>
                  <td className="px-3 py-3 text-center text-xs text-gray-600">
                    {r.maxRenewals}× / {r.renewalDays}d
                  </td>
                  <td className="px-3 py-3 text-center font-mono text-gray-600">${r.finePerDay.toFixed(2)}</td>
                  <td className="px-3 py-3 text-center">
                    {r.allowHomeLoan
                      ? <Check className="w-4 h-4 text-green-500 mx-auto" />
                      : <X    className="w-4 h-4 text-red-400  mx-auto" />}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <button onClick={() => toggleActive(r)} title={r.isActive ? "Deactivate" : "Activate"}>
                      {r.isActive
                        ? <ToggleRight className="w-5 h-5 text-green-500 mx-auto" />
                        : <ToggleLeft  className="w-5 h-5 text-gray-300  mx-auto" />}
                    </button>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => openEdit(r)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setDeleteId(r.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* ── Create / Edit Modal ─────────────────────────────────────── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">{modal === "create" ? "New Circulation Rule" : "Edit Rule"}</h2>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Rule Name <span className="text-red-400">*</span></label>
                <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Student – Magazine, Teacher – All, Reference Only"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              {/* Scope */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    <Users className="w-3 h-3 inline mr-1" />Patron Type
                  </label>
                  <select value={form.memberType ?? ""} onChange={(e) => setForm((f) => ({ ...f, memberType: e.target.value || null }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">All patrons</option>
                    {MEMBER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    <BookOpen className="w-3 h-3 inline mr-1" />Material Type
                  </label>
                  <select value={form.materialType ?? ""} onChange={(e) => setForm((f) => ({ ...f, materialType: e.target.value || null }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">All materials</option>
                    {MATERIAL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Branch</label>
                  <select value={form.branchId ?? ""} onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value || null }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">All branches</option>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Loan parameters */}
              <div className="grid grid-cols-2 gap-3">
                <NumInput label="Loan Days"    value={form.loanDays}    onChange={(v) => setForm((f) => ({ ...f, loanDays: v }))}    min={1} />
                <NumInput label="Max Loans"    value={form.maxLoans}    onChange={(v) => setForm((f) => ({ ...f, maxLoans: v }))}    min={1} />
                <NumInput label="Max Renewals" value={form.maxRenewals} onChange={(v) => setForm((f) => ({ ...f, maxRenewals: v }))} min={0} />
                <NumInput label="Renewal Days" value={form.renewalDays} onChange={(v) => setForm((f) => ({ ...f, renewalDays: v }))} min={1} />
                <NumInput label="Fine / Day ($)" value={form.finePerDay} onChange={(v) => setForm((f) => ({ ...f, finePerDay: v }))} min={0} step={0.01} />
              </div>

              {/* Toggles */}
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={form.allowHomeLoan}
                    onChange={(e) => setForm((f) => ({ ...f, allowHomeLoan: e.target.checked }))}
                    className="w-4 h-4 accent-blue-600" />
                  <span className="text-sm text-gray-700">Allow home loans</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={form.isActive}
                    onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                    className="w-4 h-4 accent-blue-600" />
                  <span className="text-sm text-gray-700">Active</span>
                </label>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
                <textarea rows={2} value={form.notes ?? ""} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value || null }))}
                  placeholder="Internal notes about this rule…"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>

              {saveErr && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{saveErr}</div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setModal(null)}
                className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-blue-900 text-white rounded-xl text-sm font-semibold hover:bg-blue-800 disabled:opacity-50 transition-colors">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {modal === "create" ? "Create Rule" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm ──────────────────────────────────────────── */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
            <Trash2 className="w-10 h-10 text-red-400 mx-auto mb-3" />
            <h3 className="font-bold text-gray-900 mb-1">Delete this rule?</h3>
            <p className="text-sm text-gray-500 mb-5">This cannot be undone. Existing loans are not affected.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleteBusy}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors">
                {deleteBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
