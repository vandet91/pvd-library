"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import {
  Plus, Search, Edit, Trash2, Users, CheckCircle, XCircle,
  Upload, Download, CheckSquare, X, FileText,
  KeyRound, Printer, Eye, EyeOff,
} from "lucide-react";

interface Member {
  id: string; memberId: string; name: string; email?: string; phone?: string;
  memberType: string; isActive: boolean; joinDate: string;
  userId?: string | null;
  _count: { loans: number };
}

export default function MembersPage() {
  const t  = useTranslations("members");
  const tc = useTranslations("common");
  const locale = useLocale();

  const [members,  setMembers]  = useState<Member[]>([]);
  const [query,    setQuery]    = useState("");
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [importing,     setImporting]     = useState(false);
  const [importFile,    setImportFile]    = useState<File | null>(null);
  const [importResult,  setImportResult]  = useState<{ created: number; skipped: number } | null>(null);
  const [importLoading, setImportLoading] = useState(false);

  // Portal modal
  const [portalMember, setPortalMember] = useState<Member | null>(null);
  const [portalPwd,    setPortalPwd]    = useState("");
  const [portalShowPwd, setPortalShowPwd] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalMsg,    setPortalMsg]    = useState<{ ok: boolean; text: string } | null>(null);

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    const res  = await fetch(`/api/members?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    setMembers(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [query]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  async function handleDelete(id: string) {
    if (!confirm(t("confirmDelete"))) return;
    await fetch(`/api/members/${id}`, { method: "DELETE" });
    fetchMembers();
  }

  async function handleBulkDelete() {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} member(s)?`)) return;
    await Promise.all([...selected].map((id) => fetch(`/api/members/${id}`, { method: "DELETE" })));
    setSelected(new Set());
    fetchMembers();
  }

  function handleBulkExport(fmt: "xlsx" | "csv") {
    const ids = [...selected].join(",");
    window.location.href = `/api/members/export?format=${fmt}&ids=${ids}`;
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === members.length) setSelected(new Set());
    else setSelected(new Set(members.map((m) => m.id)));
  }

  async function handleImport() {
    if (!importFile) return;
    setImportLoading(true);
    const fd = new FormData();
    fd.append("file", importFile);
    const res  = await fetch("/api/members/import", { method: "POST", body: fd });
    const data = await res.json();
    setImportResult(data);
    setImportLoading(false);
    fetchMembers();
  }

  function openPortal(m: Member) {
    setPortalMember(m);
    setPortalPwd("");
    setPortalShowPwd(false);
    setPortalMsg(null);
  }

  async function handleSetPortal() {
    if (!portalMember || portalPwd.length < 6) return;
    setPortalLoading(true);
    const res  = await fetch(`/api/members/${portalMember.id}/portal`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ password: portalPwd }),
    });
    const data = await res.json();
    if (res.ok) {
      setPortalMsg({ ok: true, text: data.action === "updated" ? "Password updated." : "Portal access granted!" });
      fetchMembers();
    } else {
      setPortalMsg({ ok: false, text: data.error ?? "Failed" });
    }
    setPortalLoading(false);
  }

  function handlePrintCard(m: Member) {
    window.open(`/${locale}/print/member-card?id=${m.id}`, "_blank");
  }

  function handleBulkPrint() {
    const ids = [...selected].join(",");
    window.open(`/${locale}/print/member-card?id=${ids}`, "_blank");
  }

  const typeColors: Record<string, string> = {
    STUDENT: "bg-blue-50 text-blue-700",
    TEACHER: "bg-emerald-50 text-emerald-700",
    STAFF:   "bg-violet-50 text-violet-700",
    PUBLIC:  "bg-orange-50 text-orange-700",
  };

  const typeLabels: Record<string, string> = {
    STUDENT: t("student"), TEACHER: t("teacher"), STAFF: t("staff"), PUBLIC: t("public"),
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => { setImporting(true); setImportResult(null); setImportFile(null); }}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            <Upload className="w-4 h-4" />Import
          </button>
          <div className="relative group">
            <button className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
              <Download className="w-4 h-4" />Export
            </button>
            <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 hidden group-hover:block min-w-[120px]">
              <a href="/api/members/export?format=xlsx" className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-t-lg">
                <FileText className="w-4 h-4" /> Excel
              </a>
              <a href="/api/members/export?format=csv" className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-b-lg">
                <FileText className="w-4 h-4" /> CSV
              </a>
            </div>
          </div>
          <Link href={`/${locale}/admin/members/new`}
            className="flex items-center gap-2 bg-blue-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 transition-colors">
            <Plus className="w-4 h-4" />{t("addMember")}
          </Link>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder={`${tc("search")} ${t("title").toLowerCase()}...`}
            autoComplete="off"
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 bg-gray-900 text-white px-5 py-3 rounded-2xl shadow-2xl">
          <CheckSquare className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-medium">{selected.size} selected</span>
          <div className="h-4 w-px bg-white/20" />
          <button onClick={handleBulkPrint} className="flex items-center gap-1.5 text-sm hover:text-blue-300 transition-colors">
            <Printer className="w-3.5 h-3.5" /> Cards
          </button>
          <div className="h-4 w-px bg-white/20" />
          <button onClick={() => handleBulkExport("xlsx")} className="text-sm hover:text-blue-300 transition-colors">Excel</button>
          <button onClick={() => handleBulkExport("csv")} className="text-sm hover:text-blue-300 transition-colors">CSV</button>
          <div className="h-4 w-px bg-white/20" />
          <button onClick={handleBulkDelete} className="text-sm text-red-400 hover:text-red-300 transition-colors">{tc("delete")}</button>
          <button onClick={() => setSelected(new Set())} className="ml-1 p-1 hover:bg-white/10 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">{tc("loading")}</div>
        ) : members.length === 0 ? (
          <div className="p-8 text-center">
            <Users className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-400">{t("noMembers")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="pl-4 pr-2 py-3 w-10">
                    <input type="checkbox" checked={selected.size === members.length && members.length > 0}
                      onChange={toggleAll}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                  </th>
                  <th className="px-6 py-3 text-left">{t("memberId")}</th>
                  <th className="px-6 py-3 text-left">{t("memberName")}</th>
                  <th className="px-6 py-3 text-left">{t("memberType")}</th>
                  <th className="px-6 py-3 text-left">{t("phone")}</th>
                  <th className="px-6 py-3 text-left">Loans</th>
                  <th className="px-6 py-3 text-left">Portal</th>
                  <th className="px-6 py-3 text-left">{tc("status")}</th>
                  <th className="px-6 py-3 text-left">{tc("actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {members.map((m) => (
                  <tr key={m.id} className={`hover:bg-gray-50 transition-colors ${selected.has(m.id) ? "bg-blue-50" : ""}`}>
                    <td className="pl-4 pr-2 py-4">
                      <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggleSelect(m.id)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                    </td>
                    <td className="px-6 py-4 text-sm font-mono text-gray-600">{m.memberId}</td>
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-medium text-gray-900 text-sm">{m.name}</p>
                        {m.email && <p className="text-xs text-gray-400">{m.email}</p>}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${typeColors[m.memberType]}`}>
                        {typeLabels[m.memberType]}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{m.phone ?? "—"}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{m._count.loans}</td>
                    <td className="px-6 py-4">
                      {m.userId
                        ? <span className="flex items-center gap-1 text-green-600 text-xs"><CheckCircle className="w-3.5 h-3.5" />Active</span>
                        : <span className="flex items-center gap-1 text-gray-400 text-xs"><XCircle className="w-3.5 h-3.5" />None</span>}
                    </td>
                    <td className="px-6 py-4">
                      {m.isActive
                        ? <span className="flex items-center gap-1 text-green-600 text-xs"><CheckCircle className="w-3.5 h-3.5" />{tc("active")}</span>
                        : <span className="flex items-center gap-1 text-red-500 text-xs"><XCircle className="w-3.5 h-3.5" />{tc("inactive")}</span>}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1">
                        <button onClick={() => handlePrintCard(m)}
                          title="Print member card"
                          className="p-1.5 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors">
                          <Printer className="w-4 h-4" />
                        </button>
                        <button onClick={() => openPortal(m)}
                          title="Set portal access"
                          className="p-1.5 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors">
                          <KeyRound className="w-4 h-4" />
                        </button>
                        <Link href={`/${locale}/admin/members/${m.id}`}
                          className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                          <Edit className="w-4 h-4" />
                        </Link>
                        <button onClick={() => handleDelete(m.id)}
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

      {/* Import modal */}
      {importing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setImporting(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">Import Members</h2>
              <button onClick={() => setImporting(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            {!importResult ? (
              <div className="space-y-4">
                <p className="text-sm text-gray-500">Upload an Excel (.xlsx) or CSV file. Columns: Name, Email, Phone, Address, Type (STUDENT/TEACHER/STAFF/PUBLIC), ExpireDate</p>
                <a href="/api/members/import" className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
                  <Download className="w-4 h-4" /> Download template
                </a>
                <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center">
                  <input type="file" accept=".xlsx,.csv" onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                    className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
                </div>
                <button onClick={handleImport} disabled={!importFile || importLoading}
                  className="w-full flex items-center justify-center gap-2 bg-blue-900 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  {importLoading ? "Importing..." : "Import"}
                </button>
              </div>
            ) : (
              <div className="space-y-4 text-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                  <CheckSquare className="w-8 h-8 text-green-600" />
                </div>
                <div>
                  <p className="text-lg font-bold text-gray-900">Import Complete</p>
                  <p className="text-sm text-gray-500 mt-1">
                    <span className="text-green-600 font-semibold">{importResult.created} created</span>
                    {" · "}
                    <span className="text-gray-400">{importResult.skipped} skipped</span>
                  </p>
                </div>
                <button onClick={() => setImporting(false)}
                  className="w-full bg-gray-100 text-gray-700 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors">
                  {tc("close")}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Portal access modal */}
      {portalMember && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setPortalMember(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-amber-500" />
                <h2 className="font-bold text-gray-900">Portal Access</h2>
              </div>
              <button onClick={() => setPortalMember(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>

            <div className="mb-4 p-3 bg-amber-50 rounded-xl">
              <p className="text-sm font-semibold text-gray-900">{portalMember.name}</p>
              <p className="text-xs text-gray-500 font-mono mt-0.5">{portalMember.memberId}</p>
              {portalMember.userId && (
                <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> Portal account active — update password below
                </p>
              )}
            </div>

            <p className="text-sm text-gray-600 mb-3">
              {portalMember.userId ? "Change" : "Set"} the portal password so this member can log in with their Member ID.
            </p>

            <div className="relative mb-4">
              <input
                type={portalShowPwd ? "text" : "password"}
                value={portalPwd}
                onChange={(e) => setPortalPwd(e.target.value)}
                placeholder="New password (min 6 chars)"
                autoComplete="new-password"
                name="new-password"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 pr-10"
              />
              <button type="button" onClick={() => setPortalShowPwd(!portalShowPwd)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {portalShowPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {portalMsg && (
              <div className={`mb-3 text-sm px-3 py-2 rounded-lg ${portalMsg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
                {portalMsg.text}
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={() => setPortalMember(null)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={handleSetPortal} disabled={portalPwd.length < 6 || portalLoading}
                className="flex-1 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-medium hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                {portalLoading ? "Saving…" : (portalMember.userId ? "Update Password" : "Grant Access")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
