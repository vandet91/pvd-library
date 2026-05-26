"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  Inbox, Search, CheckCircle2, XCircle, PackageCheck, Clock,
  Loader2, Trash2, BookOpen, User,
} from "lucide-react";

/* ── types ── */
interface BookRequest {
  id:        string;
  title:     string;
  author:    string | null;
  isbn:      string | null;
  notes:     string | null;
  status:    "PENDING" | "APPROVED" | "REJECTED" | "FULFILLED";
  adminNote: string | null;
  createdAt: string;
  member:    { name: string; memberId: string };
}

/* ── constants (defined before components that reference them) ── */
const STATUSES = ["PENDING", "APPROVED", "REJECTED", "FULFILLED"] as const;

/**
 * Legal status transitions:
 *   PENDING  → APPROVED (accept) or REJECTED (decline)
 *   APPROVED → FULFILLED (acquired) or REJECTED (acquisition fell through)
 *   REJECTED / FULFILLED → terminal, no further transitions
 */
const TRANSITIONS: Record<string, { to: string; tKey: string; color: string }[]> = {
  PENDING: [
    { to: "APPROVED", tKey: "actionApprove", color: "bg-green-50 text-green-700 hover:bg-green-100 border border-green-200" },
    { to: "REJECTED", tKey: "actionReject",  color: "bg-red-50   text-red-600   hover:bg-red-100   border border-red-200"   },
  ],
  APPROVED: [
    { to: "FULFILLED", tKey: "actionFulfill", color: "bg-blue-50  text-blue-700  hover:bg-blue-100  border border-blue-200"  },
    { to: "REJECTED",  tKey: "actionReject",  color: "bg-red-50   text-red-600   hover:bg-red-100   border border-red-200"   },
  ],
  REJECTED:  [],
  FULFILLED: [],
};

const statusStyle: Record<string, string> = {
  PENDING:   "bg-amber-100 text-amber-700",
  APPROVED:  "bg-blue-100 text-blue-700",
  REJECTED:  "bg-red-100 text-red-700",
  FULFILLED: "bg-green-100 text-green-700",
};

const statusIcon: Record<string, React.ReactNode> = {
  PENDING:   <Clock        className="w-3.5 h-3.5" />,
  APPROVED:  <CheckCircle2 className="w-3.5 h-3.5" />,
  REJECTED:  <XCircle      className="w-3.5 h-3.5" />,
  FULFILLED: <PackageCheck className="w-3.5 h-3.5" />,
};

/* ── main page ── */
export default function BookRequestsPage() {
  const t  = useTranslations("requests");
  const tc = useTranslations("common");
  const [requests,  setRequests]  = useState<BookRequest[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [filter,    setFilter]    = useState("PENDING");
  const [q,         setQ]         = useState("");
  const [busy,      setBusy]      = useState<string | null>(null);
  const [toast,     setToast]     = useState<{ msg: string; ok: boolean } | null>(null);

  /* confirming state: which row + which target status */
  const [confirming, setConfirming] = useState<{ id: string; to: string } | null>(null);
  const [noteInput,  setNoteInput]  = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter) params.set("status", filter);
    const res = await fetch(`/api/book-requests?${params}`);
    if (res.ok) setRequests(await res.json());
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  async function updateStatus(id: string, status: string, note: string) {
    setBusy(id);
    setConfirming(null);
    const res = await fetch(`/api/book-requests/${id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ status, adminNote: note || undefined }),
    });
    if (res.ok) {
      const statusLabels: Record<string, string> = {
        PENDING: t("statusPending"), APPROVED: t("statusApproved"),
        REJECTED: t("statusRejected"), FULFILLED: t("statusFulfilled"),
      };
      showToast(t("toastMarkedAs", { status: statusLabels[status] ?? status }));
      load();
      window.dispatchEvent(new CustomEvent("alertsChanged"));
    } else {
      const data = await res.json().catch(() => ({}));
      showToast(data.error ?? t("toastUpdateFailed"), false);
    }
    setBusy(null);
    setNoteInput("");
  }

  async function doDelete(id: string) {
    if (!confirm(t("confirmDeleteAdmin"))) return;
    setBusy(id);
    const res = await fetch(`/api/book-requests/${id}`, { method: "DELETE" });
    if (res.ok) {
      showToast(t("toastDeleted"));
      load();
      window.dispatchEvent(new CustomEvent("alertsChanged"));
    } else {
      showToast(t("toastDeleteFailed"), false);
    }
    setBusy(null);
  }

  const filtered = requests.filter((r) =>
    !q ||
    r.title.toLowerCase().includes(q.toLowerCase()) ||
    r.member.name.toLowerCase().includes(q.toLowerCase()) ||
    (r.author?.toLowerCase().includes(q.toLowerCase()) ?? false),
  );

  return (
    <div className="space-y-6">
      {/* ── header ── */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-pink-50">
          <Inbox className="w-5 h-5 text-pink-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("adminTitle")}</h1>
          <p className="text-sm text-gray-500">{t("adminSubtitle")}</p>
        </div>
      </div>

      {/* ── filters ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1 flex-wrap">
          {["ALL", ...STATUSES].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s === "ALL" ? "" : s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                (s === "ALL" ? filter === "" : filter === s)
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {s === "ALL" ? t("filterAll") : t(`status${s.charAt(0) + s.slice(1).toLowerCase()}` as "statusPending" | "statusApproved" | "statusRejected" | "statusFulfilled")}
            </button>
          ))}
        </div>

        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder={t("adminSearch")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-gray-200
                       focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* ── list ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin mr-2" /> {tc("loading")}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-gray-400">
            <BookOpen className="w-10 h-10 opacity-30" />
            <p className="text-sm">{t("noRequests")}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/70">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{t("colBook")}</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">{t("colMember")}</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">{t("colDate")}</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{tc("status")}</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{tc("actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((req) => {
                const transitions = TRANSITIONS[req.status] ?? [];
                const isConfirming = confirming?.id === req.id;

                return (
                  <tr key={req.id} className="hover:bg-gray-50/50 transition-colors">
                    {/* book info */}
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-gray-900">{req.title}</p>
                      {req.author && <p className="text-xs text-gray-500 mt-0.5">{req.author}</p>}
                      {req.isbn   && <p className="text-xs text-gray-400 font-mono">{req.isbn}</p>}
                      {req.notes  && <p className="text-xs text-gray-400 italic mt-0.5 truncate max-w-xs">{req.notes}</p>}
                    </td>

                    {/* member */}
                    <td className="px-5 py-3.5 hidden md:table-cell">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                          <User className="w-3.5 h-3.5 text-indigo-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-800">{req.member.name}</p>
                          <p className="text-xs text-gray-400 font-mono">{req.member.memberId}</p>
                        </div>
                      </div>
                    </td>

                    {/* date */}
                    <td className="px-5 py-3.5 hidden lg:table-cell text-xs text-gray-500">
                      {new Date(req.createdAt).toLocaleDateString()}
                    </td>

                    {/* status */}
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${statusStyle[req.status]}`}>
                        {statusIcon[req.status]}
                        {t(`status${req.status.charAt(0) + req.status.slice(1).toLowerCase()}` as "statusPending" | "statusApproved" | "statusRejected" | "statusFulfilled")}
                      </span>
                      {req.adminNote && (
                        <p className="text-xs text-gray-400 italic mt-1 max-w-[160px] truncate">{req.adminNote}</p>
                      )}
                    </td>

                    {/* actions */}
                    <td className="px-5 py-3.5">
                      <div className="flex flex-col items-end gap-1.5">
                        {busy === req.id ? (
                          <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />

                        ) : isConfirming ? (
                          /* ── note + confirm ── */
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              placeholder={t("notePlaceholder")}
                              value={noteInput}
                              onChange={(e) => setNoteInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") updateStatus(confirming.id, confirming.to, noteInput);
                                if (e.key === "Escape") { setConfirming(null); setNoteInput(""); }
                              }}
                              className="text-xs border border-gray-200 rounded px-2 py-1 w-28 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                              autoFocus
                            />
                            <button
                              onClick={() => updateStatus(confirming.id, confirming.to, noteInput)}
                              className="text-xs px-2 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                            >
                              OK
                            </button>
                            <button
                              onClick={() => { setConfirming(null); setNoteInput(""); }}
                              className="text-xs px-2 py-1 bg-gray-100 rounded hover:bg-gray-200"
                            >
                              ✕
                            </button>
                          </div>

                        ) : (
                          /* ── action buttons ── */
                          <div className="flex items-center gap-1 flex-wrap justify-end">
                            {transitions.map(({ to, tKey, color }) => (
                              <button
                                key={to}
                                onClick={() => { setConfirming({ id: req.id, to }); setNoteInput(req.adminNote ?? ""); }}
                                className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${color}`}
                              >
                                {t(tKey as "actionApprove" | "actionReject" | "actionFulfill")}
                              </button>
                            ))}
                            {/* Delete — not available while mid-process (APPROVED) */}
                            {req.status !== "APPROVED" && (
                              <button
                                onClick={() => doDelete(req.id)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── toast ── */}
      {toast && (
        <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-xl shadow-lg text-sm font-medium z-50
          ${toast.ok ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
