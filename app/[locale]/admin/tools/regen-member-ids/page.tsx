"use client";

import { useState, useEffect } from "react";
import {
  Wand2, RefreshCw, CheckCircle2, AlertCircle,
  Loader2, Hash, ArrowRight, ShieldCheck, Users,
} from "lucide-react";

interface NonSystemMember {
  id:         string;
  memberId:   string;
  name:       string;
  memberType: string;
  isActive:   boolean;
}

export default function RegenMemberIdsPage() {
  const [members,  setMembers]  = useState<NonSystemMember[]>([]);
  const [total,    setTotal]    = useState<number | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [busy,     setBusy]     = useState(false);
  const [confirm,  setConfirm]  = useState(false);
  const [changes,  setChanges]  = useState<{ oldId: string; newId: string; name: string }[]>([]);
  const [result,   setResult]   = useState<{ updated: number; skipped: number } | null>(null);
  const [err,      setErr]      = useState<string | null>(null);

  useEffect(() => { loadMembers(); }, []);

  async function loadMembers() {
    setLoading(true); setErr(null);
    try {
      const res = await fetch("/api/admin/tools/regen-member-ids");
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setMembers(data.members ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    } finally { setLoading(false); }
  }

  async function runPreview() {
    setBusy(true); setErr(null); setChanges([]); setResult(null);
    try {
      const res = await fetch("/api/admin/tools/regen-member-ids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: true }),
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
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: false }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setResult({ updated: data.updated, skipped: data.skipped });
      setChanges([]);
      loadMembers();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally { setBusy(false); }
  }

  const allDone = !loading && members.length === 0;

  const TYPE_COLORS: Record<string, string> = {
    STUDENT:  "bg-blue-50 text-blue-700",
    TEACHER:  "bg-violet-50 text-violet-700",
    STAFF:    "bg-amber-50 text-amber-700",
    PUBLIC:   "bg-gray-100 text-gray-600",
  };

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
            Finds every member whose ID is not in{" "}
            <code className="bg-gray-100 px-1 rounded">MEM-YYYY-XXXX</code> format
            and replaces it with a proper system ID.
          </p>
        </div>
        <button onClick={loadMembers} disabled={loading}
          className="ml-auto text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-40">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Summary banner */}
      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium ${
        loading           ? "bg-gray-50 border-gray-200 text-gray-400" :
        allDone           ? "bg-green-50 border-green-200 text-green-700" :
                            "bg-amber-50 border-amber-200 text-amber-700"
      }`}>
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        {allDone && <CheckCircle2 className="w-4 h-4" />}
        {!loading && !allDone && <AlertCircle className="w-4 h-4" />}
        <span className="flex-1">
          {loading
            ? "Scanning member IDs…"
            : allDone
            ? `All ${total?.toLocaleString()} members already have system-format IDs ✓`
            : `${members.length.toLocaleString()} of ${total?.toLocaleString()} members have non-system IDs`}
        </span>
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
          {result.skipped > 0 && <>, <strong>{result.skipped}</strong> skipped</>}
        </div>
      )}

      {/* Full list of non-system members */}
      {!loading && members.length > 0 && !confirm && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-semibold text-gray-700">
                Members with non-system IDs
              </span>
              <span className="text-xs bg-amber-100 text-amber-700 font-semibold px-2 py-0.5 rounded-full">
                {members.length}
              </span>
            </div>
            <button
              onClick={runPreview}
              disabled={busy}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors"
            >
              {busy
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Preparing…</>
                : <><Wand2 className="w-3.5 h-3.5" /> Preview & Regenerate</>}
            </button>
          </div>

          <div className="divide-y divide-gray-50 max-h-[480px] overflow-y-auto">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                <Hash className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                <code className="font-mono text-sm text-red-600 w-44 flex-shrink-0 truncate">
                  {m.memberId}
                </code>
                <span className="flex-1 text-sm text-gray-800 truncate">{m.name}</span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${TYPE_COLORS[m.memberType] ?? "bg-gray-100 text-gray-600"}`}>
                  {m.memberType}
                </span>
                {!m.isActive && (
                  <span className="text-[10px] bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full flex-shrink-0">
                    Inactive
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Confirm panel — show every change */}
      {confirm && changes.length > 0 && (
        <div className="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 bg-amber-50 border-b border-amber-100">
            <p className="text-sm font-semibold text-amber-800">
              Confirm — {changes.length} IDs will change
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirm(false)}
                className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                Cancel
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

          <div className="px-5 py-3 bg-amber-50 border-t border-amber-100 text-xs text-amber-700">
            All loans, fines and reservations stay linked — only the display ID changes. Back up first if needed.
          </div>
        </div>
      )}

    </div>
  );
}
