"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Users, RefreshCw, Loader2, Trash2, CheckCircle2,
  AlertCircle, ChevronDown, ChevronUp, ShieldCheck,
} from "lucide-react";

interface DupMember {
  id: string; memberId: string; name: string;
  email: string | null; phone: string | null;
  memberType: string; joinDate: string; expireDate: string | null;
  isActive: boolean; loanCount: number; fineCount: number;
}

interface DupGroup { key: string; members: DupMember[] }

interface ApiResult {
  groups:          DupGroup[];
  totalDuplicates: number;
  totalGroups:     number;
}

export default function DedupMembersPage() {
  const [data,       setData]       = useState<ApiResult | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [busyBulk,   setBusyBulk]   = useState(false);
  const [busyIds,    setBusyIds]    = useState<Set<string>>(new Set());
  const [expanded,   setExpanded]   = useState<Set<string>>(new Set());
  const [selected,   setSelected]   = useState<Set<string>>(new Set()); // ids to delete
  const [toast,      setToast]      = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setSelected(new Set());
    try {
      const res = await fetch("/api/admin/tools/dedup-members");
      if (!res.ok) throw new Error(await res.text());
      const d: ApiResult = await res.json();
      setData(d);
      // Auto-expand first 5 groups
      setExpanded(new Set(d.groups.slice(0, 5).map((g) => g.key)));
    } catch (e) {
      showToast(`Load failed: ${e instanceof Error ? e.message : "error"}`, false);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function deleteSelected() {
    if (!selected.size) return;
    if (!confirm(`Delete ${selected.size} selected duplicate member(s)? Members with loans or fines will be skipped.`)) return;
    setBusyIds(new Set(selected));
    try {
      const res = await fetch("/api/admin/tools/dedup-members", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ action: "delete", deleteIds: [...selected] }),
      });
      const r = await res.json();
      if (!res.ok) throw new Error(r.error);
      let msg = `Deleted ${r.deleted} member(s).`;
      if (r.skipped > 0) msg += ` Skipped ${r.skipped} (have loans/fines).`;
      showToast(msg, r.deleted > 0);
      await load();
    } catch (e) {
      showToast(`${e instanceof Error ? e.message : "error"}`, false);
    } finally { setBusyIds(new Set()); }
  }

  async function deleteAllEmpty() {
    if (!confirm(`Auto-delete ALL duplicate members that have 0 loans and 0 fines?\nThe member with the most activity (or oldest) in each group will be kept.`)) return;
    setBusyBulk(true);
    try {
      const res = await fetch("/api/admin/tools/dedup-members", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ action: "delete-all-empty" }),
      });
      const r = await res.json();
      if (!res.ok) throw new Error(r.error);
      showToast(`Deleted ${r.deleted} duplicate(s). Skipped ${r.skipped} (have activity).`);
      await load();
    } catch (e) {
      showToast(`${e instanceof Error ? e.message : "error"}`, false);
    } finally { setBusyBulk(false); }
  }

  function toggleExpand(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function toggleSelect(id: string, keepId: string) {
    if (id === keepId) return; // can't select the "keep" member
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // For each group, the "keep" member is the one with most loans/fines, or earliest join
  function keepMember(group: DupGroup): string {
    return [...group.members].sort((a, b) => {
      const as = a.loanCount + a.fineCount;
      const bs = b.loanCount + b.fineCount;
      if (bs !== as) return bs - as;
      return new Date(a.joinDate).getTime() - new Date(b.joinDate).getTime();
    })[0].id;
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-violet-600" /> Duplicate Members
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Find and remove members imported multiple times. Members with loans or fines are protected and cannot be deleted.
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Refresh
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium ${
          toast.ok ? "bg-green-50 border border-green-200 text-green-800" : "bg-red-50 border border-red-200 text-red-800"
        }`}>
          {toast.ok ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
          {toast.msg}
        </div>
      )}

      {/* Stats + bulk actions */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-2xl font-extrabold text-gray-900">{data.totalGroups.toLocaleString()}</p>
            <p className="text-xs text-gray-500 mt-0.5">Name groups with duplicates</p>
          </div>
          <div className={`rounded-xl border p-4 ${data.totalDuplicates > 0 ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}`}>
            <p className={`text-2xl font-extrabold ${data.totalDuplicates > 0 ? "text-red-700" : "text-green-700"}`}>
              {data.totalDuplicates.toLocaleString()}
            </p>
            <p className={`text-xs mt-0.5 ${data.totalDuplicates > 0 ? "text-red-500" : "text-green-600"}`}>
              {data.totalDuplicates > 0 ? "Extra duplicate records" : "No duplicates ✓"}
            </p>
          </div>
          {data.totalDuplicates > 0 && (
            <>
              <button onClick={deleteAllEmpty} disabled={busyBulk}
                className="flex items-center justify-center gap-2 px-3 py-3 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 active:scale-[0.98] disabled:opacity-50 transition-all shadow-sm">
                {busyBulk ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Auto-clean All Empty
              </button>
              {selected.size > 0 && (
                <button onClick={deleteSelected} disabled={busyIds.size > 0}
                  className="flex items-center justify-center gap-2 px-3 py-3 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 active:scale-[0.98] disabled:opacity-50 transition-all shadow-sm">
                  {busyIds.size > 0 ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Delete {selected.size} Selected
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && !data && (
        <div className="flex items-center justify-center py-20 gap-3 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span className="text-sm">Scanning members…</span>
        </div>
      )}

      {/* No duplicates */}
      {data && data.totalDuplicates === 0 && (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
          <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
          <p className="font-semibold text-gray-700">No duplicate members found ✓</p>
          <p className="text-sm text-gray-400 mt-1">Every member name appears exactly once.</p>
        </div>
      )}

      {/* Duplicate groups */}
      {data && data.groups.length > 0 && (
        <div className="space-y-3">
          {data.groups.map((group) => {
            const keepId   = keepMember(group);
            const isOpen   = expanded.has(group.key);
            const selCount = group.members.filter((m) => selected.has(m.id)).length;

            return (
              <div key={group.key} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                {/* Group header */}
                <button
                  onClick={() => toggleExpand(group.key)}
                  className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors text-left">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-100 text-red-700 text-xs font-bold flex-shrink-0">
                      {group.members.length}
                    </span>
                    <span className="font-semibold text-gray-900 capitalize">{group.key}</span>
                    {selCount > 0 && (
                      <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium">
                        {selCount} selected
                      </span>
                    )}
                  </div>
                  {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </button>

                {/* Members table */}
                {isOpen && (
                  <div className="border-t border-gray-100 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                        <tr>
                          <th className="px-4 py-2 w-8"></th>
                          <th className="px-4 py-2 text-left">Member ID</th>
                          <th className="px-4 py-2 text-left">Name</th>
                          <th className="px-4 py-2 text-left">Email / Phone</th>
                          <th className="px-4 py-2 text-left">Type</th>
                          <th className="px-4 py-2 text-left">Expires</th>
                          <th className="px-4 py-2 text-center">Loans</th>
                          <th className="px-4 py-2 text-center">Fines</th>
                          <th className="px-4 py-2 text-left">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {group.members.map((m) => {
                          const isKeep   = m.id === keepId;
                          const isBusy   = busyIds.has(m.id);
                          const isSel    = selected.has(m.id);
                          const hasData  = m.loanCount > 0 || m.fineCount > 0;

                          return (
                            <tr key={m.id} className={`transition-colors ${
                              isKeep ? "bg-green-50" :
                              isSel  ? "bg-violet-50" :
                              "hover:bg-gray-50"
                            }`}>
                              <td className="px-4 py-3">
                                {isKeep ? (
                                  <ShieldCheck className="w-4 h-4 text-green-600" title="Will be kept" />
                                ) : hasData ? (
                                  <span title="Has loans/fines — protected" className="text-amber-500 text-xs font-bold">!</span>
                                ) : (
                                  <input type="checkbox" checked={isSel} disabled={isBusy}
                                    onChange={() => toggleSelect(m.id, keepId)}
                                    className="w-4 h-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500 cursor-pointer" />
                                )}
                              </td>
                              <td className="px-4 py-3 font-mono text-xs text-gray-600">{m.memberId}</td>
                              <td className="px-4 py-3 font-medium text-gray-900">{m.name}</td>
                              <td className="px-4 py-3 text-xs text-gray-500">
                                {m.email && <div>{m.email}</div>}
                                {m.phone && <div>{m.phone}</div>}
                                {!m.email && !m.phone && "—"}
                              </td>
                              <td className="px-4 py-3 text-xs text-gray-500">{m.memberType}</td>
                              <td className="px-4 py-3 text-xs text-gray-500">
                                {m.expireDate ? new Date(m.expireDate).toLocaleDateString() : "—"}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className={`text-xs font-bold ${m.loanCount > 0 ? "text-blue-600" : "text-gray-300"}`}>
                                  {m.loanCount}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className={`text-xs font-bold ${m.fineCount > 0 ? "text-red-600" : "text-gray-300"}`}>
                                  {m.fineCount}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                {isKeep ? (
                                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Keep</span>
                                ) : hasData ? (
                                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Protected</span>
                                ) : (
                                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">Can delete</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {/* Quick action for this group */}
                    <div className="px-4 py-2.5 border-t border-gray-100 flex items-center gap-2 bg-gray-50">
                      <span className="text-xs text-gray-500">Quick:</span>
                      {group.members
                        .filter((m) => m.id !== keepId && m.loanCount === 0 && m.fineCount === 0)
                        .map((m) => (
                          <button key={m.id}
                            onClick={async () => {
                              setBusyIds((p) => new Set([...p, m.id]));
                              const res = await fetch("/api/admin/tools/dedup-members", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ action: "delete", deleteIds: [m.id] }),
                              });
                              const r = await res.json();
                              showToast(r.deleted > 0 ? `Deleted ${m.memberId}` : (r.errors?.[0] ?? "Skipped"), r.deleted > 0);
                              setBusyIds((p) => { const n = new Set(p); n.delete(m.id); return n; });
                              await load();
                            }}
                            disabled={busyIds.has(m.id)}
                            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-white border border-gray-200 text-gray-600 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors disabled:opacity-40">
                            {busyIds.has(m.id) ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                            Delete {m.memberId}
                          </button>
                        ))}
                      {group.members.filter((m) => m.id !== keepId && m.loanCount === 0 && m.fineCount === 0).length === 0 && (
                        <span className="text-xs text-amber-600">All duplicates are protected (have loans/fines)</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
