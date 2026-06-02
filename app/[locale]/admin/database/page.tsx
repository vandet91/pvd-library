"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  DatabaseBackup, ShieldCheck, Wrench, Download,
  CheckCircle2, AlertTriangle, XCircle, Loader2,
  RefreshCw, ChevronDown, ChevronUp, FileSpreadsheet,
  Clock, History, Package, Trash2, RotateCcw, AlertOctagon,
  ShoppingBag, Flame,
} from "lucide-react";

/* ── Types ─────────────────────────────────────────────────────────────── */
interface HealthResult {
  checkedAt: string;
  healthy: boolean;
  counts: Record<string, number>;
  issues: string[];
  unpaidFines: { count: number; total: number };
}

interface CleanupResult {
  dryRun: boolean;
  totalFound: number;
  totalFixed: number;
  results: { label: string; found: number; fixed: number }[];
}

interface BackupResult {
  success: boolean;
  timestamp: string;
  totalRows: number;
  tables: Record<string, number>;
}

interface RestoreResult {
  success: boolean;
  timestamp: string;
  totalRows: number;
}

interface BackupEntry {
  timestamp: string;
  createdAt: string;
  createdBy: string;
  totalRows: number;
  tables: Record<string, number>;
  sizeBytes: number;
}

type Status = "idle" | "loading" | "success" | "error";

/* ── Small helpers ──────────────────────────────────────────────────────── */
function StatusIcon({ status }: { status: Status }) {
  if (status === "loading") return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
  if (status === "success") return <CheckCircle2 className="w-4 h-4 text-green-500" />;
  if (status === "error")   return <XCircle className="w-4 h-4 text-red-500" />;
  return null;
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-6 ${className}`}>
      {children}
    </div>
  );
}

function Btn({
  onClick, disabled, variant = "primary", size = "md", children,
}: {
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
  children: React.ReactNode;
}) {
  const base = "inline-flex items-center gap-2 font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const sz   = size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm";
  const v = {
    primary:   "bg-blue-600 text-white hover:bg-blue-700",
    secondary: "bg-gray-100 text-gray-700 hover:bg-gray-200",
    danger:    "bg-red-600 text-white hover:bg-red-700",
    ghost:     "border border-gray-200 text-gray-600 hover:bg-gray-50",
  }[variant];
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${sz} ${v}`}>
      {children}
    </button>
  );
}

function fmtBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   PAGE
═══════════════════════════════════════════════════════════════════════════ */
export default function DatabasePage() {
  const t = useTranslations("database");

  /* ── Health ── */
  const [healthStatus, setHealthStatus] = useState<Status>("idle");
  const [health, setHealth]             = useState<HealthResult | null>(null);
  const [healthErr, setHealthErr]       = useState("");
  const [showCounts, setShowCounts]     = useState(false);

  /* ── Cleanup ── */
  const [cleanStatus, setCleanStatus]   = useState<Status>("idle");
  const [cleanResult, setCleanResult]   = useState<CleanupResult | null>(null);
  const [cleanErr, setCleanErr]         = useState("");
  const [previewDone, setPreviewDone]   = useState(false);

  /* ── Backup ── */
  const [backupStatus, setBackupStatus] = useState<Status>("idle");
  const [backupResult, setBackupResult] = useState<BackupResult | null>(null);
  const [backupErr, setBackupErr]       = useState("");
  const [backupHistory, setBackupHistory] = useState<BackupEntry[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [dlBusy, setDlBusy]             = useState<string | null>(null);
  const [delBusy, setDelBusy]           = useState<string | null>(null);
  const [delConfirm, setDelConfirm]     = useState<string | null>(null);

  /* ── Restore ── */
  const [restoreConfirm, setRestoreConfirm] = useState<BackupEntry | null>(null);
  const [restoreBusy,    setRestoreBusy]    = useState(false);
  const [restoreResult,  setRestoreResult]  = useState<RestoreResult | null>(null);
  const [restoreErr,     setRestoreErr]     = useState("");

  /* ── Export ── */
  const [exportTable, setExportTable]   = useState("all");
  const [exportStatus, setExportStatus] = useState<Status>("idle");

  /* ── Sale reset ── */
  const [saleResetConfirm, setSaleResetConfirm] = useState(false);
  const [saleResetInput,   setSaleResetInput]   = useState("");
  const [saleResetBusy,    setSaleResetBusy]    = useState(false);
  const [saleResetResult,  setSaleResetResult]  = useState<{ ordersDeleted: number; cartsDeleted: number; copiesReset: number; copiesLeft: number; completedKept: number } | null>(null);
  const [saleResetErr,     setSaleResetErr]     = useState("");

  /* ── Auto-run health check on mount ── */
  useEffect(() => { runHealth(); loadHistory(); }, []); // eslint-disable-line

  /* ── Handlers ─────────────────────────────────────────────────────────── */
  async function runHealth() {
    setHealthStatus("loading"); setHealthErr(""); setHealth(null); setShowCounts(false);
    try {
      const res = await fetch("/api/admin/db/health");
      if (!res.ok) throw new Error(await res.text());
      setHealth(await res.json());
      setHealthStatus("success");
    } catch (e: unknown) {
      setHealthErr(String(e));
      setHealthStatus("error");
    }
  }

  async function runCleanup(dryRun: boolean) {
    setCleanStatus("loading"); setCleanErr(""); setCleanResult(null);
    try {
      const res = await fetch("/api/admin/db/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setCleanResult(data);
      setCleanStatus("success");
      if (dryRun) setPreviewDone(true);
      // Refresh health after applying fixes
      if (!dryRun) runHealth();
    } catch (e: unknown) {
      setCleanErr(String(e));
      setCleanStatus("error");
    }
  }

  async function runBackup() {
    setBackupStatus("loading"); setBackupErr(""); setBackupResult(null);
    try {
      const res = await fetch("/api/admin/db/backup", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      setBackupResult(await res.json());
      setBackupStatus("success");
      loadHistory();
    } catch (e: unknown) {
      setBackupErr(String(e));
      setBackupStatus("error");
    }
  }

  async function loadHistory() {
    try {
      const res = await fetch("/api/admin/db/backup");
      if (res.ok) setBackupHistory(await res.json());
    } catch { /* ignore */ }
    setHistoryLoaded(true);
  }

  async function downloadBackup(timestamp: string, format: "json" | "sql" = "json") {
    setDlBusy(timestamp);
    try {
      const res = await fetch(`/api/admin/db/backup?download=${timestamp}&format=${format}`);
      if (!res.ok) return;
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url; a.download = `backup-${timestamp}.${format}`;
      a.click(); URL.revokeObjectURL(url);
    } finally { setDlBusy(null); }
  }

  async function doRestore(entry: BackupEntry) {
    setRestoreConfirm(null);
    setRestoreBusy(true);
    setRestoreErr("");
    setRestoreResult(null);
    try {
      const res = await fetch("/api/admin/db/restore", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ timestamp: entry.timestamp }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Restore failed");
      setRestoreResult(data);
      loadHistory();
    } catch (e: unknown) {
      setRestoreErr(String(e instanceof Error ? e.message : e));
    } finally {
      setRestoreBusy(false);
    }
  }

  async function deleteBackup(timestamp: string) {
    setDelBusy(timestamp);
    setDelConfirm(null);
    try {
      const res = await fetch(`/api/admin/db/backup?timestamp=${timestamp}`, { method: "DELETE" });
      await res.json().catch(() => {}); // always drain the body
      if (res.ok) {
        setBackupHistory((prev) => prev.filter((b) => b.timestamp !== timestamp));
      }
    } finally { setDelBusy(null); }
  }

  async function runSaleReset() {
    if (saleResetInput !== "RESET SALES") return;
    setSaleResetBusy(true);
    setSaleResetErr("");
    setSaleResetResult(null);
    try {
      const res  = await fetch("/api/admin/db/reset-sales", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Reset failed");
      setSaleResetResult(data);
      setSaleResetConfirm(false);
      setSaleResetInput("");
      runHealth();
    } catch (e: unknown) {
      setSaleResetErr(String(e instanceof Error ? e.message : e));
    } finally {
      setSaleResetBusy(false);
    }
  }

  async function runExport() {
    setExportStatus("loading");
    try {
      const res = await fetch(`/api/admin/db/export?table=${exportTable}`);
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = res.headers.get("Content-Disposition")?.match(/filename="(.+?)"/)?.[1]
                   ?? "export.xlsx";
      a.click(); URL.revokeObjectURL(url);
      setExportStatus("success");
      setTimeout(() => setExportStatus("idle"), 3000);
    } catch {
      setExportStatus("error");
    }
  }

  /* ── Render ──────────────────────────────────────────────────────────────*/
  return (
    <div className="max-w-5xl mx-auto space-y-6">

      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
          <DatabaseBackup className="w-5 h-5 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{t("title")}</h1>
          <p className="text-sm text-gray-500">{t("subtitle")}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ════════════════════ HEALTH CHECK ════════════════════ */}
        <Card>
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                <ShieldCheck className="w-4 h-4 text-green-600" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900 text-sm">{t("healthTitle")}</h2>
                <p className="text-xs text-gray-500">{t("healthDesc")}</p>
              </div>
            </div>
            <StatusIcon status={healthStatus} />
          </div>

          <Btn onClick={runHealth} disabled={healthStatus === "loading"} variant="secondary">
            {healthStatus === "loading"
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t("scanning")}</>
              : <><RefreshCw className="w-3.5 h-3.5" /> {t("rerunCheck")}</>}
          </Btn>

          {healthErr && (
            <p className="mt-3 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{healthErr}</p>
          )}

          {health && (
            <div className="mt-4 space-y-3">
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${
                health.healthy
                  ? "bg-green-50 text-green-700"
                  : "bg-yellow-50 text-yellow-700"
              }`}>
                {health.healthy
                  ? <><CheckCircle2 className="w-4 h-4" /> {t("allChecksPassed")}</>
                  : <><AlertTriangle className="w-4 h-4" /> {t("issuesFound", { count: health.issues.length })}</>}
              </div>

              {health.issues.length > 0 && (
                <ul className="space-y-1">
                  {health.issues.map((issue, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-orange-700 bg-orange-50 rounded-lg px-3 py-1.5">
                      <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                      {issue}
                    </li>
                  ))}
                </ul>
              )}

              {health.unpaidFines.count > 0 && (
                <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                  {t("unpaidFines", { count: health.unpaidFines.count, total: health.unpaidFines.total.toFixed(2) })}
                </div>
              )}

              <button
                onClick={() => setShowCounts((v) => !v)}
                className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
              >
                {showCounts ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {showCounts
                  ? t("hideRowCounts", { count: Object.keys(health.counts).length })
                  : t("showRowCounts", { count: Object.keys(health.counts).length })}
              </button>

              {showCounts && (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 bg-gray-50 rounded-xl p-3">
                  {Object.entries(health.counts).map(([name, count]) => (
                    <div key={name} className="flex justify-between text-xs text-gray-500">
                      <span className="capitalize">{name}</span>
                      <span className="font-medium text-gray-700">{count.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-[10px] text-gray-400 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {t("checkedAt", { time: new Date(health.checkedAt).toLocaleString() })}
              </p>
            </div>
          )}
        </Card>

        {/* ════════════════════ CLEANUP ════════════════════ */}
        <Card>
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
                <Wrench className="w-4 h-4 text-orange-600" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900 text-sm">{t("cleanupTitle")}</h2>
                <p className="text-xs text-gray-500">{t("cleanupDesc")}</p>
              </div>
            </div>
            <StatusIcon status={cleanStatus} />
          </div>

          <div className="flex gap-2 flex-wrap">
            <Btn
              onClick={() => { setPreviewDone(false); runCleanup(true); }}
              disabled={cleanStatus === "loading"}
              variant="ghost"
            >
              {cleanStatus === "loading" && !previewDone
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t("scanning")}</>
                : t("previewChanges")}
            </Btn>

            {previewDone && cleanResult && cleanResult.totalFound > 0 && (
              <Btn
                onClick={() => runCleanup(false)}
                disabled={cleanStatus === "loading"}
                variant="danger"
              >
                {cleanStatus === "loading"
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t("fixing")}</>
                  : t("applyFixes", { count: cleanResult.totalFound })}
              </Btn>
            )}

            {previewDone && cleanResult && cleanResult.totalFound === 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs text-green-600 font-medium px-3 py-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> {t("everythingClean")}
              </span>
            )}
          </div>

          {cleanErr && (
            <p className="mt-3 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{cleanErr}</p>
          )}

          {cleanResult && (
            <div className="mt-4 space-y-2">
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${
                cleanResult.dryRun
                  ? "bg-blue-50 text-blue-700"
                  : cleanResult.totalFixed > 0
                    ? "bg-green-50 text-green-700"
                    : "bg-gray-50 text-gray-600"
              }`}>
                {cleanResult.dryRun
                  ? t("previewNeedFix", { count: cleanResult.totalFound })
                  : cleanResult.totalFixed > 0
                    ? <><CheckCircle2 className="w-4 h-4" /> {t("fixedItems", { count: cleanResult.totalFixed })}</>
                    : t("alreadyClean")}
              </div>

              <div className="space-y-1">
                {cleanResult.results.map((r, i) => (
                  <div key={i} className={`flex items-center justify-between text-xs px-3 py-1.5 rounded-lg ${
                    r.found > 0 ? "bg-orange-50 text-orange-700" : "bg-gray-50 text-gray-400"
                  }`}>
                    <span>{r.label}</span>
                    <span className="font-medium">
                      {cleanResult.dryRun
                        ? r.found > 0 ? t("toFix", { count: r.found }) : t("clean")
                        : r.found > 0 ? t("fixed", { count: r.fixed }) : t("clean")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* ════════════════════ BACKUP ════════════════════ */}
        <Card className="lg:col-span-2">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                <DatabaseBackup className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900 text-sm">{t("backupTitle")}</h2>
                <p className="text-xs text-gray-500">{t("backupDesc")}</p>
              </div>
            </div>
            <StatusIcon status={backupStatus} />
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <Btn onClick={runBackup} disabled={backupStatus === "loading"} variant="primary">
              {backupStatus === "loading"
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t("backingUp")}</>
                : <><DatabaseBackup className="w-3.5 h-3.5" /> {t("createBackup")}</>}
            </Btn>
            {backupResult && (
              <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {t("backupSaved", { rows: backupResult.totalRows.toLocaleString(), time: backupResult.timestamp })}
              </span>
            )}
          </div>

          {backupErr && (
            <p className="mt-3 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{backupErr}</p>
          )}

          {/* Restore feedback */}
          {restoreResult && (
            <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 text-green-700 text-xs font-medium">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              {t("restoreSuccess", { rows: restoreResult.totalRows.toLocaleString(), time: restoreResult.timestamp })}
            </div>
          )}
          {restoreErr && (
            <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 text-red-700 text-xs font-medium">
              <XCircle className="w-4 h-4 flex-shrink-0" />
              {t("restoreFailed")}: {restoreErr}
            </div>
          )}

          {/* Backup history */}
          <div className="mt-5">
            <div className="flex items-center gap-2 mb-3">
              <History className="w-4 h-4 text-gray-400" />
              <h3 className="text-sm font-semibold text-gray-700">{t("backupHistory")}</h3>
              <span className="text-xs text-gray-400">{t("backupCount", { count: backupHistory.length })}</span>
            </div>

            {!historyLoaded ? (
              <div className="text-xs text-gray-400 flex items-center gap-2 py-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t("loadingHistory")}
              </div>
            ) : backupHistory.length === 0 ? (
              <p className="text-xs text-gray-400 bg-gray-50 rounded-xl px-4 py-3">
                {t("noBackups")}
              </p>
            ) : (
              <div className="divide-y divide-gray-50 border border-gray-100 rounded-xl overflow-hidden">
                {backupHistory.map((b) => (
                  <div key={b.timestamp} className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">
                        {new Date(b.createdAt).toLocaleString()}
                      </p>
                      <p className="text-xs text-gray-400">
                        {b.totalRows.toLocaleString()} rows · {fmtBytes(b.sizeBytes)}
                        {b.createdBy ? ` · by ${b.createdBy}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-wrap justify-end shrink-0">
                      {Object.entries(b.tables).slice(0, 4).map(([name, count]) => (
                        <span key={name} className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded font-medium">
                          {name} {count}
                        </span>
                      ))}
                      {Object.keys(b.tables).length > 4 && (
                        <span className="text-[10px] text-gray-400">{t("more", { count: Object.keys(b.tables).length - 4 })}</span>
                      )}
                    </div>

                    {/* Download JSON */}
                    <Btn
                      onClick={() => downloadBackup(b.timestamp, "json")}
                      disabled={dlBusy === b.timestamp}
                      variant="ghost"
                      size="sm"
                    >
                      {dlBusy === b.timestamp
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <><Download className="w-3 h-3" /> {t("downloadJson")}</>}
                    </Btn>

                    {/* Download SQL */}
                    <Btn
                      onClick={() => downloadBackup(b.timestamp, "sql")}
                      disabled={dlBusy === b.timestamp}
                      variant="ghost"
                      size="sm"
                    >
                      <Download className="w-3 h-3" /> {t("downloadSql")}
                    </Btn>

                    {/* Restore */}
                    {restoreBusy ? (
                      <Btn variant="ghost" size="sm" disabled>
                        <Loader2 className="w-3 h-3 animate-spin" />
                      </Btn>
                    ) : (
                      <Btn
                        onClick={() => setRestoreConfirm(b)}
                        variant="ghost"
                        size="sm"
                      >
                        <RotateCcw className="w-3 h-3 text-amber-500" /> {t("restore")}
                      </Btn>
                    )}

                    {delConfirm === b.timestamp ? (
                      <div className="flex items-center gap-1">
                        <Btn onClick={() => deleteBackup(b.timestamp)} disabled={delBusy === b.timestamp} variant="danger" size="sm">
                          {delBusy === b.timestamp ? <Loader2 className="w-3 h-3 animate-spin" /> : t("confirm")}
                        </Btn>
                        <Btn onClick={() => setDelConfirm(null)} variant="secondary" size="sm">{t("cancel")}</Btn>
                      </div>
                    ) : (
                      <Btn
                        onClick={() => setDelConfirm(b.timestamp)}
                        disabled={delBusy === b.timestamp}
                        variant="ghost"
                        size="sm"
                      >
                        <Trash2 className="w-3 h-3 text-red-400" />
                      </Btn>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* ════════════════════ EXPORT ════════════════════ */}
        <Card className="lg:col-span-2">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                <FileSpreadsheet className="w-4 h-4 text-purple-600" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900 text-sm">{t("exportTitle")}</h2>
                <p className="text-xs text-gray-500">{t("exportDesc")}</p>
              </div>
            </div>
            <StatusIcon status={exportStatus} />
          </div>

          <div className="mb-4 grid grid-cols-3 sm:grid-cols-5 gap-2">
            {[
              { value: "all",          labelKey: "allTables",         icon: "📦" },
              { value: "books",        labelKey: "tableBooks",        icon: "📚" },
              { value: "copies",       labelKey: "tableBookCopies",   icon: "🗂️" },
              { value: "members",      labelKey: "tableMembers",      icon: "👥" },
              { value: "loans",        labelKey: "tableLoans",        icon: "📖" },
              { value: "fines",        labelKey: "tableFines",        icon: "💰" },
              { value: "reservations", labelKey: "tableReservations", icon: "📋" },
              { value: "requests",     labelKey: "tableBookRequests", icon: "📩" },
              { value: "ebooks",       labelKey: "tableEbooks",       icon: "📱" },
            ].map(({ value, labelKey, icon }) => (
              <button
                key={value}
                onClick={() => setExportTable(value)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium border transition-colors text-left ${
                  exportTable === value
                    ? "border-purple-300 bg-purple-50 text-purple-700"
                    : "border-gray-100 bg-gray-50 text-gray-600 hover:bg-gray-100"
                }`}
              >
                <span>{icon}</span> {t(labelKey as Parameters<typeof t>[0])}
              </button>
            ))}
          </div>

          <Btn onClick={runExport} disabled={exportStatus === "loading"} variant="secondary">
            {exportStatus === "loading"
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t("generating")}</>
              : exportStatus === "success"
                ? <><CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> {t("downloaded")}</>
                : <><Download className="w-3.5 h-3.5" /> {t("downloadExcel")}</>}
          </Btn>
        </Card>

      </div>

      {/* ── Recommended schedule ── */}
      <Card className="bg-gray-50 border-gray-200">
        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <Package className="w-4 h-4" /> {t("maintenanceTitle")}
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          {[
            { freqKey: "maintenanceDaily",     actionKey: "maintenanceCleanup", color: "text-orange-600", bg: "bg-orange-50", noteKey: "maintenanceCleanupNote" },
            { freqKey: "maintenanceWeekly",    actionKey: "maintenanceBackup",  color: "text-blue-600",   bg: "bg-blue-50",   noteKey: "maintenanceBackupNote"  },
            { freqKey: "maintenanceMonthly",   actionKey: "maintenanceHealth",  color: "text-green-600",  bg: "bg-green-50",  noteKey: "maintenanceHealthNote"  },
            { freqKey: "maintenanceQuarterly", actionKey: "maintenanceExport",  color: "text-purple-600", bg: "bg-purple-50", noteKey: "maintenanceExportNote"  },
          ].map(({ freqKey, actionKey, color, bg, noteKey }) => (
            <div key={actionKey} className={`${bg} rounded-xl px-3 py-3`}>
              <p className={`text-xs font-bold ${color}`}>{t(freqKey as Parameters<typeof t>[0])}</p>
              <p className="text-xs font-semibold text-gray-700 mt-0.5">{t(actionKey as Parameters<typeof t>[0])}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{t(noteKey as Parameters<typeof t>[0])}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* ── ☠️ Danger Zone — Sale Data Reset ────────────────────────────── */}
      <Card className="border-red-100">
        <div className="flex items-center gap-2 pb-4 border-b border-red-100 mb-4">
          <Flame className="w-4 h-4 text-red-500" />
          <h2 className="text-base font-semibold text-red-700">Danger Zone</h2>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center flex-shrink-0">
              <ShoppingBag className="w-4 h-4 text-red-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Reset All Sale Data</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Permanently deletes all sale orders, carts, and order items.
                Resets every <code className="bg-gray-100 px-1 rounded">SOLD</code> copy back to{" "}
                <code className="bg-gray-100 px-1 rounded">STOCK</code>. This cannot be undone.
              </p>
              {saleResetResult && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="text-[11px] bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-medium">
                    ✓ {saleResetResult.ordersDeleted} orders deleted
                  </span>
                  <span className="text-[11px] bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-medium">
                    ✓ {saleResetResult.cartsDeleted} carts cleared
                  </span>
                  <span className="text-[11px] bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-medium">
                    ✓ {saleResetResult.copiesReset} copies → STOCK
                  </span>
                  {saleResetResult.copiesLeft > 0 && (
                    <span className="text-[11px] bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-medium">
                      ⚠ {saleResetResult.copiesLeft} copies left as SOLD (completed orders — physically gone)
                    </span>
                  )}
                </div>
              )}
              {saleResetErr && (
                <p className="mt-1 text-xs text-red-600">{saleResetErr}</p>
              )}
            </div>
          </div>

          <Btn
            onClick={() => { setSaleResetConfirm(true); setSaleResetInput(""); setSaleResetErr(""); }}
            variant="danger"
            size="sm"
          >
            <Trash2 className="w-3.5 h-3.5" /> Reset Sales
          </Btn>
        </div>
      </Card>

      {/* ── Sale reset confirmation modal ────────────────────────────────── */}
      {saleResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <Flame className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h2 className="font-bold text-gray-900">Reset all sale data?</h2>
                <p className="text-xs text-red-600 font-medium">This action is irreversible</p>
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800 space-y-1">
              <p>The following will be <strong>permanently deleted</strong>:</p>
              <ul className="list-disc list-inside text-xs space-y-0.5 mt-1 text-red-700">
                <li>All sale orders and order items</li>
                <li>All member carts</li>
                <li>Sale-related stock movements</li>
              </ul>
              <p className="mt-1.5">
                Copies from <strong>incomplete</strong> orders → reset to <code className="bg-red-100 px-1 rounded">STOCK</code>.<br/>
                Copies from <strong>completed/delivered</strong> orders → stay <code className="bg-red-100 px-1 rounded">SOLD</code> (buyer already has them).
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-700">
                Type <span className="font-mono text-red-600">RESET SALES</span> to confirm
              </label>
              <input
                type="text"
                value={saleResetInput}
                onChange={(e) => setSaleResetInput(e.target.value)}
                placeholder="RESET SALES"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-400"
              />
            </div>

            {saleResetErr && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{saleResetErr}</p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Btn onClick={() => setSaleResetConfirm(false)} variant="secondary" disabled={saleResetBusy}>
                Cancel
              </Btn>
              <Btn
                onClick={runSaleReset}
                variant="danger"
                disabled={saleResetInput !== "RESET SALES" || saleResetBusy}
              >
                {saleResetBusy
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Resetting…</>
                  : <><Flame className="w-3.5 h-3.5" /> Confirm Reset</>}
              </Btn>
            </div>
          </div>
        </div>
      )}

      {/* ── Restore confirmation modal ───────────────────────────────────── */}
      {restoreConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <AlertOctagon className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h2 className="font-bold text-gray-900">{t("restoreTitle")}</h2>
                <p className="text-xs text-gray-500">
                  {new Date(restoreConfirm.createdAt).toLocaleString()} · {restoreConfirm.totalRows.toLocaleString()} rows
                </p>
              </div>
            </div>

            {/* Warning */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
              {t("restoreWarning", { date: new Date(restoreConfirm.createdAt).toLocaleString() })}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-1">
              <Btn onClick={() => setRestoreConfirm(null)} variant="secondary">
                {t("cancel")}
              </Btn>
              <Btn onClick={() => doRestore(restoreConfirm)} variant="danger">
                <RotateCcw className="w-3.5 h-3.5" /> {t("restoreConfirmBtn")}
              </Btn>
            </div>
          </div>
        </div>
      )}

      {/* ── Restore in-progress overlay ──────────────────────────────────── */}
      {restoreBusy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl px-8 py-6 flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <p className="text-sm font-semibold text-gray-700">{t("restoring")}</p>
          </div>
        </div>
      )}

    </div>
  );
}
