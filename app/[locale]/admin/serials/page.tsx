"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus, Pencil, Trash2, Check, X, Loader2, BookOpen,
  Calendar, RefreshCw, ChevronRight, Package, AlertTriangle,
  ToggleLeft, ToggleRight, Wand2, ExternalLink,
} from "lucide-react";

/* ── Types ──────────────────────────────────────────────────────── */
type SerialFrequency = "DAILY"|"WEEKLY"|"BIWEEKLY"|"MONTHLY"|"BIMONTHLY"|"QUARTERLY"|"SEMIANNUAL"|"ANNUAL"|"IRREGULAR";
type SubStatus = "ACTIVE"|"EXPIRED"|"CANCELLED"|"SUSPENDED";
type IssueStatus = "EXPECTED"|"RECEIVED"|"MISSING"|"CLAIMED"|"WITHDRAWN";

interface Serial {
  id: string; title: string; titleKm: string | null; issn: string | null;
  publisher: string | null; frequency: SerialFrequency; language: string | null;
  description: string | null; coverImage: string | null; isActive: boolean;
  _count?: { issues: number; subscriptions: number };
  subscriptions?: { id: string; endDate: string | null; cost: number | null; currency: string }[];
}

interface Subscription {
  id: string; serialId: string; status: SubStatus;
  startDate: string; endDate: string | null;
  cost: number | null; currency: string; autoRenew: boolean; notes: string | null;
  vendor?: { id: string; name: string } | null;
}

interface SerialIssue {
  id: string; serialId: string; issueNumber: string; volume: string | null;
  issueDate: string; receivedDate: string | null; status: IssueStatus; notes: string | null;
}

interface Vendor { id: string; name: string }

/* ── Constants ──────────────────────────────────────────────────── */
const FREQUENCIES: SerialFrequency[] = ["DAILY","WEEKLY","BIWEEKLY","MONTHLY","BIMONTHLY","QUARTERLY","SEMIANNUAL","ANNUAL","IRREGULAR"];
const FREQ_LABEL: Record<SerialFrequency, string> = {
  DAILY:"Daily", WEEKLY:"Weekly", BIWEEKLY:"Bi-weekly", MONTHLY:"Monthly",
  BIMONTHLY:"Bi-monthly", QUARTERLY:"Quarterly", SEMIANNUAL:"Semi-annual",
  ANNUAL:"Annual", IRREGULAR:"Irregular",
};

const ISSUE_META: Record<IssueStatus, { label: string; cls: string }> = {
  EXPECTED:  { label: "Expected",  cls: "bg-blue-100   text-blue-700"  },
  RECEIVED:  { label: "Received",  cls: "bg-green-100  text-green-700" },
  MISSING:   { label: "Missing",   cls: "bg-red-100    text-red-700"   },
  CLAIMED:   { label: "Claimed",   cls: "bg-amber-100  text-amber-700" },
  WITHDRAWN: { label: "Withdrawn", cls: "bg-gray-100   text-gray-500"  },
};

const SUB_META: Record<SubStatus, { label: string; cls: string }> = {
  ACTIVE:    { label: "Active",    cls: "bg-green-100  text-green-700" },
  EXPIRED:   { label: "Expired",   cls: "bg-red-100    text-red-600"   },
  CANCELLED: { label: "Cancelled", cls: "bg-gray-100   text-gray-500"  },
  SUSPENDED: { label: "Suspended", cls: "bg-amber-100  text-amber-700" },
};

const BLANK_SERIAL = { title:"", titleKm:"", issn:"", publisher:"", frequency:"MONTHLY" as SerialFrequency, language:"en", description:"", notes:"" };
const BLANK_SUB    = { vendorId:"", startDate:"", endDate:"", cost:"", currency:"USD", autoRenew:false, notes:"" };

/* ── Main page ───────────────────────────────────────────────────── */
export default function SerialsPage() {
  const [serials,  setSerials]  = useState<Serial[]>([]);
  const [vendors,  setVendors]  = useState<Vendor[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState<Serial | null>(null);
  const [detail,   setDetail]   = useState<{ subscriptions: Subscription[]; issues: SerialIssue[] } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  /* ── modals ─────────────────────────────────────────────────────── */
  const [sModal,  setSModal]  = useState<"create"|"edit"|null>(null);
  const [sForm,   setSForm]   = useState(BLANK_SERIAL);
  const [sEditId, setSEditId] = useState<string|null>(null);
  const [sSaving, setSSaving] = useState(false);
  const [sErr,    setSErr]    = useState<string|null>(null);
  const [sDelId,  setSDelId]  = useState<string|null>(null);

  const [subModal,  setSubModal]  = useState(false);
  const [subForm,   setSubForm]   = useState(BLANK_SUB);
  const [subSaving, setSubSaving] = useState(false);
  const [subErr,    setSubErr]    = useState<string|null>(null);
  const [subEditId, setSubEditId] = useState<string|null>(null);

  const [issueModal,  setIssueModal]  = useState(false);
  const [issueForm,   setIssueForm]   = useState({ issueNumber:"", volume:"", issueDate:"", receivedDate:"", status:"EXPECTED" as IssueStatus, notes:"" });
  const [issueSaving, setIssueSaving] = useState(false);
  const [issueErr,    setIssueErr]    = useState<string|null>(null);
  const [issueEditId, setIssueEditId] = useState<string|null>(null);

  const [genModal, setGenModal] = useState(false);
  const [genFrom,  setGenFrom]  = useState("");
  const [genCount, setGenCount] = useState(12);
  const [genBusy,  setGenBusy]  = useState(false);

  /* ── fetch ───────────────────────────────────────────────────────── */
  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [s, v] = await Promise.all([
      fetch("/api/serials").then(r => r.ok ? r.json() : []).catch(() => []),
      fetch("/api/acquisitions/vendors").then(r => r.ok ? r.json() : []).catch(() => []),
    ]);
    setSerials(Array.isArray(s) ? s : []);
    setVendors(Array.isArray(v) ? v.filter((x: Vendor & { isActive?: boolean }) => x.isActive !== false) : []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function loadDetail(serial: Serial) {
    setSelected(serial); setDetail(null); setDetailLoading(true);
    const data = await fetch(`/api/serials/${serial.id}`).then(r => r.json());
    setDetail({ subscriptions: data.subscriptions ?? [], issues: data.issues ?? [] });
    setDetailLoading(false);
  }

  /* ── serial CRUD ─────────────────────────────────────────────────── */
  function openSerialCreate() { setSForm(BLANK_SERIAL); setSEditId(null); setSErr(null); setSModal("create"); }
  function openSerialEdit(s: Serial) {
    setSForm({ title: s.title, titleKm: s.titleKm ?? "", issn: s.issn ?? "", publisher: s.publisher ?? "",
      frequency: s.frequency, language: s.language ?? "en", description: s.description ?? "", notes: "" });
    setSEditId(s.id); setSErr(null); setSModal("edit");
  }
  async function saveSerial() {
    if (!sForm.title.trim()) { setSErr("Title is required"); return; }
    setSSaving(true); setSErr(null);
    const url = sEditId ? `/api/serials/${sEditId}` : "/api/serials";
    const res = await fetch(url, { method: sEditId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sForm) });
    setSSaving(false);
    if (!res.ok) { const d = await res.json().catch(() => ({})); setSErr(d.error ?? "Failed"); return; }
    setSModal(null); fetchAll();
    if (sEditId && selected?.id === sEditId) loadDetail({ ...selected, ...sForm });
  }
  async function deleteSerial() {
    if (!sDelId) return;
    await fetch(`/api/serials/${sDelId}`, { method: "DELETE" });
    setSDelId(null); fetchAll();
    if (selected?.id === sDelId) { setSelected(null); setDetail(null); }
  }
  async function toggleSerial(s: Serial) {
    await fetch(`/api/serials/${s.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: !s.isActive }) });
    fetchAll();
  }

  /* ── subscription CRUD ───────────────────────────────────────────── */
  function openSubCreate() { setSubForm(BLANK_SUB); setSubEditId(null); setSubErr(null); setSubModal(true); }
  function openSubEdit(sub: Subscription) {
    setSubForm({ vendorId: sub.vendor?.id ?? "", startDate: sub.startDate.slice(0,10), endDate: sub.endDate?.slice(0,10) ?? "",
      cost: sub.cost?.toString() ?? "", currency: sub.currency, autoRenew: sub.autoRenew, notes: sub.notes ?? "" });
    setSubEditId(sub.id); setSubErr(null); setSubModal(true);
  }
  async function saveSub() {
    if (!subForm.startDate) { setSubErr("Start date is required"); return; }
    setSubSaving(true); setSubErr(null);
    const payload = { ...subForm, vendorId: subForm.vendorId || null, cost: subForm.cost ? Number(subForm.cost) : null, endDate: subForm.endDate || null };
    const url = subEditId ? `/api/serials/${selected!.id}/subscriptions/${subEditId}` : `/api/serials/${selected!.id}/subscriptions`;
    const res = await fetch(url, { method: subEditId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setSubSaving(false);
    if (!res.ok) { const d = await res.json().catch(() => ({})); setSubErr(d.error ?? "Failed"); return; }
    setSubModal(false); loadDetail(selected!);
  }
  async function deleteSub(subId: string) {
    await fetch(`/api/serials/${selected!.id}/subscriptions/${subId}`, { method: "DELETE" });
    loadDetail(selected!);
  }

  /* ── issue CRUD ──────────────────────────────────────────────────── */
  function openIssueCreate() { setIssueForm({ issueNumber:"", volume:"", issueDate:"", receivedDate:"", status:"EXPECTED", notes:"" }); setIssueEditId(null); setIssueErr(null); setIssueModal(true); }
  function openIssueEdit(issue: SerialIssue) {
    setIssueForm({ issueNumber: issue.issueNumber, volume: issue.volume ?? "", issueDate: issue.issueDate.slice(0,10),
      receivedDate: issue.receivedDate?.slice(0,10) ?? "", status: issue.status, notes: issue.notes ?? "" });
    setIssueEditId(issue.id); setIssueErr(null); setIssueModal(true);
  }
  async function saveIssue() {
    if (!issueForm.issueNumber.trim() || !issueForm.issueDate) { setIssueErr("Issue number and date are required"); return; }
    setIssueSaving(true); setIssueErr(null);
    const payload = { ...issueForm, volume: issueForm.volume || null, receivedDate: issueForm.receivedDate || null, notes: issueForm.notes || null };
    const url = issueEditId ? `/api/serials/${selected!.id}/issues/${issueEditId}` : `/api/serials/${selected!.id}/issues`;
    const res = await fetch(url, { method: issueEditId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setIssueSaving(false);
    if (!res.ok) { const d = await res.json().catch(() => ({})); setIssueErr(d.error ?? "Failed"); return; }
    setIssueModal(false); loadDetail(selected!);
  }
  async function deleteIssue(issueId: string) {
    await fetch(`/api/serials/${selected!.id}/issues/${issueId}`, { method: "DELETE" });
    loadDetail(selected!);
  }
  async function quickReceive(issue: SerialIssue) {
    await fetch(`/api/serials/${selected!.id}/issues/${issue.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "RECEIVED", receivedDate: new Date().toISOString().slice(0,10) }),
    });
    loadDetail(selected!);
  }

  /* ── generate issues ─────────────────────────────────────────────── */
  async function generateIssues() {
    if (!genFrom) return;
    setGenBusy(true);
    await fetch(`/api/serials/${selected!.id}/issues`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ generate: true, from: genFrom, count: genCount }),
    });
    setGenBusy(false); setGenModal(false); loadDetail(selected!);
  }

  /* ── helpers ─────────────────────────────────────────────────────── */
  const isExpiringSoon = (sub: Subscription) => {
    if (!sub.endDate || sub.status !== "ACTIVE") return false;
    return new Date(sub.endDate) < new Date(Date.now() + 30 * 86400000);
  };

  const missingCount = (issues: SerialIssue[]) => issues.filter(i => i.status === "MISSING" || i.status === "CLAIMED").length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Serials</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage journal, magazine, and newspaper subscriptions and issues</p>
        </div>
        <div className="flex gap-2">
          <button onClick={openSerialCreate} className="flex items-center gap-2 px-4 py-2 bg-blue-900 text-white rounded-xl text-sm font-semibold hover:bg-blue-800 transition-colors">
            <Plus className="w-4 h-4" /> New Serial
          </button>
          <button onClick={fetchAll} className="p-2 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-12 justify-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /> Loading…</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          {/* ── Serial list (2 cols) ── */}
          <div className="lg:col-span-2 space-y-2">
            {serials.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200">
                <BookOpen className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-sm text-gray-400">No serials yet</p>
              </div>
            ) : serials.map(s => {
              const activeSub = s.subscriptions?.[0];
              const expiring = activeSub?.endDate && new Date(activeSub.endDate) < new Date(Date.now() + 30 * 86400000);
              return (
                <button key={s.id} onClick={() => loadDetail(s)}
                  className={`w-full text-left bg-white rounded-xl border p-4 hover:shadow-md transition-all ${selected?.id === s.id ? "border-blue-400 shadow-md" : "border-gray-100"} ${!s.isActive ? "opacity-50" : ""}`}>
                  <div className="flex items-start gap-3">
                    {s.coverImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.coverImage} alt={s.title} className="w-10 h-12 object-cover rounded flex-shrink-0" />
                    ) : (
                      <div className="w-10 h-12 bg-indigo-100 rounded flex items-center justify-center flex-shrink-0">
                        <BookOpen className="w-5 h-5 text-indigo-400" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-gray-800 text-sm leading-tight truncate">{s.title}</p>
                      {s.titleKm && <p className="text-xs text-gray-400 truncate">{s.titleKm}</p>}
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className="text-xs bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-medium">{FREQ_LABEL[s.frequency]}</span>
                        {s.issn && <span className="text-xs font-mono text-gray-400">{s.issn}</span>}
                        {expiring && <span className="text-xs text-amber-600 font-semibold flex items-center gap-0.5"><AlertTriangle className="w-3 h-3" />Expiring</span>}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {s._count?.issues ?? 0} issues · {s._count?.subscriptions ?? 0} sub{(s._count?.subscriptions ?? 0) !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <button onClick={e => { e.stopPropagation(); toggleSerial(s); }}>
                        {s.isActive ? <ToggleRight className="w-5 h-5 text-green-500" /> : <ToggleLeft className="w-5 h-5 text-gray-300" />}
                      </button>
                      <button onClick={e => { e.stopPropagation(); openSerialEdit(s); }} className="text-gray-300 hover:text-blue-500 transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={e => { e.stopPropagation(); setSDelId(s.id); }} className="text-gray-300 hover:text-red-500 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* ── Detail panel (3 cols) ── */}
          <div className="lg:col-span-3">
            {!selected ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200">
                <ChevronRight className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                <p className="text-xs text-gray-400">Select a serial to manage its subscriptions and issues</p>
              </div>
            ) : detailLoading ? (
              <div className="flex items-center gap-2 py-16 justify-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
            ) : (
              <div className="space-y-4">
                {/* Serial header */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <div className="flex items-start gap-4">
                    {selected.coverImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={selected.coverImage} alt={selected.title} className="w-14 h-18 object-cover rounded-lg flex-shrink-0" />
                    ) : (
                      <div className="w-14 h-18 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <BookOpen className="w-6 h-6 text-indigo-400" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <h2 className="font-bold text-gray-900">{selected.title}</h2>
                      {selected.titleKm && <p className="text-sm text-gray-500">{selected.titleKm}</p>}
                      <div className="flex flex-wrap gap-2 mt-2 text-xs text-gray-500">
                        <span><strong>Frequency:</strong> {FREQ_LABEL[selected.frequency]}</span>
                        {selected.issn      && <span><strong>ISSN:</strong> {selected.issn}</span>}
                        {selected.publisher && <span><strong>Publisher:</strong> {selected.publisher}</span>}
                        {selected.language  && <span><strong>Language:</strong> {selected.language.toUpperCase()}</span>}
                      </div>
                      {detail && missingCount(detail.issues) > 0 && (
                        <div className="mt-2 flex items-center gap-1.5 text-xs text-red-600 font-semibold">
                          <AlertTriangle className="w-3.5 h-3.5" /> {missingCount(detail.issues)} missing/claimed issue{missingCount(detail.issues) !== 1 ? "s" : ""}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Subscriptions */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                    <h3 className="font-semibold text-gray-800 text-sm">Subscriptions</h3>
                    <button onClick={openSubCreate} className="flex items-center gap-1.5 text-xs text-blue-600 font-semibold hover:text-blue-800">
                      <Plus className="w-3.5 h-3.5" /> Add
                    </button>
                  </div>
                  {!detail?.subscriptions.length ? (
                    <p className="px-5 py-4 text-xs text-gray-400">No subscriptions yet</p>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {detail.subscriptions.map(sub => (
                        <div key={sub.id} className="px-5 py-3 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${SUB_META[sub.status].cls}`}>{SUB_META[sub.status].label}</span>
                              {sub.vendor && <span className="text-xs text-gray-600">{sub.vendor.name}</span>}
                              {isExpiringSoon(sub) && <span className="text-xs text-amber-600 font-bold flex items-center gap-0.5"><AlertTriangle className="w-3 h-3" />Expiring soon</span>}
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {new Date(sub.startDate).toLocaleDateString()} — {sub.endDate ? new Date(sub.endDate).toLocaleDateString() : "Open"}
                              {sub.cost && ` · ${sub.currency} ${sub.cost.toFixed(2)}/yr`}
                              {sub.autoRenew && " · Auto-renew"}
                            </p>
                          </div>
                          <div className="flex gap-1 flex-shrink-0">
                            <button onClick={() => openSubEdit(sub)} className="p-1 text-gray-300 hover:text-blue-500"><Pencil className="w-3.5 h-3.5" /></button>
                            <button onClick={() => deleteSub(sub.id)} className="p-1 text-gray-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Issues */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                    <h3 className="font-semibold text-gray-800 text-sm">
                      Issues <span className="text-gray-400 font-normal">({detail?.issues.length ?? 0})</span>
                    </h3>
                    <div className="flex gap-2">
                      <button onClick={() => setGenModal(true)} className="flex items-center gap-1.5 text-xs text-violet-600 font-semibold hover:text-violet-800">
                        <Wand2 className="w-3.5 h-3.5" /> Generate
                      </button>
                      <button onClick={openIssueCreate} className="flex items-center gap-1.5 text-xs text-blue-600 font-semibold hover:text-blue-800">
                        <Plus className="w-3.5 h-3.5" /> Add
                      </button>
                    </div>
                  </div>
                  {!detail?.issues.length ? (
                    <p className="px-5 py-4 text-xs text-gray-400">No issues yet — add manually or use Generate to predict expected issues from frequency.</p>
                  ) : (
                    <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
                      {detail.issues.map(issue => (
                        <div key={issue.id} className="px-5 py-2.5 flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${ISSUE_META[issue.status].cls}`}>{ISSUE_META[issue.status].label}</span>
                              <p className="text-sm font-medium text-gray-800 truncate">
                                {issue.volume ? `${issue.volume} · ` : ""}{issue.issueNumber}
                              </p>
                            </div>
                            <p className="text-xs text-gray-400">
                              {new Date(issue.issueDate).toLocaleDateString()}
                              {issue.receivedDate && ` · Received ${new Date(issue.receivedDate).toLocaleDateString()}`}
                            </p>
                          </div>
                          <div className="flex gap-1 flex-shrink-0">
                            {issue.status === "EXPECTED" && (
                              <button onClick={() => quickReceive(issue)} title="Mark received"
                                className="p-1 text-gray-300 hover:text-green-600"><Package className="w-3.5 h-3.5" /></button>
                            )}
                            <button onClick={() => openIssueEdit(issue)} className="p-1 text-gray-300 hover:text-blue-500"><Pencil className="w-3.5 h-3.5" /></button>
                            <button onClick={() => deleteIssue(issue.id)} className="p-1 text-gray-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Serial modal ─────────────────────────────────────────────── */}
      {sModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">{sModal === "create" ? "New Serial" : "Edit Serial"}</h2>
              <button onClick={() => setSModal(null)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="px-6 py-5 space-y-3">
              {[["title","Title *"],["titleKm","Khmer Title"],["issn","ISSN"],["publisher","Publisher"]].map(([k,l]) => (
                <div key={k}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{l}</label>
                  <input type="text" value={(sForm as Record<string,string>)[k]} onChange={e => setSForm(f => ({ ...f, [k]: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              ))}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Frequency</label>
                  <select value={sForm.frequency} onChange={e => setSForm(f => ({ ...f, frequency: e.target.value as SerialFrequency }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {FREQUENCIES.map(f => <option key={f} value={f}>{FREQ_LABEL[f]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Language</label>
                  <input type="text" value={sForm.language} onChange={e => setSForm(f => ({ ...f, language: e.target.value }))}
                    placeholder="en, km, fr…"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                <textarea rows={2} value={sForm.description} onChange={e => setSForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              {sErr && <div className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{sErr}</div>}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setSModal(null)} className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={saveSerial} disabled={sSaving}
                className="flex items-center gap-2 px-4 py-2 bg-blue-900 text-white rounded-xl text-sm font-semibold hover:bg-blue-800 disabled:opacity-50">
                {sSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {sModal === "create" ? "Create" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Subscription modal ───────────────────────────────────────── */}
      {subModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">{subEditId ? "Edit Subscription" : "New Subscription"}</h2>
              <button onClick={() => setSubModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="px-6 py-5 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Vendor</label>
                <select value={subForm.vendorId} onChange={e => setSubForm(f => ({ ...f, vendorId: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— No vendor —</option>
                  {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Start Date *</label>
                  <input type="date" value={subForm.startDate} onChange={e => setSubForm(f => ({ ...f, startDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">End Date</label>
                  <input type="date" value={subForm.endDate} onChange={e => setSubForm(f => ({ ...f, endDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Annual Cost</label>
                  <input type="number" min={0} step={0.01} value={subForm.cost} onChange={e => setSubForm(f => ({ ...f, cost: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Currency</label>
                  <select value={subForm.currency} onChange={e => setSubForm(f => ({ ...f, currency: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {["USD","KHR","EUR","THB"].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={subForm.autoRenew} onChange={e => setSubForm(f => ({ ...f, autoRenew: e.target.checked }))} className="w-4 h-4 accent-blue-600" />
                <span className="text-sm text-gray-700">Auto-renew</span>
              </label>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <textarea rows={2} value={subForm.notes} onChange={e => setSubForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              {subErr && <div className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{subErr}</div>}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setSubModal(false)} className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={saveSub} disabled={subSaving}
                className="flex items-center gap-2 px-4 py-2 bg-blue-900 text-white rounded-xl text-sm font-semibold hover:bg-blue-800 disabled:opacity-50">
                {subSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Issue modal ───────────────────────────────────────────────── */}
      {issueModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">{issueEditId ? "Edit Issue" : "New Issue"}</h2>
              <button onClick={() => setIssueModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="px-6 py-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Issue Number *</label>
                  <input type="text" value={issueForm.issueNumber} onChange={e => setIssueForm(f => ({ ...f, issueNumber: e.target.value }))} placeholder="e.g. No. 5"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Volume</label>
                  <input type="text" value={issueForm.volume} onChange={e => setIssueForm(f => ({ ...f, volume: e.target.value }))} placeholder="e.g. Vol. 3"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Issue Date *</label>
                  <input type="date" value={issueForm.issueDate} onChange={e => setIssueForm(f => ({ ...f, issueDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Received Date</label>
                  <input type="date" value={issueForm.receivedDate} onChange={e => setIssueForm(f => ({ ...f, receivedDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                <select value={issueForm.status} onChange={e => setIssueForm(f => ({ ...f, status: e.target.value as IssueStatus }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {(Object.keys(ISSUE_META) as IssueStatus[]).map(s => <option key={s} value={s}>{ISSUE_META[s].label}</option>)}
                </select>
              </div>
              {issueErr && <div className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{issueErr}</div>}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setIssueModal(false)} className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={saveIssue} disabled={issueSaving}
                className="flex items-center gap-2 px-4 py-2 bg-blue-900 text-white rounded-xl text-sm font-semibold hover:bg-blue-800 disabled:opacity-50">
                {issueSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Generate issues modal ─────────────────────────────────────── */}
      {genModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900 flex items-center gap-2"><Wand2 className="w-4 h-4 text-violet-600" /> Generate Expected Issues</h2>
              <button onClick={() => setGenModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="px-6 py-5 space-y-3">
              <p className="text-xs text-gray-500">Auto-generate <em>Expected</em> issues based on the serial&apos;s frequency ({FREQ_LABEL[selected!.frequency]}). Mark them received as they arrive.</p>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Starting from *</label>
                <input type="date" value={genFrom} onChange={e => setGenFrom(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Number of issues (max 60)</label>
                <input type="number" min={1} max={60} value={genCount} onChange={e => setGenCount(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setGenModal(false)} className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={generateIssues} disabled={genBusy || !genFrom}
                className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 disabled:opacity-50">
                {genBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />} Generate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Serial delete confirm ─────────────────────────────────────── */}
      {sDelId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
            <Trash2 className="w-10 h-10 text-red-400 mx-auto mb-3" />
            <h3 className="font-bold text-gray-900 mb-1">Delete this serial?</h3>
            <p className="text-sm text-gray-500 mb-5">All subscriptions and issues will also be deleted.</p>
            <div className="flex gap-3">
              <button onClick={() => setSDelId(null)} className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={deleteSerial} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
