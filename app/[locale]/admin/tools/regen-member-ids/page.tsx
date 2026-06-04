"use client";

import { useState, useEffect } from "react";
import {
  Wand2, RefreshCw, CheckCircle2, AlertCircle,
  Loader2, Hash, ArrowRight, ShieldCheck, Users, Filter,
} from "lucide-react";

interface Member {
  id:         string;
  memberId:   string;
  name:       string;
  memberType: string;
  isActive:   boolean;
}

interface Change { id: string; oldId: string; newId: string; name: string }

const TYPE_COLORS: Record<string, string> = {
  STUDENT: "bg-blue-50 text-blue-700",
  TEACHER: "bg-violet-50 text-violet-700",
  STAFF:   "bg-amber-50 text-amber-700",
  PUBLIC:  "bg-gray-100 text-gray-600",
};

export default function RegenMemberIdsPage() {
  const [members,       setMembers]       = useState<Member[]>([]);
  const [total,         setTotal]         = useState<number | null>(null);
  const [currentFormat, setCurrentFormat] = useState<string>("");
  const [loading,       setLoading]       = useState(true);
  const [busy,          setBusy]          = useState(false);
  const [err,           setErr]           = useState<string | null>(null);

  /* scope settings */
  const [scope,      setScope]      = useState<"all" | "pattern">("all");
  const [oldPattern, setOldPattern] = useState("");

  /* workflow states */
  const [changes, setChanges] = useState<Change[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [result,  setResult]  = useState<{ updated: number; skipped: number } | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setErr(null);
    try {
      const res = await fetch("/api/admin/tools/regen-member-ids");
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setMembers(data.members ?? []);
      setTotal(data.total ?? 0);
      setCurrentFormat(data.currentFormat ?? "MEM-{YYYY}-{RAND4}");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    } finally { setLoading(false); }
  }

  /* filtered preview list for the scope=pattern view */
  const patternMatches = (() => {
    if (scope !== "pattern" || !oldPattern.trim()) return [];
    try { const re = new RegExp(oldPattern, "i"); return members.filter((m) => re.test(m.memberId)); }
    catch { return []; }
  })();

  const targetCount = scope === "all" ? (total ?? 0) : patternMatches.length;

  async function runPreview() {
    setBusy(true); setErr(null); setChanges([]); setResult(null);
    try {
      const res = await fetch("/api/admin/tools/regen-member-ids", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ dryRun: true, scope, oldPattern: oldPattern || undefined }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setChanges(data.changes ?? []);
      setConfirm(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally { setBusy(false); }
  }

  async function runApply() {
    setBusy(true); setErr(null); setConfirm(false);
    try {
      const res = await fetch("/api/admin/tools/regen-member-ids", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ dryRun: false, scope, oldPattern: oldPattern || undefined }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setResult({ updated: data.updated, skipped: data.skipped });
      setChanges([]);
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally { setBusy(false); }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center">
          <Wand2 className="w-5 h-5 text-violet-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Regenerate Member IDs</h1>
          <p className="text-sm text-gray-500">
            Re-apply the current ID format to members. Current format:{" "}
            <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono text-gray-700">
              {currentFormat || "…"}
            </code>
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="ml-auto text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-40">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Error */}
      {err && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {err}
        </div>
      )}

      {/* Success */}
      {result && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700 font-medium">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          Done — <strong>{result.updated}</strong> ID{result.updated !== 1 ? "s" : ""} regenerated
          {result.skipped > 0 && <>, <strong>{result.skipped}</strong> skipped (collision)</>}
        </div>
      )}

      {/* Scope selector */}
      {!confirm && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <p className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" /> Which members to regenerate?
          </p>

          <div className="flex gap-3">
            <button
              onClick={() => setScope("all")}
              className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                scope === "all"
                  ? "border-violet-400 bg-violet-50 text-violet-700"
                  : "border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              <Users className="w-4 h-4 inline mr-1.5" />
              All members{total !== null ? ` (${total.toLocaleString()})` : ""}
            </button>
            <button
              onClick={() => setScope("pattern")}
              className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                scope === "pattern"
                  ? "border-violet-400 bg-violet-50 text-violet-700"
                  : "border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              <Hash className="w-4 h-4 inline mr-1.5" />
              Match old pattern
            </button>
          </div>

          {scope === "pattern" && (
            <div className="space-y-2">
              <input
                type="text"
                placeholder='e.g. ^MEM-\d{4}-\d{4}$ or just "MEM-" to match prefix'
                value={oldPattern}
                onChange={(e) => setOldPattern(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400 font-mono"
              />
              {oldPattern && (
                <p className="text-xs text-gray-500">
                  {patternMatches.length > 0
                    ? <><span className="text-violet-700 font-semibold">{patternMatches.length}</span> member{patternMatches.length !== 1 ? "s" : ""} match</>
                    : <span className="text-gray-400">No members match this pattern</span>}
                </p>
              )}
              {patternMatches.length > 0 && (
                <div className="border border-gray-100 rounded-xl divide-y divide-gray-50 max-h-48 overflow-y-auto">
                  {patternMatches.slice(0, 50).map((m) => (
                    <div key={m.id} className="flex items-center gap-3 px-4 py-2 text-xs">
                      <code className="font-mono text-gray-600 w-40 truncate">{m.memberId}</code>
                      <span className="text-gray-500 flex-1 truncate">{m.name}</span>
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${TYPE_COLORS[m.memberType] ?? "bg-gray-100 text-gray-600"}`}>
                        {m.memberType}
                      </span>
                    </div>
                  ))}
                  {patternMatches.length > 50 && (
                    <p className="px-4 py-2 text-xs text-gray-400">…and {patternMatches.length - 50} more</p>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-gray-400">
              {targetCount > 0
                ? <><span className="text-gray-700 font-medium">{targetCount}</span> ID{targetCount !== 1 ? "s" : ""} will be regenerated using <code className="bg-gray-100 px-1 rounded">{currentFormat}</code></>
                : "No members selected"}
            </p>
            <button
              onClick={runPreview}
              disabled={busy || targetCount === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors"
            >
              {busy
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Preparing…</>
                : <><Wand2 className="w-3.5 h-3.5" /> Preview Changes</>}
            </button>
          </div>

          <div className="rounded-lg bg-amber-50 border border-amber-100 p-3 text-xs text-amber-700">
            ⚠️ All loans, fines, and reservations stay linked — only the display ID changes. Consider a backup before applying to all members.
          </div>
        </div>
      )}

      {/* Confirm panel */}
      {confirm && changes.length > 0 && (
        <div className="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 bg-amber-50 border-b border-amber-100">
            <p className="text-sm font-semibold text-amber-800">
              Preview — {changes.length} ID{changes.length !== 1 ? "s" : ""} will change
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirm(false)}
                className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                Back
              </button>
              <button onClick={runApply} disabled={busy}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors">
                {busy
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Applying…</>
                  : <><ShieldCheck className="w-3.5 h-3.5" /> Apply All</>}
              </button>
            </div>
          </div>

          <div className="divide-y divide-gray-50 max-h-[480px] overflow-y-auto">
            {changes.map((c) => (
              <div key={c.oldId} className="flex items-center gap-3 px-5 py-2.5 hover:bg-gray-50 text-sm">
                <code className="font-mono text-red-500 line-through w-44 flex-shrink-0 truncate text-xs">{c.oldId}</code>
                <ArrowRight className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                <code className="font-mono text-green-600 w-44 flex-shrink-0 text-xs">{c.newId}</code>
                <span className="text-gray-500 truncate text-xs">{c.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {confirm && changes.length === 0 && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">
          <CheckCircle2 className="w-4 h-4" /> No changes needed — all matched IDs already fit the current format.
        </div>
      )}

    </div>
  );
}
