"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  Activity, Search, Filter, Trash2, ChevronLeft, ChevronRight,
  ChevronDown, ChevronUp, RefreshCw,
  UserCheck, BookOpen, ArrowLeftRight, DollarSign, Settings,
  UserPlus, Loader2, AlertTriangle,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LogEntry {
  id:          string;
  action:      string;
  entityType:  string;
  entityId:    string | null;
  entityName:  string | null;
  actorId:     string | null;
  actorName:   string | null;
  actorRole:   string | null;
  detail:      Record<string, unknown> | null;
  ip:          string | null;
  createdAt:   string;
}

// ─── Static mappings (action → colors) ───────────────────────────────────────

const ACTION_COLORS: Record<string, { color: string; bg: string; labelKey: string }> = {
  "member.created":        { color: "text-emerald-700", bg: "bg-emerald-50", labelKey: "memberCreated" },
  "member.self_registered":{ color: "text-teal-700",    bg: "bg-teal-50",    labelKey: "memberSelfRegistered" },
  "member.approved":       { color: "text-green-700",   bg: "bg-green-50",   labelKey: "memberApproved" },
  "member.updated":        { color: "text-blue-700",    bg: "bg-blue-50",    labelKey: "memberUpdated" },
  "member.deactivated":    { color: "text-amber-700",   bg: "bg-amber-50",   labelKey: "memberDeactivated" },
  "member.deleted":        { color: "text-red-700",     bg: "bg-red-50",     labelKey: "memberDeleted" },
  "member.portal_set":     { color: "text-violet-700",  bg: "bg-violet-50",  labelKey: "memberPortalSet" },
  "member.imported":       { color: "text-cyan-700",    bg: "bg-cyan-50",    labelKey: "memberImported" },
  "book.created":          { color: "text-emerald-700", bg: "bg-emerald-50", labelKey: "bookCreated" },
  "book.updated":          { color: "text-blue-700",    bg: "bg-blue-50",    labelKey: "bookUpdated" },
  "book.deleted":          { color: "text-red-700",     bg: "bg-red-50",     labelKey: "bookDeleted" },
  "book.imported":         { color: "text-cyan-700",    bg: "bg-cyan-50",    labelKey: "bookImported" },
  "book.copy_added":       { color: "text-emerald-700", bg: "bg-emerald-50", labelKey: "bookCopyAdded" },
  "book.copy_updated":     { color: "text-blue-700",    bg: "bg-blue-50",    labelKey: "bookCopyUpdated" },
  "book.copy_deleted":     { color: "text-red-700",     bg: "bg-red-50",     labelKey: "bookCopyDeleted" },
  "loan.checkout":         { color: "text-blue-700",    bg: "bg-blue-50",    labelKey: "loanCheckout" },
  "loan.returned":         { color: "text-emerald-700", bg: "bg-emerald-50", labelKey: "loanReturned" },
  "loan.renewed":          { color: "text-violet-700",  bg: "bg-violet-50",  labelKey: "loanRenewed" },
  "loan.lost":             { color: "text-red-700",     bg: "bg-red-50",     labelKey: "loanLost" },
  "fine.paid":             { color: "text-emerald-700", bg: "bg-emerald-50", labelKey: "finePaid" },
  "fine.waived":           { color: "text-amber-700",   bg: "bg-amber-50",   labelKey: "fineWaived" },
  "reservation.created":   { color: "text-blue-700",    bg: "bg-blue-50",    labelKey: "reservationCreated" },
  "reservation.updated":   { color: "text-blue-700",    bg: "bg-blue-50",    labelKey: "reservationUpdated" },
  "reservation.ready":     { color: "text-purple-700",  bg: "bg-purple-50",  labelKey: "reservationReady" },
  "reservation.fulfilled": { color: "text-emerald-700", bg: "bg-emerald-50", labelKey: "reservationFulfilled" },
  "reservation.cancelled": { color: "text-orange-700",  bg: "bg-orange-50",  labelKey: "reservationCancelled" },
  "reservation.expired":   { color: "text-red-700",     bg: "bg-red-50",     labelKey: "reservationExpired" },
  "reservation.deleted":   { color: "text-red-700",     bg: "bg-red-50",     labelKey: "reservationDeleted" },
  "member.restricted":         { color: "text-red-700",    bg: "bg-red-50",     labelKey: "memberRestricted" },
  "member.restriction_lifted": { color: "text-green-700",  bg: "bg-green-50",   labelKey: "memberRestrictionLifted" },
  "member.incident_logged":    { color: "text-orange-700", bg: "bg-orange-50",  labelKey: "memberIncidentLogged" },
  "member.incident_resolved":  { color: "text-teal-700",   bg: "bg-teal-50",    labelKey: "memberIncidentResolved" },
  "auth.login":            { color: "text-green-700",   bg: "bg-green-50",   labelKey: "authLogin" },
  "auth.login_failed":     { color: "text-red-700",     bg: "bg-red-50",     labelKey: "authLoginFailed" },
  "auth.logout":           { color: "text-gray-700",    bg: "bg-gray-100",   labelKey: "authLogout" },
  "settings.updated":      { color: "text-gray-700",    bg: "bg-gray-100",   labelKey: "settingsUpdated" },
  "user.created":          { color: "text-emerald-700", bg: "bg-emerald-50", labelKey: "userCreated" },
  "user.updated":          { color: "text-blue-700",    bg: "bg-blue-50",    labelKey: "userUpdated" },
  "user.deleted":          { color: "text-red-700",     bg: "bg-red-50",     labelKey: "userDeleted" },
};

const ENTITY_TYPE_KEYS = ["Member", "Book", "Loan", "Fine", "Reservation", "Settings", "User"] as const;

const ENTITY_ICONS: Record<string, React.ElementType> = {
  Member:      UserCheck,
  Book:        BookOpen,
  Loan:        ArrowLeftRight,
  Fine:        DollarSign,
  Reservation: BookOpen,
  Settings:    Settings,
  User:        UserPlus,
};

const ROLE_COLORS: Record<string, string> = {
  ADMIN:     "text-indigo-600 bg-indigo-50",
  LIBRARIAN: "text-violet-600 bg-violet-50",
  STAFF:     "text-blue-600   bg-blue-50",
};

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getPageNums(cur: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (cur <= 4)         return [1, 2, 3, 4, 5, "…", total];
  if (cur >= total - 3) return [1, "…", total - 4, total - 3, total - 2, total - 1, total];
  return [1, "…", cur - 1, cur, cur + 1, "…", total];
}

// ─── Detail diff viewer ───────────────────────────────────────────────────────

/** True only for plain objects (not arrays, not strings, not null). */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Format a single JSON leaf value for display. */
function fmtValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (Array.isArray(v)) return v.map((item) => fmtValue(item)).join(", ");
  if (isPlainObject(v)) return JSON.stringify(v);
  return String(v);
}

function DetailKV({ k, v, valClass }: { k: string; v: unknown; valClass: string }) {
  return (
    <div className="flex gap-1 min-w-0">
      <span className="text-gray-500 min-w-[80px] shrink-0">{k}:</span>
      <span className={`font-medium break-all ${valClass}`}>{fmtValue(v)}</span>
    </div>
  );
}

function DetailPanel({ detail, t }: { detail: Record<string, unknown> | null; t: ReturnType<typeof useTranslations<"logs">> }) {
  if (!detail) return <p className="text-xs text-gray-400 italic">{t("noDetail")}</p>;

  // Safely extract before/after — only treat them as objects if they actually are
  const raw = detail as Record<string, unknown>;
  const before = isPlainObject(raw.before) ? raw.before : undefined;
  const after  = isPlainObject(raw.after)  ? raw.after  : undefined;

  // Everything else (including non-object before/after) goes into rest
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k === "before" && before) continue;
    if (k === "after"  && after)  continue;
    rest[k] = v;
  }

  return (
    <div className="space-y-2 text-xs">
      {(before || after) && (
        <div className="grid grid-cols-2 gap-2">
          {before && (
            <div className="bg-red-50 border border-red-100 rounded-lg p-2">
              <p className="font-semibold text-red-700 mb-1">{t("before")}</p>
              {Object.entries(before).map(([k, v]) => (
                <DetailKV key={k} k={k} v={v} valClass="text-red-800" />
              ))}
            </div>
          )}
          {after && (
            <div className="bg-green-50 border border-green-100 rounded-lg p-2">
              <p className="font-semibold text-green-700 mb-1">{t("after")}</p>
              {Object.entries(after).map(([k, v]) => (
                <DetailKV key={k} k={k} v={v} valClass="text-green-800" />
              ))}
            </div>
          )}
        </div>
      )}
      {Object.keys(rest).length > 0 && (
        <div className="bg-gray-50 border border-gray-100 rounded-lg p-2 space-y-0.5">
          {Object.entries(rest).map(([k, v]) => (
            <DetailKV key={k} k={k} v={v} valClass="text-gray-800" />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LogsPage() {
  const t = useTranslations("logs");

  const [logs,       setLogs]       = useState<LogEntry[]>([]);
  const [total,      setTotal]      = useState(0);
  const [loading,    setLoading]    = useState(true);
  const [expanded,   setExpanded]   = useState<string | null>(null);

  // Filters
  const [q,          setQ]          = useState("");
  const [entityType, setEntityType] = useState("");
  const [from,       setFrom]       = useState("");
  const [to,         setTo]         = useState("");

  // Pagination
  const [page,  setPage]  = useState(1);
  const [limit, setLimit] = useState(25);

  // Purge
  const [purging,     setPurging]     = useState(false);
  const [purgeResult, setPurgeResult] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page:  String(page),
      limit: String(limit),
      ...(q          && { q }),
      ...(entityType && { entityType }),
      ...(from       && { from }),
      ...(to         && { to }),
    });
    const res = await fetch(`/api/logs?${params}`);
    if (res.ok) {
      const data = await res.json();
      setLogs(data.logs ?? []);
      setTotal(data.total ?? 0);
    }
    setLoading(false);
  }, [q, entityType, from, to, page, limit]);

  useEffect(() => { setPage(1); }, [q, entityType, from, to]);
  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const startRow   = total === 0 ? 0 : (page - 1) * limit + 1;
  const endRow     = Math.min(page * limit, total);

  async function handlePurge(days?: number) {
    const msg = days
      ? t("purgeConfirm", { days })
      : t("purgeAllConfirm");
    if (!confirm(msg)) return;
    setPurging(true);
    setPurgeResult(null);
    const url = days
      ? `/api/logs?before=${new Date(Date.now() - days * 86400000).toISOString()}`
      : `/api/logs`;
    const res  = await fetch(url, { method: "DELETE" });
    const data = await res.json();
    setPurgeResult(t("purgeResult", { count: data.deleted }));
    setPurging(false);
    fetchLogs();
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-slate-900 rounded-xl flex items-center justify-center">
            <Activity className="w-4.5 h-4.5 text-white w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
            <p className="text-xs text-gray-400">{t("totalEntries", { count: total.toLocaleString() })}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchLogs}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            <RefreshCw className="w-4 h-4" /> {t("refresh")}
          </button>
          <div className="relative group">
            <button
              className="flex items-center gap-1.5 px-3 py-2 border border-red-200 rounded-lg text-sm text-red-600 hover:bg-red-50 transition-colors">
              <Trash2 className="w-4 h-4" /> {t("purge")}
            </button>
            <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 hidden group-hover:block min-w-[200px]">
              <button onClick={() => handlePurge(30)} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                {t("purgeOlderThan30")}
              </button>
              <button onClick={() => handlePurge(90)} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                {t("purgeOlderThan90")}
              </button>
              <button onClick={() => handlePurge()} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 border-t border-gray-100">
                {t("deleteAllLogs")}
              </button>
            </div>
          </div>
        </div>
      </div>

      {purgeResult && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 px-4 py-2.5 rounded-xl text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {purgeResult}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <select value={entityType} onChange={(e) => setEntityType(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white appearance-none">
              <option value="">{t("allTypes")}</option>
              {ENTITY_TYPE_KEYS.map((key) => (
                <option key={key} value={key}>{t(`entityTypes.${key}`)}</option>
              ))}
            </select>
          </div>

          <div>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-10 flex items-center justify-center text-gray-400 gap-2">
            <Loader2 className="w-5 h-5 animate-spin" /> {t("loadingLogs")}
          </div>
        ) : logs.length === 0 ? (
          <div className="p-10 text-center">
            <Activity className="w-10 h-10 text-gray-200 mx-auto mb-2" />
            <p className="text-gray-400">{t("noLogs")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 text-left w-36">{t("dateTime")}</th>
                  <th className="px-4 py-3 text-left w-44">{t("action")}</th>
                  <th className="px-4 py-3 text-left">{t("entity")}</th>
                  <th className="px-4 py-3 text-left w-40">{t("actor")}</th>
                  <th className="px-4 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {logs.map((log) => {
                  const meta = ACTION_COLORS[log.action];
                  const IconComp = ENTITY_ICONS[log.entityType] ?? Activity;
                  const isOpen = expanded === log.id;
                  return (
                    <React.Fragment key={log.id}>
                      <tr
                        className={`hover:bg-gray-50 transition-colors cursor-pointer ${isOpen ? "bg-blue-50/50" : ""}`}
                        onClick={() => setExpanded(isOpen ? null : log.id)}
                      >
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                          {fmtDateTime(log.createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          {meta ? (
                            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${meta.bg} ${meta.color}`}>
                              {t(`actions.${meta.labelKey}`)}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-500 font-mono">{log.action}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                              <IconComp className="w-3.5 h-3.5 text-gray-500" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm text-gray-800 font-medium truncate max-w-[220px]">
                                {log.entityName ?? log.entityId ?? "—"}
                              </p>
                              <p className="text-xs text-gray-400">
                                {ENTITY_TYPE_KEYS.includes(log.entityType as typeof ENTITY_TYPE_KEYS[number])
                                  ? t(`entityTypes.${log.entityType as typeof ENTITY_TYPE_KEYS[number]}`)
                                  : log.entityType}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {log.actorName ? (
                            <div>
                              <p className="text-sm text-gray-800">{log.actorName}</p>
                              {log.actorRole && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${ROLE_COLORS[log.actorRole] ?? "text-gray-600 bg-gray-100"}`}>
                                  {log.actorRole}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400 italic">{t("system")}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-400">
                          {isOpen
                            ? <ChevronUp className="w-4 h-4" />
                            : <ChevronDown className="w-4 h-4" />}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr key={`${log.id}-detail`} className="bg-blue-50/30">
                          <td colSpan={5} className="px-6 pb-4 pt-2">
                            <DetailPanel detail={log.detail} t={t} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!loading && total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-t border-gray-100 bg-gray-50/50">
            <div className="flex items-center gap-3 text-sm text-gray-500">
              <span>{t("showing", { start: startRow, end: endRow, total: total.toLocaleString() })}</span>
              <select value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
                className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white">
                {[25, 50, 100].map((n) => <option key={n} value={n}>{t("perPage", { n })}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1">
              <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              {getPageNums(page, totalPages).map((n, i) =>
                n === "…" ? (
                  <span key={`e${i}`} className="px-1.5 text-gray-400 text-sm">…</span>
                ) : (
                  <button key={n} onClick={() => setPage(n as number)}
                    className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${n === page ? "bg-blue-900 text-white" : "text-gray-600 hover:bg-gray-100"}`}>
                    {n}
                  </button>
                )
              )}
              <button disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
