"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Bell, Mail, Play, Send, RefreshCw, CheckCircle2, AlertCircle, Clock,
  ChevronRight, Loader2, Inbox, Activity, AlertTriangle,
} from "lucide-react";

interface Notification {
  id:            string;
  type:          "DUE_SOON" | "OVERDUE" | "RESERVATION_READY" | "TEST";
  recipient:     string;
  subject:       string;
  status:        "PENDING" | "SENT" | "FAILED" | "SKIPPED";
  error:         string | null;
  sentAt:        string | null;
  createdAt:     string;
  memberId:      string;
  loanId:        string | null;
  reservationId: string | null;
}

interface ApiResponse {
  notifications: Notification[];
  summary:       { totalSent: number; totalFailed: number; last24h: number };
}

// tKey-based metas — label is looked up via t(labelKey) at render time
const TYPE_META: Record<Notification["type"], { labelKey: string; cls: string; icon: typeof Bell }> = {
  DUE_SOON:          { labelKey: "typeDueSoon",          cls: "bg-amber-50  text-amber-700",    icon: Clock },
  OVERDUE:           { labelKey: "typeOverdue",           cls: "bg-red-50    text-red-700",      icon: AlertTriangle },
  RESERVATION_READY: { labelKey: "typeReservationReady", cls: "bg-emerald-50 text-emerald-700", icon: CheckCircle2 },
  TEST:              { labelKey: "typeTest",              cls: "bg-blue-50   text-blue-700",     icon: Mail },
};

const STATUS_META: Record<Notification["status"], { labelKey: string; cls: string }> = {
  PENDING: { labelKey: "statusPending", cls: "bg-gray-100  text-gray-600"   },
  SENT:    { labelKey: "statusSent",    cls: "bg-green-50  text-green-700"  },
  FAILED:  { labelKey: "statusFailed",  cls: "bg-red-50    text-red-600"    },
  SKIPPED: { labelKey: "statusSkipped", cls: "bg-slate-100 text-slate-500"  },
};

export default function NotificationsAdminPage() {
  const t = useTranslations("notifications");

  const [data,        setData]        = useState<ApiResponse | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [filterType,  setFilterType]  = useState<string>("");
  const [filterStat,  setFilterStat]  = useState<string>("");

  const [testEmail,   setTestEmail]   = useState("");
  const [testBusy,    setTestBusy]    = useState(false);
  const [testMsg,     setTestMsg]     = useState<{ ok: boolean; text: string } | null>(null);

  const [runBusy,     setRunBusy]     = useState(false);
  const [runMsg,      setRunMsg]      = useState<{ ok: boolean; text: string } | null>(null);

  async function fetchData() {
    setLoading(true);
    const qs = new URLSearchParams();
    if (filterType) qs.set("type", filterType);
    if (filterStat) qs.set("status", filterStat);
    const res = await fetch(`/api/admin/notifications?${qs.toString()}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }

  useEffect(() => { fetchData(); }, [filterType, filterStat]); // eslint-disable-line

  async function sendTest() {
    setTestBusy(true); setTestMsg(null);
    const res = await fetch("/api/admin/notifications/test", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ to: testEmail || undefined }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setTestMsg({ ok: true, text: t("testSentTo", { recipient: data.recipient }) });
    } else {
      setTestMsg({ ok: false, text: data.error ?? t("sendFailed") });
    }
    setTestBusy(false);
  }

  async function runNow() {
    setRunBusy(true); setRunMsg(null);
    const res = await fetch("/api/cron/notifications", { method: "POST" });
    const d   = await res.json().catch(() => ({}));
    if (!res.ok) {
      setRunMsg({ ok: false, text: d.error ?? t("sendFailed") });
    } else if (d.disabled) {
      setRunMsg({ ok: false, text: t("notificationsDisabled") });
    } else {
      const total = (d.dueSoon?.sent ?? 0) + (d.overdue?.sent ?? 0) + (d.reservationReady?.sent ?? 0);
      setRunMsg({
        ok: true,
        text: t("runResult", {
          total,
          dueSoon:      d.dueSoon?.sent      ?? 0,
          overdue:      d.overdue?.sent      ?? 0,
          reservations: d.reservationReady?.sent ?? 0,
        }),
      });
    }
    setRunBusy(false);
    fetchData(); // refresh log
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Bell className="w-6 h-6 text-blue-600" /> {t("title")}
          </h1>
          <p className="text-sm text-gray-500 mt-1">{t("subtitle")}</p>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard icon={CheckCircle2} label={t("totalSent")}   value={data?.summary.totalSent   ?? 0} color="green"  />
        <StatCard icon={AlertCircle}  label={t("totalFailed")} value={data?.summary.totalFailed ?? 0} color="red"    />
        <StatCard icon={Activity}     label={t("last24h")}     value={data?.summary.last24h     ?? 0} color="blue"   />
      </div>

      {/* Test email + Manual run */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Send test */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <Mail className="w-4 h-4 text-blue-600" />
            <h2 className="font-semibold text-gray-900 text-sm">{t("sendTestTitle")}</h2>
          </div>
          <p className="text-xs text-gray-500 mb-3">{t("sendTestDesc")}</p>
          <div className="flex gap-2">
            <input type="email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)}
              placeholder={t("testPlaceholder")}
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
            <button onClick={sendTest} disabled={testBusy}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {testBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {t("send")}
            </button>
          </div>
          {testMsg && (
            <p className={`mt-3 text-xs px-3 py-2 rounded-lg ${testMsg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>{testMsg.text}</p>
          )}
        </div>

        {/* Run now */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <Play className="w-4 h-4 text-indigo-600" />
            <h2 className="font-semibold text-gray-900 text-sm">{t("runNowTitle")}</h2>
          </div>
          <p className="text-xs text-gray-500 mb-3">{t("runNowDesc")}</p>
          <button onClick={runNow} disabled={runBusy}
            className="w-full flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            {runBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {t("runNow")}
          </button>
          {runMsg && (
            <p className={`mt-3 text-xs px-3 py-2 rounded-lg ${runMsg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>{runMsg.text}</p>
          )}
        </div>
      </div>

      {/* Filters + Log */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Inbox className="w-4 h-4 text-gray-400" />
            <h2 className="font-semibold text-gray-900 text-sm">{t("recentActivity")}</h2>
          </div>
          <div className="flex items-center gap-2">
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5">
              <option value="">{t("filterAllTypes")}</option>
              <option value="DUE_SOON">{t("filterDueSoon")}</option>
              <option value="OVERDUE">{t("filterOverdue")}</option>
              <option value="RESERVATION_READY">{t("filterReservationReady")}</option>
              <option value="TEST">{t("filterTest")}</option>
            </select>
            <select value={filterStat} onChange={(e) => setFilterStat(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5">
              <option value="">{t("filterAllStatuses")}</option>
              <option value="SENT">{t("filterSent")}</option>
              <option value="FAILED">{t("filterFailed")}</option>
              <option value="SKIPPED">{t("filterSkipped")}</option>
            </select>
            <button onClick={fetchData} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-50">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="px-5 py-12 text-center text-gray-400 text-sm">{t("loading")}</div>
        ) : !data || data.notifications.length === 0 ? (
          <div className="px-5 py-12 text-center text-gray-400 text-sm">
            {t("noNotifications")}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {data.notifications.map((n) => {
              const TypeIcon = TYPE_META[n.type].icon;
              return (
                <div key={n.id} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50 text-sm">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${TYPE_META[n.type].cls}`}>
                    <TypeIcon className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-xs truncate">{n.subject}</p>
                    <p className="text-[11px] text-gray-400 truncate">{n.recipient}</p>
                    {n.error && <p className="text-[11px] text-red-500 mt-0.5 truncate">⚠ {n.error}</p>}
                  </div>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${STATUS_META[n.status].cls}`}>
                    {t(STATUS_META[n.status].labelKey as Parameters<typeof t>[0])}
                  </span>
                  <span className="text-[11px] text-gray-400 flex-shrink-0 w-32 text-right">
                    {new Date(n.sentAt ?? n.createdAt).toLocaleString()}
                  </span>
                  <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: {
  icon: typeof Bell; label: string; value: number; color: "green" | "red" | "blue";
}) {
  const cls = {
    green: "bg-green-50 text-green-700",
    red:   "bg-red-50   text-red-600",
    blue:  "bg-blue-50  text-blue-700",
  }[color];
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${cls}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );
}
