"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import {
  Plus, Search, Edit, Trash2, Users, CheckCircle, XCircle, Send,
  Upload, Download, CheckSquare, X, FileText,
  KeyRound, Printer, Eye, EyeOff, UserCheck, Clock,
  Mail, Phone, MapPin, Calendar, BookOpen, AlertTriangle,
  DollarSign, Bookmark, ChevronLeft, ChevronRight, Loader2,
  TrendingUp, UserPlus,
} from "lucide-react";
import AddToBasketButton from "@/components/admin/AddToBasketButton";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Member {
  id: string; memberId: string; name: string; email?: string; phone?: string;
  address?: string; memberType: string; isActive: boolean; pendingApproval: boolean;
  joinDate: string; createdAt: string; expireDate?: string | null;
  userId?: string | null;
  telegramChatId?: string | null;
  hasOverdue?: boolean;
  restrictionStatus?: string;
  _count: { loans: number };
}

const RESTRICTION_BADGE: Record<string, { label: string; color: string }> = {
  IN_LIBRARY_ONLY: { label: "In-Library",   color: "text-blue-600 bg-blue-50" },
  SUSPENDED:       { label: "Suspended",     color: "text-amber-600 bg-amber-50" },
  BLOCKED:         { label: "Blocked",       color: "text-red-600 bg-red-50" },
  BLACKLISTED:     { label: "Blacklisted",   color: "text-white bg-gray-900" },
};

/** Convert a local or international phone number to a Telegram deep-link URL.
 *  Cambodian local (0XX…) is normalized to +855XX… automatically. */
function phoneToTelegramUrl(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  // Cambodian local format: starts with 0, 9–10 digits → strip leading 0, prepend 855
  const normalized =
    digits.startsWith("0") && digits.length >= 9 && digits.length <= 10
      ? "855" + digits.slice(1)
      : digits; // already international or unknown — use as-is
  return `https://t.me/+${normalized}`;
}

interface MemberDetail extends Member { // pendingApproval inherited from Member
  loans: Array<{
    id: string; status: string;
    book: { title: string };
    fines?: { id: string; amount: number; status: string }[];
  }>;
  fines: Array<{ id: string; amount: number; paid: boolean }>;
  reservations: Array<{ id: string; status: string }>;
}

type FilterStatus = "all" | "active" | "pending";

// ─── Avatar helpers ───────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "bg-blue-500", "bg-emerald-500", "bg-violet-500", "bg-orange-500",
  "bg-pink-500", "bg-cyan-500", "bg-amber-500", "bg-rose-500",
];

function avatarBg(name: string) {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

// ─── Pagination helper ────────────────────────────────────────────────────────

function getPageNums(cur: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (cur <= 4)         return [1, 2, 3, 4, 5, "…", total];
  if (cur >= total - 3) return [1, "…", total - 4, total - 3, total - 2, total - 1, total];
  return [1, "…", cur - 1, cur, cur + 1, "…", total];
}

// ─── StatCard component ───────────────────────────────────────────────────────

function StatCard({ icon: Icon, iconBg, label, value, sub, subColor = "text-gray-400" }: {
  icon: React.ElementType;
  iconBg: string;
  label: string;
  value: number | string;
  sub: string;
  subColor?: string;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
          <p className={`text-xs mt-1 font-medium ${subColor}`}>{sub}</p>
        </div>
        <div className={`w-10 h-10 ${iconBg} rounded-xl flex items-center justify-center flex-shrink-0`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MembersPage() {
  const t      = useTranslations("members");
  const tc     = useTranslations("common");
  const locale = useLocale();

  // Core list state
  const [members,      setMembers]      = useState<Member[]>([]);
  const [query,        setQuery]        = useState("");
  const [loading,      setLoading]      = useState(true);
  const [selected,     setSelected]     = useState<Set<string>>(new Set());
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [counts,       setCounts]       = useState({ total: 0, active: 0, pending: 0, newThisMonth: 0 });
  const [approvingId,  setApprovingId]  = useState<string | null>(null);

  // Pagination
  const [page,       setPage]       = useState(1);
  const [limit,      setLimit]      = useState(10);
  const [totalCount, setTotalCount] = useState(0);

  // Side panel
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [memberDetail,     setMemberDetail]     = useState<MemberDetail | null>(null);
  const [detailLoading,    setDetailLoading]    = useState(false);

  // Phone/Telegram click action setting
  const [phoneClickAction, setPhoneClickAction] = useState("both");

  // Import modal
  const [importing,     setImporting]     = useState(false);
  const [importFile,    setImportFile]    = useState<File | null>(null);
  const [importResult,  setImportResult]  = useState<{ created: number; skipped: number } | null>(null);
  const [importLoading, setImportLoading] = useState(false);

  // Portal modal
  const [portalMember,  setPortalMember]  = useState<Member | null>(null);
  const [portalPwd,     setPortalPwd]     = useState("");
  const [portalShowPwd, setPortalShowPwd] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalMsg,     setPortalMsg]     = useState<{ ok: boolean; text: string } | null>(null);

  // ── Data fetching ─────────────────────────────────────────────────────────

  const fetchCounts = useCallback(async () => {
    const res = await fetch("/api/members?counts=true");
    if (res.ok) setCounts(await res.json());
  }, []);

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    const statusParam = filterStatus === "all" ? "" : `&status=${filterStatus}`;
    const res  = await fetch(
      `/api/members?q=${encodeURIComponent(query)}${statusParam}&page=${page}&limit=${limit}`
    );
    const data = await res.json();
    if (data.members) {
      setMembers(data.members);
      setTotalCount(data.total ?? 0);
    } else {
      setMembers(Array.isArray(data) ? data : []);
      setTotalCount(0);
    }
    setLoading(false);
  }, [query, filterStatus, page, limit]);

  // Reset to page 1 when query or filter changes
  useEffect(() => { setPage(1); }, [query, filterStatus]);

  useEffect(() => { fetchMembers(); fetchCounts(); }, [fetchMembers, fetchCounts]);

  // Load phone/telegram action preference from settings
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.ok ? r.json() : {})
      .then((d: Record<string, string>) => {
        if (d.PHONE_CLICK_ACTION) setPhoneClickAction(d.PHONE_CLICK_ACTION);
      })
      .catch(() => {});
  }, []);

  // ── Side panel ────────────────────────────────────────────────────────────

  async function handleRowClick(m: Member) {
    if (selectedMemberId === m.id) {
      setSelectedMemberId(null);
      setMemberDetail(null);
      return;
    }
    setSelectedMemberId(m.id);
    setMemberDetail(null);
    setDetailLoading(true);
    const res = await fetch(`/api/members/${m.id}`);
    if (res.ok) setMemberDetail(await res.json());
    setDetailLoading(false);
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  async function handleDelete(id: string) {
    if (!confirm(t("confirmDelete"))) return;
    await fetch(`/api/members/${id}`, { method: "DELETE" });
    if (selectedMemberId === id) { setSelectedMemberId(null); setMemberDetail(null); }
    fetchMembers();
    fetchCounts();
  }

  async function handleApprove(id: string) {
    setApprovingId(id);
    await fetch(`/api/members/${id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ isActive: true }),
    });
    setApprovingId(null);
    fetchMembers();
    fetchCounts();
    if (selectedMemberId === id) {
      const res = await fetch(`/api/members/${id}`);
      if (res.ok) setMemberDetail(await res.json());
    }
  }

  async function handleBulkDelete() {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} member(s)?`)) return;
    await Promise.all([...selected].map((id) => fetch(`/api/members/${id}`, { method: "DELETE" })));
    if (selectedMemberId && selected.has(selectedMemberId)) {
      setSelectedMemberId(null);
      setMemberDetail(null);
    }
    setSelected(new Set());
    fetchMembers();
    fetchCounts();
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

  // ── Display helpers ───────────────────────────────────────────────────────

  const typeColors: Record<string, string> = {
    STUDENT: "bg-blue-50 text-blue-700",
    TEACHER: "bg-emerald-50 text-emerald-700",
    STAFF:   "bg-violet-50 text-violet-700",
    PUBLIC:  "bg-orange-50 text-orange-700",
  };

  const typeLabels: Record<string, string> = {
    STUDENT: t("student"), TEACHER: t("teacher"), STAFF: t("staff"), PUBLIC: t("public"),
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / limit));
  const startRow   = totalCount === 0 ? 0 : (page - 1) * limit + 1;
  const endRow     = Math.min(page * limit, totalCount);

  // Side panel computed stats
  const booksBorrowed = memberDetail?.loans.length ?? 0;
  const booksOverdue  = memberDetail?.loans.filter((l) => l.status === "OVERDUE").length ?? 0;
  const unpaidFines   = memberDetail?.fines
    .filter((f) => !f.paid)
    .reduce((s, f) => s + Number(f.amount), 0) ?? 0;
  const reservCount   = memberDetail?.reservations.length ?? 0;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => { setImporting(true); setImportResult(null); setImportFile(null); }}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
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
          <Link
            href={`/${locale}/admin/members/new`}
            className="flex items-center gap-2 bg-blue-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 transition-colors"
          >
            <Plus className="w-4 h-4" />{t("addMember")}
          </Link>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Users}
          iconBg="bg-blue-500"
          label="Total Members"
          value={counts.total}
          sub="All time"
        />
        <StatCard
          icon={TrendingUp}
          iconBg="bg-emerald-500"
          label="New This Month"
          value={counts.newThisMonth}
          sub="This month"
          subColor="text-emerald-600"
        />
        <StatCard
          icon={UserCheck}
          iconBg="bg-violet-500"
          label="Active Members"
          value={counts.active}
          sub={`${counts.total > 0 ? Math.round((counts.active / counts.total) * 100) : 0}% of total`}
        />
        <StatCard
          icon={UserPlus}
          iconBg={counts.pending > 0 ? "bg-amber-500" : "bg-gray-400"}
          label="Pending Approval"
          value={counts.pending}
          sub={counts.pending > 0 ? "Needs review" : "All clear"}
          subColor={counts.pending > 0 ? "text-amber-600" : "text-gray-400"}
        />
      </div>

      {/* Search + Filter tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder={`${tc("search")} ${t("title").toLowerCase()}...`}
            autoComplete="off"
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-1 border-b border-gray-100 pb-1">
          {(["all", "active", "pending"] as FilterStatus[]).map((tab) => {
            const label    = tab === "all" ? "All" : tab === "active" ? "Active" : "Pending Approval";
            const count    = tab === "all" ? counts.total : tab === "active" ? counts.active : counts.pending;
            const isActive = filterStatus === tab;
            return (
              <button
                key={tab}
                onClick={() => setFilterStatus(tab)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? tab === "pending" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"
                    : "text-gray-500 hover:bg-gray-100"
                }`}
              >
                {tab === "pending" && <Clock className="w-3.5 h-3.5" />}
                {tab === "active"  && <UserCheck className="w-3.5 h-3.5" />}
                {label}
                <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-xs font-semibold ${
                  isActive
                    ? tab === "pending" ? "bg-amber-200 text-amber-900" : "bg-blue-200 text-blue-900"
                    : "bg-gray-100 text-gray-500"
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 bg-gray-950 border border-white/10 px-5 py-3 rounded-2xl shadow-2xl">
          <CheckSquare className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-semibold text-white">{selected.size} selected</span>
          <div className="h-4 w-px bg-white/20" />
          <button onClick={handleBulkPrint} className="flex items-center gap-1.5 text-sm font-semibold text-white hover:text-blue-300 transition-colors">
            <Printer className="w-3.5 h-3.5 text-blue-400" /> Cards
          </button>
          <div className="h-4 w-px bg-white/20" />
          <button onClick={() => handleBulkExport("xlsx")} className="text-sm font-semibold text-white hover:text-sky-300 transition-colors">Excel</button>
          <button onClick={() => handleBulkExport("csv")}  className="text-sm font-semibold text-white hover:text-sky-300 transition-colors">CSV</button>
          <div className="h-4 w-px bg-white/20" />
          <AddToBasketButton
            basketType="MEMBER"
            selectedIds={[...selected]}
            entityField="memberIds"
            onAdded={() => setSelected(new Set())}
          />
          <div className="h-4 w-px bg-white/20" />
          <button onClick={handleBulkDelete} className="text-sm font-semibold text-red-400 hover:text-red-300 transition-colors">{tc("delete")}</button>
          <button onClick={() => setSelected(new Set())} className="ml-1 p-1 text-white/50 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Table + Side panel */}
      <div className="flex gap-4 items-start min-w-0">

        {/* Table card */}
        <div className={`bg-white rounded-xl shadow-sm border border-gray-100 min-w-0 transition-all ${selectedMemberId ? "flex-1" : "w-full"}`}>
          {loading ? (
            <div className="p-8 text-center text-gray-400 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />{tc("loading")}
            </div>
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
                      <input type="checkbox"
                        checked={selected.size === members.length && members.length > 0}
                        onChange={toggleAll}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                    </th>
                    <th className="px-4 py-3 text-left">{t("memberName")}</th>
                    <th className="px-4 py-3 text-left">{t("memberId")}</th>
                    {!selectedMemberId && <th className="px-4 py-3 text-left">{t("memberType")}</th>}
                    {!selectedMemberId && <th className="px-4 py-3 text-left">{t("phone")}</th>}
                    <th className="px-4 py-3 text-left">Loans</th>
                    {!selectedMemberId && <th className="px-4 py-3 text-left">Portal / Telegram</th>}
                    <th className="px-4 py-3 text-left">{tc("status")}</th>
                    <th className="px-4 py-3 text-left">{tc("actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {members.map((m) => (
                    <tr
                      key={m.id}
                      onClick={() => handleRowClick(m)}
                      className={`cursor-pointer transition-colors ${
                        selectedMemberId === m.id
                          ? "bg-blue-50 hover:bg-blue-100"
                          : selected.has(m.id)
                          ? "bg-blue-50/60"
                          : "hover:bg-gray-50"
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="pl-4 pr-2 py-3" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggleSelect(m.id)}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                      </td>

                      {/* Name with avatar */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${avatarBg(m.name)}`}>
                            <span className="text-white text-xs font-bold">{initials(m.name)}</span>
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 text-sm truncate">{m.name}</p>
                            {m.email && <p className="text-xs text-gray-400 truncate">{m.email}</p>}
                          </div>
                        </div>
                      </td>

                      {/* Member ID */}
                      <td className="px-4 py-3 text-sm font-mono text-gray-500">{m.memberId}</td>

                      {/* Type (hidden when panel open) */}
                      {!selectedMemberId && (
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${typeColors[m.memberType]}`}>
                            {typeLabels[m.memberType]}
                          </span>
                        </td>
                      )}

                      {/* Phone (hidden when panel open) */}
                      {!selectedMemberId && (
                        <td className="px-4 py-3">
                          {m.phone ? (
                            <div className="flex items-center gap-1.5">
                              {phoneClickAction !== "telegram" && phoneClickAction !== "disabled" ? (
                                <a
                                  href={`tel:${m.phone}`}
                                  className="text-sm text-gray-600 hover:text-blue-600 transition-colors"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {m.phone}
                                </a>
                              ) : (
                                <span className="text-sm text-gray-600">{m.phone}</span>
                              )}
                              {(phoneClickAction === "both" || phoneClickAction === "telegram") && (
                                <a
                                  href={phoneToTelegramUrl(m.phone)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title={m.telegramChatId ? "Open Telegram (linked)" : "Open Telegram"}
                                  onClick={(e) => e.stopPropagation()}
                                  className={`flex-shrink-0 transition-colors ${
                                    m.telegramChatId
                                      ? "text-sky-500 hover:text-sky-700"
                                      : "text-gray-300 hover:text-sky-400"
                                  }`}
                                >
                                  <Send className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                          ) : (
                            <span className="text-sm text-gray-400">—</span>
                          )}
                        </td>
                      )}

                      {/* Loans */}
                      <td className="px-4 py-3">
                        <span className={`text-sm font-medium inline-flex items-center gap-1 ${m.hasOverdue ? "text-red-600" : "text-gray-600"}`}>
                          {m._count.loans}
                          {m.hasOverdue && <AlertTriangle className="w-3 h-3 text-red-400" />}
                        </span>
                      </td>

                      {/* Portal + Telegram (hidden when panel open) */}
                      {!selectedMemberId && (
                        <td className="px-4 py-3 space-y-1">
                          {m.userId
                            ? <span className="flex items-center gap-1 text-green-600 text-xs"><CheckCircle className="w-3.5 h-3.5" />Portal</span>
                            : <span className="flex items-center gap-1 text-gray-400 text-xs"><XCircle className="w-3.5 h-3.5" />No portal</span>}
                          {m.telegramChatId
                            ? <span className="flex items-center gap-1 text-sky-600 text-xs font-medium"><Send className="w-3 h-3" />Telegram</span>
                            : <span className="flex items-center gap-1 text-gray-300 text-xs"><Send className="w-3 h-3" />—</span>}
                        </td>
                      )}

                      {/* Status */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          {m.isActive
                            ? <span className="flex items-center gap-1 text-green-600 text-xs font-medium"><CheckCircle className="w-3.5 h-3.5" />{tc("active")}</span>
                            : m.pendingApproval
                              ? <span className="flex items-center gap-1 text-amber-600 text-xs font-medium"><Clock className="w-3.5 h-3.5" />Pending</span>
                              : <span className="flex items-center gap-1 text-red-500 text-xs"><XCircle className="w-3.5 h-3.5" />{tc("inactive")}</span>}
                          {m.restrictionStatus && m.restrictionStatus !== "NONE" && RESTRICTION_BADGE[m.restrictionStatus] && (
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${RESTRICTION_BADGE[m.restrictionStatus].color}`}>
                              {RESTRICTION_BADGE[m.restrictionStatus].label}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-0.5">
                          {m.pendingApproval && (
                            <button
                              onClick={() => handleApprove(m.id)}
                              disabled={approvingId === m.id}
                              title="Approve"
                              className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg transition-colors disabled:opacity-50 mr-1"
                            >
                              {approvingId === m.id
                                ? <span className="w-3 h-3 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin inline-block" />
                                : <UserCheck className="w-3 h-3" />}
                              Approve
                            </button>
                          )}
                          <button onClick={() => handlePrintCard(m)} title="Print card"
                            className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors">
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => openPortal(m)} title="Portal access"
                            className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors">
                            <KeyRound className="w-3.5 h-3.5" />
                          </button>
                          <Link href={`/${locale}/admin/members/${m.id}`}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                            <Edit className="w-3.5 h-3.5" />
                          </Link>
                          <button onClick={() => handleDelete(m.id)}
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
          )}

          {/* Pagination bar */}
          {!loading && totalCount > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-t border-gray-100 bg-gray-50/50">
              <div className="flex items-center gap-3 text-sm text-gray-500">
                <span>Showing {startRow}–{endRow} of {totalCount} members</span>
                <select
                  value={limit}
                  onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
                  className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                >
                  {[10, 25, 50, 100].map((n) => (
                    <option key={n} value={n}>{n} / page</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1">
                <button
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {getPageNums(page, totalPages).map((n, i) =>
                  n === "…" ? (
                    <span key={`ellipsis-${i}`} className="px-1.5 text-gray-400 text-sm">…</span>
                  ) : (
                    <button
                      key={n}
                      onClick={() => setPage(n as number)}
                      className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                        n === page
                          ? "bg-blue-900 text-white"
                          : "text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      {n}
                    </button>
                  )
                )}
                <button
                  disabled={page === totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Side detail panel ─────────────────────────────────────────────── */}
        {selectedMemberId && (
          <div className="w-80 flex-shrink-0 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">

            {/* Panel header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700">Member Details</h3>
              <button
                onClick={() => { setSelectedMemberId(null); setMemberDetail(null); }}
                className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {detailLoading ? (
              <div className="p-10 flex items-center justify-center text-gray-400">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : memberDetail ? (
              <div className="p-4 space-y-4 overflow-y-auto max-h-[calc(100vh-260px)]">

                {/* Avatar + name */}
                <div className="flex flex-col items-center text-center gap-2 pb-4 border-b border-gray-100">
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${avatarBg(memberDetail.name)}`}>
                    <span className="text-white text-2xl font-bold">{initials(memberDetail.name)}</span>
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 text-base leading-tight">{memberDetail.name}</p>
                    <div className="flex items-center justify-center gap-1.5 mt-1.5 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeColors[memberDetail.memberType]}`}>
                        {typeLabels[memberDetail.memberType]}
                      </span>
                      {memberDetail.isActive
                        ? <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-50 text-green-700">Active</span>
                        : memberDetail.pendingApproval
                          ? <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-50 text-amber-700">Pending</span>
                          : <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-50 text-red-600">Inactive</span>}
                    </div>
                  </div>
                </div>

                {/* Info list */}
                <div className="space-y-2">
                  <div>
                    <span className="font-mono text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                      {memberDetail.memberId}
                    </span>
                  </div>
                  {memberDetail.email && (
                    <div className="flex items-start gap-2 text-gray-600">
                      <Mail className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-gray-400" />
                      <span className="text-xs break-all">{memberDetail.email}</span>
                    </div>
                  )}
                  {memberDetail.phone && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <Phone className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
                      {phoneClickAction !== "telegram" && phoneClickAction !== "disabled" ? (
                        <a
                          href={`tel:${memberDetail.phone}`}
                          className="text-xs hover:text-blue-600 transition-colors"
                        >
                          {memberDetail.phone}
                        </a>
                      ) : (
                        <span className="text-xs">{memberDetail.phone}</span>
                      )}
                      {(phoneClickAction === "both" || phoneClickAction === "telegram") && (
                        <a
                          href={phoneToTelegramUrl(memberDetail.phone)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={memberDetail.telegramChatId ? "Open Telegram (linked)" : "Open in Telegram"}
                          className={`flex-shrink-0 transition-colors ${
                            memberDetail.telegramChatId
                              ? "text-sky-500 hover:text-sky-700"
                              : "text-gray-300 hover:text-sky-400"
                          }`}
                        >
                          <Send className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-gray-500">
                    <Calendar className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
                    <span className="text-xs">
                      Joined {new Date(memberDetail.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  {memberDetail.address && (
                    <div className="flex items-start gap-2 text-gray-600">
                      <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-gray-400" />
                      <span className="text-xs">{memberDetail.address}</span>
                    </div>
                  )}
                </div>

                {/* Summary grid */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-blue-50 rounded-xl p-3 text-center">
                    <BookOpen className="w-4 h-4 text-blue-500 mx-auto mb-1" />
                    <p className="text-2xl font-bold text-blue-900">{booksBorrowed}</p>
                    <p className="text-[10px] text-blue-600 font-semibold uppercase tracking-wide mt-0.5">Borrowed</p>
                  </div>
                  <div className={`${booksOverdue > 0 ? "bg-red-50" : "bg-gray-50"} rounded-xl p-3 text-center`}>
                    <AlertTriangle className={`w-4 h-4 mx-auto mb-1 ${booksOverdue > 0 ? "text-red-500" : "text-gray-400"}`} />
                    <p className={`text-2xl font-bold ${booksOverdue > 0 ? "text-red-700" : "text-gray-700"}`}>{booksOverdue}</p>
                    <p className={`text-[10px] font-semibold uppercase tracking-wide mt-0.5 ${booksOverdue > 0 ? "text-red-500" : "text-gray-400"}`}>Overdue</p>
                  </div>
                  <div className={`${unpaidFines > 0 ? "bg-orange-50" : "bg-gray-50"} rounded-xl p-3 text-center`}>
                    <DollarSign className={`w-4 h-4 mx-auto mb-1 ${unpaidFines > 0 ? "text-orange-500" : "text-gray-400"}`} />
                    <p className={`text-2xl font-bold ${unpaidFines > 0 ? "text-orange-700" : "text-gray-700"}`}>
                      ${unpaidFines.toFixed(2)}
                    </p>
                    <p className={`text-[10px] font-semibold uppercase tracking-wide mt-0.5 ${unpaidFines > 0 ? "text-orange-500" : "text-gray-400"}`}>Fines</p>
                  </div>
                  <div className="bg-violet-50 rounded-xl p-3 text-center">
                    <Bookmark className="w-4 h-4 text-violet-500 mx-auto mb-1" />
                    <p className="text-2xl font-bold text-violet-900">{reservCount}</p>
                    <p className="text-[10px] text-violet-600 font-semibold uppercase tracking-wide mt-0.5">Reserved</p>
                  </div>
                </div>

                {/* Panel actions */}
                <div className="space-y-2 pt-1">
                  {memberDetail.pendingApproval && (
                    <button
                      onClick={() => handleApprove(memberDetail.id)}
                      disabled={approvingId === memberDetail.id}
                      className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                    >
                      {approvingId === memberDetail.id
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <UserCheck className="w-4 h-4" />}
                      Approve Membership
                    </button>
                  )}
                  <Link
                    href={`/${locale}/admin/members/${memberDetail.id}`}
                    className="w-full flex items-center justify-center gap-2 py-2 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
                  >
                    <Edit className="w-3.5 h-3.5" /> View Full Profile →
                  </Link>
                </div>

              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* ── Import modal ──────────────────────────────────────────────────── */}
      {importing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          onClick={() => setImporting(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">Import Members</h2>
              <button onClick={() => setImporting(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            {!importResult ? (
              <div className="space-y-4">
                <p className="text-sm text-gray-500">
                  Upload an Excel (.xlsx) or CSV file. Columns: Name, Email, Phone, Address, Type (STUDENT/TEACHER/STAFF/PUBLIC), ExpireDate
                </p>
                <a href="/api/members/import" className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
                  <Download className="w-4 h-4" /> Download template
                </a>
                <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center">
                  <input type="file" accept=".xlsx,.csv"
                    onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                    className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
                </div>
                <button onClick={handleImport} disabled={!importFile || importLoading}
                  className="w-full flex items-center justify-center gap-2 bg-blue-900 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  {importLoading ? <><Loader2 className="w-4 h-4 animate-spin" />Importing…</> : "Import"}
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

      {/* ── Portal access modal ───────────────────────────────────────────── */}
      {portalMember && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          onClick={() => setPortalMember(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-amber-500" />
                <h2 className="font-bold text-gray-900">Portal Access</h2>
              </div>
              <button onClick={() => setPortalMember(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
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
