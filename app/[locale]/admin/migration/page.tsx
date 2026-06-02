"use client";

import { useState, useRef, Fragment, useEffect } from "react";
import { useLocale } from "next-intl";
import Link from "next/link";
import {
  Upload, Database, CheckCircle2, AlertCircle, Loader2,
  BookOpen, Users, Building2, Tag, Copy, ChevronRight,
  FileText, Settings2, Play, RotateCcw, Info,
  RefreshCw, Hash, Eye, Wand2, Barcode, Link2,
  ShieldCheck, XCircle, AlertTriangle, History,
  Search, BarChart2, Trash2, Landmark, MapPin,
} from "lucide-react";

interface PmbLocation { id: string; name: string; copies: number }
interface PmbLenderSummary {
  id: string; name: string; copies: number;
  locations: PmbLocation[];
}

interface PreviewStats {
  notices: number;
  authors: number;
  authors_notices: number;
  publishers: number;
  categories: number;
  exemplaires: number;
  empr: number;
  lenders: { id: string; name: string }[];
  locations: { id: string; name: string }[];
  sections: { id: string; name: string }[];
  lenderSummary: PmbLenderSummary[];
  sample: { id: number; titre: string; isbn: string }[];
}

interface MigrateResult {
  authors:    { created: number; skipped: number };
  publishers: { created: number; skipped: number };
  categories: { created: number; skipped: number };
  books:      { created: number; skipped: number; updated?: number; errors: number };
  copies:     { created: number };
  members:    { created: number; skipped: number; errors: number };
  dryRun:     boolean;
}

type Step = "upload" | "preview" | "options" | "running" | "done";

export default function PmbMigrationPage() {
  const locale  = useLocale();
  const fileRef = useRef<HTMLInputElement>(null);

  /* ── Missing data ── */
  interface MissingSummary {
    summary: {
      notices:     { total: number; missing: number };
      exemplaires: { total: number; missing: number; missingAvailable: number; missingOnLoan: number };
      members:     { total: number; missing: number };
    };
    dbBreakdown: {
      totalBooks: number; importedFromPmb: number; manualOrDemo: number;
      pmbNoticesMatched: number; pmbNoticesMissing: number;
      duplicateMappings: number;
      duplicateDetails: { bookId: string; title: string; noticeIds: number[] }[];
    };
    missingNotices:     { noticeId: number; title: string; isbn: string; author: string }[];
    missingExemplaires: { exemplaireId: number; noticeId: number; barcode: string; title: string; isOnLoan: boolean }[];
    missingMembers:     { emprId: number; name: string; cb: string }[];
  }
  const [missingBusy,   setMissingBusy]   = useState(false);
  const [missingResult, setMissingResult] = useState<MissingSummary | null>(null);
  const [missingErr,    setMissingErr]    = useState<string | null>(null);
  const [missingTab,    setMissingTab]    = useState<"notices"|"exemplaires"|"members">("notices");
  const [fixDupResult,       setFixDupResult]       = useState<{ groupsFixed: number; booksImported: number; errors: number } | null>(null);
  const [importCopiesResult, setImportCopiesResult] = useState<{ found: number; imported: number; skipped: number; noBook: number; errors: string[] } | null>(null);

  /* ── Debug ── */
  const [debugBusy,   setDebugBusy]   = useState(false);
  const [debugResult, setDebugResult] = useState<{ parsed: Record<string,unknown>; database: Record<string,unknown>; diagnosis: string[]; loanSample: Record<string,unknown> | null } | null>(null);
  const [debugErr,    setDebugErr]    = useState<string | null>(null);

  /* ── Backfill notice id ── */
  const [backfillBusy,   setBackfillBusy]   = useState(false);
  const [backfillResult, setBackfillResult] = useState<{ stamped: number; notFound: number; alreadySet: number; total: number } | null>(null);
  const [backfillErr,    setBackfillErr]    = useState<string | null>(null);

  /* ── Fix unmatched ── */
  const [fixResult, setFixResult] = useState<{ booksImported: number; membersImported: number; loansCreated: number; errors: string[] } | null>(null);

  /* ── Rollback loans ── */
  const [rollbackBusy,   setRollbackBusy]   = useState(false);
  const [rollbackResult,  setRollbackResult]  = useState<{ loansDeleted: number; copiesDeleted: number; booksUpdated: number; message?: string } | null>(null);
  const [rollbackPreview, setRollbackPreview] = useState<{ totalCopies: number; totalLoans: number; sample: { barcode: string | null; copyNumber: number; status: string; pmbId: number }[] } | null>(null);

  /* ── Migrate loans ── */
  const [loanBusy,   setLoanBusy]   = useState(false);
  interface LoanUnmatched {
    noBook:   { pret_id: number; expl_id: number; noticeId: number; noticeTitle: string }[];
    noMember: { pret_id: number; empr_id: number; emprCb: string | null; emprName: string }[];
    errors:   { pret_id: number; error: string }[];
  }
  const [loanResult, setLoanResult] = useState<{ created: number; skipped: number; noMember: number; noBook: number; lastError?: string; unmatched?: LoanUnmatched } | null>(null);
  const [loanErr,    setLoanErr]    = useState<string | null>(null);

  /* ── Stats ── */
  interface MigStats {
    books:   { total:number; withPmbNoticeId:number; withPvdBarcode:number; withCallNumber:number; missingPmbId:number };
    copies:  { total:number; available:number; borrowed:number; withPmbId:number; withOrigBarcode:number; missingPmbId:number };
    members: { total:number; withStudentId:number; missingStudentId:number };
    loans:   { total:number; active:number; overdue:number };
  }
  const [stats,      setStats]      = useState<MigStats | null>(null);
  const [statsBusy,  setStatsBusy]  = useState(false);

  /* ── Lookup ── */
  interface LookupResult {
    found: boolean; oldBarcode: string; newBarcode?: string | null;
    copyNumber?: number; status?: string;
    book?: { id: string; title: string; barcode: string | null };
    loan?: { memberName: string; memberId: string; dueDate: string | null } | null;
  }
  const [lookupQ,      setLookupQ]      = useState("");
  const [lookupBusy,   setLookupBusy]   = useState(false);
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);

  /* ── Validate ── */
  type CheckStatus = "ok" | "warn" | "error" | "info";
  interface ValidationCheck { group: string; label: string; count: number; status: CheckStatus; detail?: string[] }
  interface ValidationResult { summary: { errors: number; warnings: number; passed: number; total: number }; checks: ValidationCheck[] }
  const [validateBusy,   setValidateBusy]   = useState(false);
  const [validateResult, setValidateResult] = useState<ValidationResult | null>(null);
  const [validateErr,    setValidateErr]    = useState<string | null>(null);

  /* ── Regen member IDs state ── */
  const [regenCount,   setRegenCount]   = useState<number | null>(null);
  const [regenBusy,    setRegenBusy]    = useState(false);
  const [regenPreview, setRegenPreview] = useState<{ oldId: string; newId: string; name: string }[]>([]);
  const [regenResult,  setRegenResult]  = useState<{ updated: number; skipped: number } | null>(null);
  const [regenErr,     setRegenErr]     = useState<string | null>(null);
  const [regenConfirm, setRegenConfirm] = useState(false);

  const [step,        setStep]        = useState<Step>("upload");
  const [sqlContent,  setSqlContent]  = useState("");
  const [fileName,    setFileName]    = useState("");
  const [preview,     setPreview]     = useState<PreviewStats | null>(null);
  const [result,      setResult]      = useState<MigrateResult | null>(null);
  const [error,       setError]       = useState<string | null>(null);
  const [parsing,     setParsing]     = useState(false);

  // Options
  const [importBooks,    setImportBooks]    = useState(true);
  const [importCopies,   setImportCopies]   = useState(true);
  const [importMembers,  setImportMembers]  = useState(true);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [dryRun,         setDryRun]         = useState(false);

  // Branch mapping: pmbLenderId → pvdBranchId | null
  const [branchMap,     setBranchMap]     = useState<Record<string, string | null>>({});
  const [locationMap,   setLocationMap]   = useState<Record<string, string | null>>({});
  const [systemBranches, setSystemBranches] = useState<{ id: string; name: string }[]>([]);

  /* ── File upload ── */
  async function handleFile(file: File) {
    if (!file.name.endsWith(".sql") && !file.name.endsWith(".txt")) {
      setError("Please upload a .sql or .txt file exported from PMB.");
      return;
    }
    setError(null);
    setParsing(true);
    setFileName(file.name);

    const text = await file.text();
    setSqlContent(text);

    // Send a chunk to the preview endpoint
    try {
      const res  = await fetch(`/api/admin/migration/pmb?preview=1`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ sql: text }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setPreview(data);

      // Load system branches and pre-fill the branch map
      const bRes = await fetch("/api/branches").catch(() => null);
      if (bRes?.ok) {
        const branches: { id: string; name: string }[] = await bRes.json();
        setSystemBranches(branches);
        // Auto-match lenders by name
        const initial: Record<string, string | null> = {};
        for (const l of (data.lenders ?? [])) {
          const match = branches.find((b) =>
            b.name.toLowerCase().includes(l.name.toLowerCase()) ||
            l.name.toLowerCase().includes(b.name.toLowerCase())
          );
          initial[l.id] = match?.id ?? null;
        }
        setBranchMap(initial);

        // Auto-match sub-locations by name
        const locInitial: Record<string, string | null> = {};
        for (const s of (data.lenderSummary ?? [])) {
          for (const loc of (s.locations ?? [])) {
            const match = branches.find((b) =>
              b.name.toLowerCase().includes(loc.name.toLowerCase()) ||
              loc.name.toLowerCase().includes(b.name.toLowerCase())
            );
            locInitial[loc.id] = match?.id ?? null;
          }
        }
        setLocationMap(locInitial);
      }

      setStep("preview");
    } catch (e) {
      setError(`Failed to parse dump: ${e instanceof Error ? e.message : "Unknown error"}`);
    } finally {
      setParsing(false);
    }
  }

  /* ── Run migration ── */
  async function runMigration() {
    setStep("running");
    setError(null);
    try {
      const res = await fetch("/api/admin/migration/pmb", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          sql: sqlContent,
          options: { importBooks, importCopies, importMembers, skipDuplicates, dryRun, branchMap, locationMap },
        }),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg);
      }
      const data: MigrateResult = await res.json();
      setResult(data);
      setStep("done");
      loadStats();
    } catch (e) {
      setError(`Migration failed: ${e instanceof Error ? e.message : "Unknown error"}`);
      setStep("options");
    }
  }

  /* ── Wipe ── */
  const [wipeBusy,   setWipeBusy]   = useState(false);
  const [wipeResult, setWipeResult] = useState<{ success: boolean; deleted: Record<string,number> } | null>(null);
  const [wipeErr,    setWipeErr]    = useState<string | null>(null);
  const [wipeConfirm, setWipeConfirm] = useState("");

  /* ── Stats + regen handlers ── */
  useEffect(() => { loadRegenCount(); loadStats(); }, []);

  // Reload branches every time the options step opens (in case the initial fetch failed)
  useEffect(() => {
    if (step !== "options") return;
    fetch("/api/branches")
      .then((r) => r.ok ? r.json() : [])
      .then((branches) => {
        if (!Array.isArray(branches) || branches.length === 0) return;
        setSystemBranches(branches);
        // Auto-match any unmapped locations by name
        if (preview) {
          setBranchMap((prev) => {
            const next = { ...prev };
            for (const l of (preview.lenders ?? [])) {
              if (next[l.id] !== undefined) continue;
              const match = branches.find((b: { name: string }) =>
                b.name.toLowerCase().includes(l.name.toLowerCase()) ||
                l.name.toLowerCase().includes(b.name.toLowerCase())
              );
              if (match) next[l.id] = match.id;
            }
            return next;
          });
          setLocationMap((prev) => {
            const next = { ...prev };
            for (const s of (preview.lenderSummary ?? [])) {
              for (const loc of (s.locations ?? [])) {
                if (next[loc.id] !== undefined) continue;
                const match = branches.find((b: { name: string }) =>
                  b.name.toLowerCase().includes(loc.name.toLowerCase()) ||
                  loc.name.toLowerCase().includes(b.name.toLowerCase())
                );
                if (match) next[loc.id] = match.id;
              }
            }
            return next;
          });
        }
      })
      .catch(() => {});
  }, [step]);

  async function runWipe() {
    setWipeBusy(true); setWipeErr(null); setWipeResult(null);
    try {
      const res = await fetch("/api/admin/migration/pmb/wipe", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      setWipeResult(await res.json());
      setWipeConfirm("");
      loadStats();
    } catch (e) { setWipeErr(e instanceof Error ? e.message : "Error"); }
    finally { setWipeBusy(false); }
  }

  async function loadStats() {
    setStatsBusy(true);
    try {
      const res = await fetch("/api/admin/migration/pmb/stats");
      if (res.ok) setStats(await res.json());
    } catch { /* ignore */ }
    finally { setStatsBusy(false); }
  }

  async function runLookup() {
    if (!lookupQ.trim()) return;
    setLookupBusy(true); setLookupResult(null);
    try {
      const res = await fetch(`/api/admin/migration/pmb/lookup?barcode=${encodeURIComponent(lookupQ.trim())}`);
      setLookupResult(await res.json());
    } catch { setLookupResult({ found: false, oldBarcode: lookupQ }); }
    finally { setLookupBusy(false); }
  }

  /* ── Regen handlers ── */
  useEffect(() => { loadRegenCount(); }, []);

  async function loadRegenCount() {
    try {
      const res = await fetch("/api/admin/tools/regen-member-ids");
      if (res.ok) setRegenCount((await res.json()).count);
    } catch { /* ignore */ }
  }

  async function runRegenPreview() {
    setRegenBusy(true); setRegenErr(null); setRegenPreview([]); setRegenResult(null);
    try {
      const res = await fetch("/api/admin/tools/regen-member-ids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: true }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setRegenPreview(data.preview ?? []);
      setRegenConfirm(true);
    } catch (e) {
      setRegenErr(e instanceof Error ? e.message : "Error");
    } finally { setRegenBusy(false); }
  }

  async function runRegenApply() {
    setRegenBusy(true); setRegenErr(null); setRegenConfirm(false);
    try {
      const res = await fetch("/api/admin/tools/regen-member-ids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: false }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setRegenResult({ updated: data.updated, skipped: data.skipped });
      setRegenPreview([]);
      loadRegenCount();
    } catch (e) {
      setRegenErr(e instanceof Error ? e.message : "Error");
    } finally { setRegenBusy(false); }
  }

  async function runImportMissingCopies() {
    if (!sqlContent) return;
    setMissingBusy(true); setImportCopiesResult(null);
    try {
      const res = await fetch("/api/admin/migration/pmb/import-missing-copies", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: sqlContent }),
      });
      if (!res.ok) throw new Error(await res.text());
      setImportCopiesResult(await res.json());
      loadStats();
    } catch (e) { setMissingErr(e instanceof Error ? e.message : "Error"); }
    finally { setMissingBusy(false); }
  }

  async function runFixDuplicates() {
    if (!sqlContent) return;
    if (!confirm(`Fix ${missingResult?.dbBreakdown.duplicateMappings} duplicate mappings? This will import ~${missingResult?.dbBreakdown.duplicateMappings} new books.`)) return;
    setMissingBusy(true); setFixDupResult(null);
    try {
      const res = await fetch("/api/admin/migration/pmb/fix-duplicates", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: sqlContent }),
      });
      if (!res.ok) throw new Error(await res.text());
      setFixDupResult(await res.json());
      loadStats();
      // Re-run check to see updated state
      await runMissingCheck();
    } catch (e) { setMissingErr(e instanceof Error ? e.message : "Error"); }
    finally { setMissingBusy(false); }
  }

  async function runMissingCheck() {
    if (!sqlContent) { setMissingErr("Upload a PMB dump first."); return; }
    setMissingBusy(true); setMissingErr(null); setMissingResult(null);
    try {
      const res = await fetch("/api/admin/migration/pmb/missing", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: sqlContent }),
      });
      if (!res.ok) throw new Error(await res.text());
      setMissingResult(await res.json());
    } catch (e) { setMissingErr(e instanceof Error ? e.message : "Error"); }
    finally { setMissingBusy(false); }
  }

  async function runDebug() {
    if (!sqlContent) { setDebugErr("Upload a PMB dump first."); return; }
    setDebugBusy(true); setDebugErr(null); setDebugResult(null);
    try {
      const res = await fetch("/api/admin/migration/pmb/debug", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: sqlContent }),
      });
      if (!res.ok) throw new Error(await res.text());
      setDebugResult(await res.json());
    } catch (e) { setDebugErr(e instanceof Error ? e.message : "Error"); }
    finally { setDebugBusy(false); }
  }

  async function runBackfillNoticeId() {
    if (!sqlContent) { setBackfillErr("Upload a PMB dump first."); return; }
    setBackfillBusy(true); setBackfillErr(null); setBackfillResult(null);
    try {
      const res = await fetch("/api/admin/migration/pmb/backfill-notice-id", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: sqlContent }),
      });
      if (!res.ok) throw new Error(await res.text());
      setBackfillResult(await res.json());
      loadStats();
    } catch (e) { setBackfillErr(e instanceof Error ? e.message : "Error"); }
    finally { setBackfillBusy(false); }
  }

  async function runFixUnmatched() {
    if (!sqlContent || !loanResult?.unmatched) return;
    setLoanBusy(true); setFixResult(null);
    try {
      const res = await fetch("/api/admin/migration/pmb/fix-unmatched", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sql: sqlContent,
          missingNoticeIds: loanResult.unmatched.noBook.map((r) => r.noticeId),
          missingEmprIds:   loanResult.unmatched.noMember.map((r) => r.empr_id),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setFixResult(await res.json());
      loadStats();
    } catch (e) { setLoanErr(e instanceof Error ? e.message : "Error"); }
    finally { setLoanBusy(false); }
  }

  async function previewRollback() {
    setRollbackBusy(true); setRollbackPreview(null);
    try {
      const res = await fetch("/api/admin/migration/pmb/rollback-loans");
      if (res.ok) setRollbackPreview(await res.json());
    } catch { /* ignore */ }
    finally { setRollbackBusy(false); }
  }

  async function runRollbackLoans() {
    if (!confirm("This will delete ALL loan-migrated copies and their loans. Are you sure?")) return;
    setRollbackBusy(true); setRollbackResult(null); setRollbackPreview(null);
    try {
      const res = await fetch("/api/admin/migration/pmb/rollback-loans", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      setRollbackResult(await res.json());
      setLoanResult(null); setFixResult(null);
      loadStats();
    } catch (e) { setLoanErr(e instanceof Error ? e.message : "Error"); }
    finally { setRollbackBusy(false); }
  }

  async function runMigrateLoans() {
    if (!sqlContent) { setLoanErr("Upload a PMB dump first."); return; }
    setLoanBusy(true); setLoanErr(null); setLoanResult(null);
    try {
      const res = await fetch("/api/admin/migration/pmb/migrate-loans", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: sqlContent }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setLoanResult(data);
      loadStats();
    } catch (e) { setLoanErr(e instanceof Error ? e.message : "Error"); }
    finally { setLoanBusy(false); }
  }

  async function runValidate() {
    setValidateBusy(true); setValidateErr(null); setValidateResult(null);
    try {
      const res = await fetch("/api/admin/migration/pmb/validate");
      if (!res.ok) throw new Error(await res.text());
      setValidateResult(await res.json());
    } catch (e) { setValidateErr(e instanceof Error ? e.message : "Error"); }
    finally { setValidateBusy(false); }
  }

  function reset() {
    setStep("upload");
    setSqlContent("");
    setFileName("");
    setPreview(null);
    setResult(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  /* ── UI ── */
  return (
    <div className="max-w-3xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Database className="w-6 h-6 text-blue-600" />
          PMB → PVD Migration
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Import all books, authors, publishers, categories and physical copies from a PMB (PhpMyBibli) SQL dump.
        </p>
      </div>

      {/* ══ DANGER ZONE — WIPE ALL DATA ══ */}
      <div className="bg-white rounded-2xl border-2 border-red-200 p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Trash2 className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h2 className="text-base font-bold text-red-700">Wipe All Library Data</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Deletes all books, copies, loans, fines, members, authors, publishers and categories.
              <strong className="text-red-600"> Keeps users, settings, locations and branches.</strong>
              <br/>Use before a clean PMB re-import. This cannot be undone.
            </p>
          </div>
        </div>

        {wipeErr && <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700"><AlertCircle className="w-4 h-4 flex-shrink-0" />{wipeErr}</div>}

        {wipeResult && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2">
            <p className="text-sm font-semibold text-green-800">✅ Wipe complete — database is now empty</p>
            <div className="grid grid-cols-5 gap-2 text-xs">
              {Object.entries(wipeResult.deleted).map(([key, count]) => (
                <div key={key} className="bg-white rounded-lg px-2 py-1.5 border border-green-100 text-center">
                  <p className="font-bold text-red-600 text-base">{count.toLocaleString()}</p>
                  <p className="text-gray-400 capitalize">{key}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-600">Type <code className="bg-gray-100 px-1 rounded">WIPE</code> to confirm:</p>
          <div className="flex gap-2">
            <input type="text" value={wipeConfirm} onChange={(e) => setWipeConfirm(e.target.value)}
              placeholder="Type WIPE to confirm"
              className="flex-1 px-3 py-2 border border-red-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400 font-mono" />
            <button onClick={runWipe} disabled={wipeBusy || wipeConfirm !== "WIPE"}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:opacity-40 transition-colors">
              {wipeBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              {wipeBusy ? "Wiping…" : "Wipe All"}
            </button>
          </div>
        </div>
      </div>

      {/* Steps indicator */}
      <div className="flex items-center gap-1 text-xs font-medium">
        {(["upload","preview","options","running","done"] as Step[]).map((s, i, arr) => (
          <Fragment key={s}>
            <span className={`px-3 py-1.5 rounded-full transition-colors ${
              step === s ? "bg-blue-600 text-white" :
              arr.indexOf(step) > i ? "bg-green-100 text-green-700" :
              "bg-gray-100 text-gray-400"
            }`}>
              {i + 1}. {s.charAt(0).toUpperCase() + s.slice(1)}
            </span>
            {i < arr.length - 1 && <ChevronRight className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />}
          </Fragment>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* ── STEP 1: Upload ── */}
      {step === "upload" && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">
          <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl p-4">
            <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800 space-y-1">
              <p className="font-semibold">How to export from PMB:</p>
              <ol className="list-decimal ml-4 space-y-0.5 text-blue-700">
                <li>In PMB admin, go to <strong>Administration → Sauvegarde</strong></li>
                <li>Select <strong>Sauvegarde complète</strong> (full backup)</li>
                <li>Click <strong>Exporter</strong> — download the <code>.sql</code> file</li>
                <li>Upload it below</li>
              </ol>
              <p className="text-blue-600 mt-1">
                Alternatively: use <code>mysqldump -u root -p pmb_database &gt; pmb_export.sql</code>
              </p>
            </div>
          </div>

          <div
            className="border-2 border-dashed border-gray-200 rounded-2xl p-10 text-center cursor-pointer
              hover:border-blue-400 hover:bg-blue-50 transition-all duration-150"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) handleFile(f);
            }}
          >
            {parsing ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                <p className="text-sm font-medium text-gray-600">Parsing SQL dump…</p>
                <p className="text-xs text-gray-400">This may take a moment for large files</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center">
                  <Upload className="w-7 h-7 text-blue-500" />
                </div>
                <div>
                  <p className="font-semibold text-gray-700">Drop PMB SQL dump here</p>
                  <p className="text-sm text-gray-400 mt-0.5">or click to browse — .sql or .txt</p>
                </div>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".sql,.txt"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
          </div>
        </div>
      )}

      {/* ── STEP 2: Preview ── */}
      {step === "preview" && preview && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-5 h-5 text-gray-500" />
              <h2 className="text-base font-bold text-gray-900">Parsed: <span className="font-normal text-gray-500">{fileName}</span></h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: "Books (notices)",  value: preview.notices,     icon: BookOpen,   color: "bg-blue-50 text-blue-700"    },
                { label: "Authors",          value: preview.authors,     icon: Users,      color: "bg-violet-50 text-violet-700" },
                { label: "Publishers",       value: preview.publishers,  icon: Building2,  color: "bg-emerald-50 text-emerald-700" },
                { label: "Categories",       value: preview.categories,  icon: Tag,        color: "bg-amber-50 text-amber-700"  },
                { label: "Book–Author links",value: preview.authors_notices, icon: ChevronRight, color: "bg-gray-50 text-gray-700" },
                { label: "Physical copies",  value: preview.exemplaires, icon: Copy,       color: "bg-rose-50 text-rose-700"    },
              { label: "Borrowers (empr)", value: preview.empr ?? 0,   icon: Users,      color: "bg-teal-50 text-teal-700"    },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className={`flex items-center gap-3 ${color} rounded-xl p-3`}>
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  <div>
                    <p className="text-xl font-extrabold leading-none">{value.toLocaleString()}</p>
                    <p className="text-xs mt-0.5 opacity-75">{label}</p>
                  </div>
                </div>
              ))}
            </div>

            {preview.sample.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Sample books</p>
                <div className="divide-y divide-gray-50 border border-gray-100 rounded-xl overflow-hidden">
                  {preview.sample.map((b) => (
                    <div key={b.id} className="flex items-center gap-3 px-4 py-2.5 text-sm bg-white">
                      <BookOpen className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                      <span className="font-medium text-gray-800 truncate flex-1">{b.titre}</span>
                      {b.isbn && <span className="text-xs text-gray-400 font-mono flex-shrink-0">{b.isbn}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Location breakdown ── */}
            {(preview.lenderSummary ?? []).length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Library Locations &amp; Copy Distribution
                </p>
                <div className="space-y-2">
                  {(preview.lenderSummary ?? []).map((lender) => (
                    <div key={lender.id} className="border border-gray-100 rounded-xl overflow-hidden">
                      {/* Lender header */}
                      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50">
                        <div className="flex items-center gap-2">
                          <Landmark className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                          <span className="text-sm font-semibold text-gray-800">{lender.name}</span>
                          <span className="text-xs text-gray-400">ID: {lender.id}</span>
                        </div>
                        <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">
                          {lender.copies.toLocaleString()} copies
                        </span>
                      </div>
                      {/* Sub-locations */}
                      {lender.locations.length > 0 && (
                        <div className="divide-y divide-gray-50">
                          {lender.locations.map((loc) => (
                            <div key={loc.id} className="flex items-center justify-between px-5 py-2 text-xs bg-white">
                              <div className="flex items-center gap-2 text-gray-600">
                                <MapPin className="w-3 h-3 text-gray-300 flex-shrink-0" />
                                <span>{loc.name}</span>
                                <span className="text-gray-300">·</span>
                                <span className="text-gray-400 font-mono">loc:{loc.id}</span>
                              </div>
                              <span className="text-gray-500 font-medium">{loc.copies.toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  ℹ︎ In the next step you can map each library location to a branch in your system.
                </p>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button onClick={reset}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
              <RotateCcw className="w-4 h-4" /> Start over
            </button>
            <button onClick={() => setStep("options")}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors">
              <Settings2 className="w-4 h-4" /> Configure & Import
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Options ── */}
      {step === "options" && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-gray-500" /> Import Options
            </h2>

            {[
              {
                key: "importBooks" as const,
                val: importBooks, set: setImportBooks,
                label: "Import books (notices)",
                desc: "Create Book records from notices — titles, authors, publishers, categories and cover images",
              },
              {
                key: "importCopies" as const,
                val: importCopies, set: setImportCopies,
                label: "Import physical copies (exemplaires)",
                desc: "Create BookCopy records from exemplaires — physical items in PMB",
              },
              {
                key: "importMembers" as const,
                val: importMembers, set: setImportMembers,
                label: "Import borrowers (empr)",
                desc: "Create Member records from the empr table — name, card ID, email, phone, address, expiry date",
              },
              {
                key: "skipDuplicates" as const,
                val: skipDuplicates, set: setSkipDuplicates,
                label: "Skip duplicate books",
                desc: "Skip books already in PVD (matched by PMB notice ID, then ISBN). Uncheck only for a clean re-import after a full wipe.",
              },
              {
                key: "dryRun" as const,
                val: dryRun, set: setDryRun,
                label: "Dry run (preview only — no DB writes)",
                desc: "Parse and count records but do not write anything to the database",
              },
            ].map(({ val, set, label, desc }) => (
              <label key={label} className="flex items-start gap-3 cursor-pointer group">
                <div className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                  val ? "bg-blue-600 border-blue-600" : "border-gray-300 group-hover:border-blue-400"}`}
                  onClick={() => set(!val)}>
                  {val && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                </div>
                <div onClick={() => set(!val)}>
                  <p className="text-sm font-semibold text-gray-800">{label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
                </div>
              </label>
            ))}

            {/* ── Branch mapping ── */}
            {importCopies && preview && (preview.lenderSummary ?? preview.lenders ?? []).length > 0 && (
              <div className="border-t border-gray-100 pt-4 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Map PMB locations to your branches</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Sub-locations take priority over the parent library. Copies with no mapping are imported without a branch.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      const bRes = await fetch("/api/branches").catch(() => null);
                      if (bRes?.ok) setSystemBranches(await bRes.json());
                    }}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 shrink-0 mt-0.5">
                    <RefreshCw className="w-3 h-3" /> Refresh
                  </button>
                </div>

                {systemBranches.length === 0 && (
                  <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                    <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div className="text-xs text-amber-800">
                      <p className="font-semibold">No branches found in your system.</p>
                      <p className="mt-0.5">
                        Go to{" "}
                        <a href={`/${locale}/admin/taxonomy?tab=branches`} target="_blank" className="underline font-medium">
                          Taxonomy → Branches
                        </a>{" "}
                        to create your branches first, then click <strong>Refresh</strong> above.
                      </p>
                    </div>
                  </div>
                )}

                {(preview.lenderSummary ?? []).map((lender) => (
                  <div key={lender.id} className="rounded-xl border border-gray-100 overflow-hidden">
                    {/* Lender row */}
                    <div className="flex items-center gap-3 px-4 py-2.5 bg-gray-50">
                      <Landmark className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-semibold text-gray-800">{lender.name}</span>
                        <span className="ml-2 text-xs text-gray-400">{lender.copies.toLocaleString()} copies</span>
                      </div>
                      {/* Lender-level fallback (only shown when no sub-locations) */}
                      {lender.locations.length === 0 && (
                        <>
                          <span className="text-gray-300 text-xs">→</span>
                          <select
                            value={branchMap[lender.id] ?? ""}
                            onChange={(e) => setBranchMap((p) => ({ ...p, [lender.id]: e.target.value || null }))}
                            className="w-48 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                            <option value="">No branch</option>
                            {systemBranches.map((b) => (
                              <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                          </select>
                        </>
                      )}
                    </div>

                    {/* Sub-location rows */}
                    {lender.locations.length > 0 && (
                      <div className="divide-y divide-gray-50">
                        {lender.locations.map((loc) => (
                          <div key={loc.id} className="flex items-center gap-3 px-5 py-2.5 bg-white">
                            <MapPin className="w-3 h-3 text-gray-300 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <span className="text-sm text-gray-700 font-medium">{loc.name}</span>
                              <span className="ml-2 text-xs text-gray-400">{loc.copies.toLocaleString()} copies</span>
                            </div>
                            <span className="text-gray-300 text-xs">→</span>
                            <select
                              value={locationMap[loc.id] ?? ""}
                              onChange={(e) => setLocationMap((p) => ({ ...p, [loc.id]: e.target.value || null }))}
                              className="w-48 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                              <option value="">No branch</option>
                              {systemBranches.map((b) => (
                                <option key={b.id} value={b.id}>{b.name}</option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {dryRun && (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                <Info className="w-4 h-4 flex-shrink-0" />
                Dry run mode: the system will report what <em>would</em> be imported without writing to the database.
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep("preview")}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
              ← Back
            </button>
            <button onClick={runMigration}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 active:scale-[0.98] transition-all">
              <Play className="w-4 h-4" />
              {dryRun ? "Run Dry Run" : "Start Migration"}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 4: Running ── */}
      {step === "running" && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10 text-center space-y-4">
          <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          </div>
          <div>
            <p className="font-bold text-gray-900 text-lg">Migration in progress…</p>
            <p className="text-sm text-gray-400 mt-1">
              Importing{" "}
              {[
                importBooks   && preview?.notices   ? `${preview.notices.toLocaleString()} books` : null,
                importCopies  && preview?.exemplaires ? `${preview.exemplaires.toLocaleString()} copies` : null,
                importMembers && preview?.empr        ? `${preview.empr.toLocaleString()} members` : null,
              ].filter(Boolean).join(", ") || "selected records"}.
              {" "}This may take several minutes — please keep this tab open.
            </p>
          </div>
        </div>
      )}

      {/* ── STEP 5: Done ── */}
      {step === "done" && result && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-green-50 rounded-2xl flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-green-500" />
              </div>
              <div>
                <h2 className="text-base font-extrabold text-gray-900">
                  {result.dryRun ? "Dry run complete" : "Migration complete!"}
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {result.dryRun ? "No data was written — this was a preview run." : "All records have been imported into PVD."}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Authors",     icon: Users,     data: result.authors,    color: "text-violet-700 bg-violet-50" },
                { label: "Publishers",  icon: Building2, data: result.publishers, color: "text-emerald-700 bg-emerald-50" },
                { label: "Categories",  icon: Tag,       data: result.categories, color: "text-amber-700 bg-amber-50" },
                { label: "Books",       icon: BookOpen,  data: result.books,      color: "text-blue-700 bg-blue-50" },
              { label: "Members",     icon: Users,     data: result.members,    color: "text-teal-700 bg-teal-50" },
              ].map(({ label, icon: Icon, data, color }) => (
                <div key={label} className={`${color} rounded-xl p-4`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className="w-4 h-4" />
                    <p className="text-sm font-bold">{label}</p>
                  </div>
                  <p className="text-2xl font-extrabold">{(data.created ?? 0).toLocaleString()}</p>
                  <p className="text-xs opacity-70 mt-0.5">
                    created
                    {(data.skipped ?? 0) > 0 ? ` · ${data.skipped.toLocaleString()} skipped` : ""}
                    {(data as typeof result.books).updated ? ` · ${(data as typeof result.books).updated} ISBN fixed` : ""}
                    {(data as typeof result.books).errors > 0 ? ` · ${(data as typeof result.books).errors} errors` : ""}
                  </p>
                </div>
              ))}
            </div>

            {result.copies.created > 0 && (
              <div className="mt-3 flex items-center gap-3 bg-rose-50 rounded-xl p-4">
                <Copy className="w-5 h-5 text-rose-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-rose-700">Physical Copies</p>
                  <p className="text-2xl font-extrabold text-rose-700">{result.copies.created.toLocaleString()}</p>
                  <p className="text-xs text-rose-500 mt-0.5">
                    Available copies imported
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button onClick={reset}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
              <RotateCcw className="w-4 h-4" /> Run another migration
            </button>
            <Link href={`/${locale}/admin/books`}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors">
              <BookOpen className="w-4 h-4" /> View imported books →
            </Link>
          </div>
        </div>
      )}
      {/* ══════════════════════════════════════════════════════
          REGENERATE MEMBER IDs (post-migration cleanup)
      ══════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Hash className="w-5 h-5 text-violet-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-bold text-gray-900">Regenerate Member IDs</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Replaces temporary <code className="bg-gray-100 px-1 rounded text-xs">PMB-…</code> IDs
              assigned during migration with proper system IDs in the{" "}
              <code className="bg-gray-100 px-1 rounded text-xs">MEM-YYYY-XXXX</code> format.
            </p>
          </div>
          <button onClick={loadRegenCount} className="text-gray-400 hover:text-gray-600 transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Count badge */}
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium ${
          regenCount === null  ? "bg-gray-50 text-gray-400" :
          regenCount === 0     ? "bg-green-50 text-green-700" :
                                 "bg-amber-50 text-amber-700"
        }`}>
          {regenCount === null  && <Loader2 className="w-4 h-4 animate-spin" />}
          {regenCount === 0     && <CheckCircle2 className="w-4 h-4" />}
          {regenCount !== null && regenCount > 0 && <AlertCircle className="w-4 h-4" />}
          {regenCount === null  ? "Checking…"
            : regenCount === 0  ? "All member IDs are already in the system format ✓"
            : `${regenCount} member${regenCount !== 1 ? "s" : ""} still have PMB-… IDs`}
        </div>

        {regenErr && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {regenErr}
          </div>
        )}

        {regenResult && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700 font-medium">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            Done — {regenResult.updated} ID{regenResult.updated !== 1 ? "s" : ""} regenerated
            {regenResult.skipped > 0 && `, ${regenResult.skipped} skipped`}
          </div>
        )}

        {/* Confirm / preview panel */}
        {regenConfirm && regenPreview.length > 0 && (
          <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold text-amber-800 flex items-center gap-2">
              <Eye className="w-4 h-4" /> Preview — first {regenPreview.length} IDs that will change:
            </p>
            <div className="divide-y divide-amber-100 max-h-48 overflow-y-auto rounded-lg border border-amber-200 bg-white text-xs">
              {regenPreview.map((r) => (
                <div key={r.oldId} className="flex items-center gap-3 px-3 py-2">
                  <span className="font-mono text-red-500 line-through w-32 flex-shrink-0">{r.oldId}</span>
                  <span className="text-gray-400">→</span>
                  <span className="font-mono text-green-600 w-36 flex-shrink-0">{r.newId}</span>
                  <span className="text-gray-500 truncate">{r.name}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-amber-700">
              All {regenCount} PMB-… members will be updated. This cannot be undone — back up first if needed.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setRegenConfirm(false)}
                className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={runRegenApply} disabled={regenBusy}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors">
                {regenBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                Apply to All {regenCount} Members
              </button>
            </div>
          </div>
        )}

        {regenCount !== null && regenCount > 0 && !regenConfirm && (
          <button onClick={runRegenPreview} disabled={regenBusy}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors">
            {regenBusy
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Preparing…</>
              : <><Eye className="w-4 h-4" /> Preview & Regenerate IDs</>}
          </button>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════
          STATS SNAPSHOT
      ══════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-blue-500" /> Migration Stats
          </h2>
          <button onClick={loadStats} disabled={statsBusy} className="text-gray-400 hover:text-gray-600 transition-colors">
            {statsBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </button>
        </div>
        {stats ? (
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Books",             v1: `${stats.books.total.toLocaleString()} total`,         v2: `${stats.books.withPvdBarcode} PVD barcodes · ${stats.books.withPmbNoticeId} linked · ${stats.books.withCallNumber} call numbers`, color: "bg-blue-50 text-blue-700" },
              { label: "Copies",            v1: `${stats.copies.total.toLocaleString()} total`,        v2: `${stats.copies.available} available · ${stats.copies.borrowed} borrowed · ${stats.copies.withOrigBarcode} old barcodes stored`, color: "bg-rose-50 text-rose-700" },
              { label: "Members",           v1: `${stats.members.total.toLocaleString()} total`,       v2: `${stats.members.withStudentId} with student ID · ${stats.members.missingStudentId} missing`, color: "bg-teal-50 text-teal-700" },
              { label: "Loans",             v1: `${stats.loans.total.toLocaleString()} total`,         v2: `${stats.loans.active} active · ${stats.loans.overdue} overdue`, color: "bg-amber-50 text-amber-700" },
            ].map(({ label, v1, v2, color }) => (
              <div key={label} className={`${color} rounded-xl p-3`}>
                <p className="text-xs font-bold uppercase tracking-wide opacity-60 mb-1">{label}</p>
                <p className="text-sm font-bold">{v1}</p>
                <p className="text-xs opacity-70 mt-0.5">{v2}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading stats…
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════
          DEBUG — DIAGNOSE LOAN MIGRATION ISSUES
      ══════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Search className="w-5 h-5 text-gray-500" />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900">Diagnose Loan Migration</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Run this if loans show 0. Checks whether the <code className="bg-gray-100 px-1 rounded text-xs">pret</code> table was parsed,
              whether books have <code className="bg-gray-100 px-1 rounded text-xs">pmbNoticeId</code> set,
              and whether members have <code className="bg-gray-100 px-1 rounded text-xs">studentId</code>.
            </p>
          </div>
        </div>
        {debugErr && <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700"><AlertCircle className="w-4 h-4 flex-shrink-0" />{debugErr}</div>}
        {debugResult && (
          <div className="space-y-3">
            {/* Diagnosis */}
            <div className="space-y-1.5">
              {debugResult.diagnosis.map((d, i) => (
                <div key={i} className={`text-sm px-3 py-2 rounded-lg font-mono ${d.startsWith("✅") ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>{d}</div>
              ))}
            </div>
            {/* Parsed counts */}
            <div className="grid grid-cols-3 gap-2 text-xs">
              {Object.entries(debugResult.parsed as Record<string,unknown>).filter(([k]) => k !== "pretSample").map(([k, v]) => (
                <div key={k} className="bg-gray-50 rounded-lg p-2">
                  <p className="text-gray-400">{k}</p>
                  <p className="font-bold text-gray-800">{String(v)}</p>
                </div>
              ))}
            </div>
            {/* Sample pret rows */}
            {(debugResult.parsed as {pretSample: Record<string,unknown>[]}).pretSample?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1">Sample pret rows:</p>
                <div className="overflow-x-auto rounded-lg border border-gray-100">
                  <table className="text-xs w-full">
                    <thead className="bg-gray-50 text-gray-400">
                      <tr>{Object.keys((debugResult.parsed as {pretSample: Record<string,unknown>[]}).pretSample[0]).map(k => <th key={k} className="px-2 py-1 text-left font-medium">{k}</th>)}</tr>
                    </thead>
                    <tbody>
                      {(debugResult.parsed as {pretSample: Record<string,unknown>[]}).pretSample.map((row, i) => (
                        <tr key={i} className="border-t border-gray-50">
                          {Object.values(row).map((v, j) => <td key={j} className="px-2 py-1 font-mono">{String(v)}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {/* Loan sample */}
            {debugResult.loanSample && (
              <div className="bg-blue-50 rounded-xl p-3 text-xs space-y-1">
                <p className="font-semibold text-blue-800 mb-1">First active loan check:</p>
                <p>expl_id: <strong>{String((debugResult.loanSample as Record<string,unknown>).expl_id)}</strong> → noticeId: <strong>{String((debugResult.loanSample as Record<string,unknown>).noticeId)}</strong> → book: <strong>{(debugResult.loanSample as Record<string,unknown>).bookFound ? JSON.stringify((debugResult.loanSample as Record<string,unknown>).bookFound) : "❌ NOT FOUND"}</strong></p>
                <p>empr_id: <strong>{String((debugResult.loanSample as Record<string,unknown>).empr_id)}</strong> → empr_cb: <strong>{String((debugResult.loanSample as Record<string,unknown>).emprCb)}</strong> → member: <strong>{(debugResult.loanSample as Record<string,unknown>).memberFound ? JSON.stringify((debugResult.loanSample as Record<string,unknown>).memberFound) : "❌ NOT FOUND"}</strong></p>
              </div>
            )}
          </div>
        )}
        <button onClick={runDebug} disabled={debugBusy || !sqlContent}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-600 text-white text-sm font-semibold hover:bg-gray-700 disabled:opacity-50 transition-colors">
          {debugBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          {debugBusy ? "Diagnosing…" : "Run Diagnosis"}
        </button>
        {!sqlContent && <p className="text-xs text-amber-600">⚠ Upload the PMB dump above first</p>}
      </div>

      {/* ══════════════════════════════════════════════════════
          BACKFILL NOTICE ID ON EXISTING BOOKS
      ══════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Link2 className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900">Backfill Book Notice IDs</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              If books were imported before <code className="bg-gray-100 px-1 rounded text-xs">pmbNoticeId</code> was added,
              run this to stamp each book with its original PMB notice ID.
              Required for loan migration to find the right book.
              Matches by <strong>ISBN first</strong>, then <strong>Title + Author</strong>.
            </p>
          </div>
        </div>
        {backfillErr && <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700"><AlertCircle className="w-4 h-4 flex-shrink-0" />{backfillErr}</div>}
        {backfillResult && (
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Total notices", value: backfillResult.total,      color: "bg-gray-50 text-gray-600" },
              { label: "Stamped",       value: backfillResult.stamped,    color: "bg-green-50 text-green-700" },
              { label: "Already set",  value: backfillResult.alreadySet, color: "bg-blue-50 text-blue-600" },
              { label: "Not found",    value: backfillResult.notFound,   color: backfillResult.notFound > 0 ? "bg-amber-50 text-amber-700" : "bg-gray-50 text-gray-400" },
            ].map(({ label, value, color }) => (
              <div key={label} className={`${color} rounded-xl p-3 text-center`}>
                <p className="text-2xl font-extrabold">{value.toLocaleString()}</p>
                <p className="text-xs mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        )}
        <button onClick={runBackfillNoticeId} disabled={backfillBusy || !sqlContent}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
          {backfillBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
          {backfillBusy ? "Running…" : "Backfill Notice IDs"}
        </button>
        {!sqlContent && <p className="text-xs text-amber-600">⚠ Upload the PMB dump above first</p>}
      </div>

      {/* ══════════════════════════════════════════════════════
          MISSING DATA CHECK
      ══════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900">Missing Data Check</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Compares the PMB dump against the database to find books, copies and members that were not imported.
            </p>
          </div>
        </div>

        {missingErr && <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700"><AlertCircle className="w-4 h-4 flex-shrink-0" />{missingErr}</div>}

        {missingResult && (
          <div className="space-y-4">
            {/* DB breakdown */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm space-y-2">
              <p className="font-semibold text-gray-700 text-xs uppercase tracking-wide">Database vs PMB breakdown</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                {[
                  { label: "Total DB books",       value: missingResult.dbBreakdown.totalBooks,        color: "text-gray-800" },
                  { label: "Imported from PMB",     value: missingResult.dbBreakdown.importedFromPmb,   color: "text-blue-700" },
                  { label: "Manual / demo",         value: missingResult.dbBreakdown.manualOrDemo,      color: "text-gray-500" },
                  { label: "PMB notices matched",   value: missingResult.dbBreakdown.pmbNoticesMatched, color: "text-green-700" },
                  { label: "PMB notices missing",   value: missingResult.dbBreakdown.pmbNoticesMissing, color: missingResult.dbBreakdown.pmbNoticesMissing > 0 ? "text-red-600" : "text-green-700" },
                  { label: "Duplicate mappings",    value: missingResult.dbBreakdown.duplicateMappings, color: missingResult.dbBreakdown.duplicateMappings > 0 ? "text-amber-600" : "text-green-700" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-white rounded-lg p-2 border border-gray-100">
                    <p className={`text-lg font-extrabold ${color}`}>{value.toLocaleString()}</p>
                    <p className="text-gray-400">{label}</p>
                  </div>
                ))}
              </div>
              {missingResult.dbBreakdown.duplicateMappings > 0 && (
                <div>
                  <p className="text-xs font-semibold text-amber-700 mb-1">
                    ⚠ {missingResult.dbBreakdown.duplicateMappings} DB books have 2+ PMB notices mapped to them (showing first 20)
                  </p>
                  <div className="space-y-1.5 max-h-52 overflow-y-auto">
                    {missingResult.dbBreakdown.duplicateDetails.map((d) => (
                      <div key={d.bookId} className="text-xs bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                        <p className="font-semibold text-gray-800 mb-1">DB book: <span className="text-indigo-700">{d.title}</span></p>
                        <div className="pl-2 border-l-2 border-amber-300 space-y-0.5">
                          {d.noticeIds.map((id) => {
                            const n = missingResult.missingNotices.find((x) => x.noticeId === id);
                            return (
                              <p key={id} className="text-gray-600">
                                <span className="font-mono text-amber-600 mr-1.5">#{id}</span>
                                {n ? <><span className="font-medium">{n.title}</span>{n.isbn && <span className="text-gray-400 ml-1.5">{n.isbn}</span>}</> : <span className="text-gray-400">same title</span>}
                              </p>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-1.5">
                    If notices are <strong>different books</strong> with the same title → click <strong>Fix Duplicate Mappings</strong> to import them separately.<br/>
                    If they are <strong>the same book</strong> (different editions of the same title) → they are already correctly merged, no action needed.
                  </p>
                </div>
              )}
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { key: "notices"    as const, label: "Books (notices)",    color: missingResult.summary.notices.missing     > 0 ? "bg-red-50 text-red-700"    : "bg-green-50 text-green-700" },
                { key: "exemplaires"as const, label: "Copies (exemplaires)",color: missingResult.summary.exemplaires.missingAvailable > 0 ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700" },
                { key: "members"    as const, label: "Members (empr)",     color: missingResult.summary.members.missing     > 0 ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700" },
              ].map(({ key, label, color }) => (
                <button key={key} onClick={() => setMissingTab(key)}
                  className={`${color} rounded-xl p-3 text-left border-2 transition-colors ${missingTab === key ? "border-current" : "border-transparent"}`}>
                  <p className="text-2xl font-extrabold">
                    {key === "exemplaires"
                      ? missingResult.summary.exemplaires.missingAvailable
                      : missingResult.summary[key].missing}
                  </p>
                  <p className="text-xs mt-0.5 font-medium">missing {label}</p>
                  <p className="text-xs opacity-60 mt-0.5">
                    of {missingResult.summary[key].total} total
                    {key === "exemplaires" && missingResult.summary.exemplaires.missingOnLoan > 0
                      ? ` · ${missingResult.summary.exemplaires.missingOnLoan} on loan (expected)`
                      : ""}
                  </p>
                </button>
              ))}
            </div>

            {/* Detail table */}
            <div className="border border-gray-100 rounded-xl overflow-hidden">
              <div className="max-h-64 overflow-y-auto">
                {/* Books tab */}
                {missingTab === "notices" && (
                  missingResult.missingNotices.length === 0 ? (
                    <p className="text-center text-green-600 text-sm py-6">✅ All books imported</p>
                  ) : (
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 text-gray-400 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Notice ID</th>
                          <th className="px-3 py-2 text-left font-medium">Title</th>
                          <th className="px-3 py-2 text-left font-medium">Author</th>
                          <th className="px-3 py-2 text-left font-medium">ISBN</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {missingResult.missingNotices.map((r) => (
                          <tr key={r.noticeId} className="hover:bg-gray-50">
                            <td className="px-3 py-2 font-mono text-gray-400">{r.noticeId}</td>
                            <td className="px-3 py-2 font-medium text-gray-800 max-w-[200px] truncate">{r.title}</td>
                            <td className="px-3 py-2 text-gray-500 truncate">{r.author || "—"}</td>
                            <td className="px-3 py-2 font-mono text-gray-400">{r.isbn || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                )}

                {/* Copies tab */}
                {missingTab === "exemplaires" && (
                  missingResult.missingExemplaires.filter((e) => !e.isOnLoan).length === 0 ? (
                    <p className="text-center text-green-600 text-sm py-6">✅ All available copies imported</p>
                  ) : (
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 text-gray-400 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Expl ID</th>
                          <th className="px-3 py-2 text-left font-medium">Old Barcode</th>
                          <th className="px-3 py-2 text-left font-medium">Title</th>
                          <th className="px-3 py-2 text-left font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {missingResult.missingExemplaires.filter((e) => !e.isOnLoan).map((r) => (
                          <tr key={r.exemplaireId} className="hover:bg-gray-50">
                            <td className="px-3 py-2 font-mono text-gray-400">{r.exemplaireId}</td>
                            <td className="px-3 py-2 font-mono text-indigo-600">{r.barcode || "—"}</td>
                            <td className="px-3 py-2 font-medium text-gray-800 max-w-[200px] truncate">{r.title}</td>
                            <td className="px-3 py-2">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${r.isOnLoan ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                                {r.isOnLoan ? "on loan" : "missing"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                )}

                {/* Members tab */}
                {missingTab === "members" && (
                  missingResult.missingMembers.length === 0 ? (
                    <p className="text-center text-green-600 text-sm py-6">✅ All members imported</p>
                  ) : (
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 text-gray-400 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Empr ID</th>
                          <th className="px-3 py-2 text-left font-medium">Name</th>
                          <th className="px-3 py-2 text-left font-medium">Card Barcode</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {missingResult.missingMembers.map((r) => (
                          <tr key={r.emprId} className="hover:bg-gray-50">
                            <td className="px-3 py-2 font-mono text-gray-400">{r.emprId}</td>
                            <td className="px-3 py-2 font-medium text-gray-800">{r.name}</td>
                            <td className="px-3 py-2 font-mono text-indigo-600">{r.cb || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                )}
              </div>
            </div>
          </div>
        )}

        {importCopiesResult && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-1 text-sm">
            <p className="font-semibold text-blue-800">Copies imported</p>
            <p className="text-blue-700">
              Found {importCopiesResult.found} missing · ✅ {importCopiesResult.imported} imported
              {importCopiesResult.noBook > 0 && ` · ⚠ ${importCopiesResult.noBook} book not found`}
              {importCopiesResult.skipped > 0 && ` · ❌ ${importCopiesResult.skipped} errors`}
            </p>
            {importCopiesResult.errors.length > 0 && (
              <div className="mt-1 space-y-0.5">
                {importCopiesResult.errors.map((e, i) => <p key={i} className="text-xs text-red-600 font-mono">{e}</p>)}
              </div>
            )}
          </div>
        )}

        {fixDupResult && (
          <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            Fixed {fixDupResult.groupsFixed} groups · {fixDupResult.booksImported} books imported
            {fixDupResult.errors > 0 && <span className="text-red-600 ml-1">· {fixDupResult.errors} errors</span>}
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          <button onClick={runMissingCheck} disabled={missingBusy || !sqlContent}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 disabled:opacity-50 transition-colors">
            {missingBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
            {missingBusy ? "Checking…" : "Check Missing Data"}
          </button>
          {/* Only show Fix Duplicates for ISBN-matched duplicates (truly different books).
              Title-only duplicates are same book different editions — already correctly merged. */}
          {missingResult && missingResult.dbBreakdown.duplicateDetails.some(d =>
            missingResult.missingNotices.some(n => d.noticeIds.includes(n.noticeId) && n.isbn)
          ) && (
            <button onClick={runFixDuplicates} disabled={missingBusy || !sqlContent}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors">
              {missingBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
              Fix ISBN Duplicate Mappings
            </button>
          )}
          {missingResult && missingResult.summary.exemplaires.missingAvailable > 0 && (
            <button onClick={runImportMissingCopies} disabled={missingBusy || !sqlContent}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {missingBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
              Import {missingResult.summary.exemplaires.missingAvailable} Missing Copies
            </button>
          )}
        </div>
        {!sqlContent && <p className="text-xs text-amber-600">⚠ Upload the PMB dump above first</p>}
      </div>

      {/* ══════════════════════════════════════════════════════
          STEP 2 — MIGRATE ACTIVE LOANS
      ══════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <History className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900">Migrate Active Loans</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              For each active PMB loan — creates a new <strong>BORROWED</strong> copy on the book
              with a high copy number (<code className="bg-gray-100 px-1 rounded text-xs">-L001</code> suffix)
              and links it to the member. Stores the original PMB barcode for lookup when the member returns the book.
              <br />Requires the PMB dump to be uploaded above first.
            </p>
          </div>
        </div>
        {/* Rollback */}
        {rollbackResult && (
          <div className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium ${rollbackResult.message ? "bg-gray-50 text-gray-500" : "bg-green-50 text-green-700"}`}>
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            {rollbackResult.message ?? `Rolled back — ${rollbackResult.loansDeleted} loans · ${rollbackResult.copiesDeleted} copies removed · ${rollbackResult.booksUpdated} books updated`}
          </div>
        )}
        {rollbackPreview && (
          <div className="border border-gray-200 rounded-xl p-4 space-y-2 bg-gray-50 text-sm">
            <p className="font-semibold text-gray-700">
              Found <strong>{rollbackPreview.totalCopies}</strong> copies with pmbId · <strong>{rollbackPreview.totalLoans}</strong> loans
            </p>
            {rollbackPreview.sample.length > 0 ? (
              <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                {rollbackPreview.sample.map((c, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-1.5 text-xs bg-white">
                    <span className="font-mono text-indigo-600 w-32 shrink-0">{c.barcode ?? "no barcode"}</span>
                    <span className="text-gray-400">copy #{c.copyNumber}</span>
                    <span className={`ml-auto font-semibold ${c.status === "BORROWED" ? "text-amber-600" : "text-green-600"}`}>{c.status}</span>
                    <span className="text-gray-300 font-mono">pmb:{c.pmbId}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-400 text-xs">No copies with pmbId found in DB</p>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={previewRollback} disabled={rollbackBusy}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50 transition-colors">
            {rollbackBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
            Preview
          </button>
          <button onClick={runRollbackLoans} disabled={rollbackBusy}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50 disabled:opacity-50 transition-colors">
            {rollbackBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
            {rollbackBusy ? "Rolling back…" : "Rollback Loan Import"}
          </button>
        </div>

        {loanErr && <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700"><AlertCircle className="w-4 h-4 flex-shrink-0" />{loanErr}</div>}
        {loanResult?.lastError && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span><strong>Last error:</strong> {loanResult.lastError}</span>
          </div>
        )}
        {loanResult && (
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Loans created",    value: loanResult.created,   color: "bg-green-50 text-green-700" },
              { label: "Skipped",          value: loanResult.skipped,   color: "bg-gray-50 text-gray-500" },
              { label: "Member not found", value: loanResult.noMember,  color: loanResult.noMember  > 0 ? "bg-amber-50 text-amber-700" : "bg-gray-50 text-gray-500" },
              { label: "Book not found",   value: loanResult.noBook,    color: loanResult.noBook > 0 ? "bg-red-50 text-red-700"   : "bg-gray-50 text-gray-500" },
            ].map(({ label, value, color }) => (
              <div key={label} className={`${color} rounded-xl p-3 text-center`}>
                <p className="text-2xl font-extrabold">{value.toLocaleString()}</p>
                <p className="text-xs mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        )}
        {/* Unmatched details */}
        {loanResult?.unmatched && (loanResult.unmatched.noBook.length > 0 || loanResult.unmatched.noMember.length > 0 || loanResult.unmatched.errors.length > 0) && (
          <div className="space-y-3">
            {loanResult.unmatched.noBook.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-red-600 mb-1">❌ Books not found ({loanResult.unmatched.noBook.length})</p>
                <div className="border border-red-100 rounded-xl overflow-hidden divide-y divide-red-50 max-h-40 overflow-y-auto">
                  {loanResult.unmatched.noBook.map((r) => (
                    <div key={r.pret_id} className="flex items-center gap-3 px-3 py-2 text-xs bg-red-50">
                      <span className="text-red-400 font-mono w-16 shrink-0">notice {r.noticeId}</span>
                      <span className="text-gray-700 truncate flex-1">{r.noticeTitle}</span>
                      <span className="text-gray-400">expl {r.expl_id}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {loanResult.unmatched.noMember.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-amber-600 mb-1">⚠ Members not found ({loanResult.unmatched.noMember.length})</p>
                <div className="border border-amber-100 rounded-xl overflow-hidden divide-y divide-amber-50 max-h-40 overflow-y-auto">
                  {loanResult.unmatched.noMember.map((r) => (
                    <div key={r.pret_id} className="flex items-center gap-3 px-3 py-2 text-xs bg-amber-50">
                      <span className="text-amber-500 font-mono w-20 shrink-0">empr {r.empr_id}</span>
                      <span className="text-gray-700 flex-1">{r.emprName}</span>
                      <span className="text-gray-400 font-mono">{r.emprCb ?? "no card"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {loanResult.unmatched.errors.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-red-600 mb-1">💥 Errors ({loanResult.unmatched.errors.length})</p>
                <div className="border border-red-100 rounded-xl overflow-hidden divide-y divide-red-50 max-h-40 overflow-y-auto">
                  {loanResult.unmatched.errors.slice(0, 20).map((r) => (
                    <div key={r.pret_id} className="flex items-start gap-3 px-3 py-2 text-xs bg-red-50">
                      <span className="text-red-400 font-mono w-16 shrink-0">pret {r.pret_id}</span>
                      <span className="text-red-700 flex-1 break-all">{r.error}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {fixResult && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-1 text-sm">
            <p className="font-semibold text-green-800">Fix complete</p>
            <p className="text-green-700">📚 {fixResult.booksImported} books imported · 👤 {fixResult.membersImported} members imported · 🔗 {fixResult.loansCreated} loans created</p>
            {fixResult.errors.length > 0 && (
              <div className="mt-2 space-y-1">
                {fixResult.errors.map((e, i) => (
                  <p key={i} className="text-xs text-red-600 font-mono">{e}</p>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          <button onClick={runMigrateLoans} disabled={loanBusy || !sqlContent}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-50 transition-colors">
            {loanBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <History className="w-4 h-4" />}
            {loanBusy ? "Migrating…" : "Migrate Active Loans"}
          </button>
          {loanResult?.unmatched && (loanResult.unmatched.noBook.length > 0 || loanResult.unmatched.noMember.length > 0) && (
            <button onClick={runFixUnmatched} disabled={loanBusy || !sqlContent}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors">
              {loanBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
              Fix {(loanResult.unmatched.noBook.length + loanResult.unmatched.noMember.length)} Unmatched & Retry
            </button>
          )}
        </div>
        {!sqlContent && <p className="text-xs text-amber-600">⚠ Upload the PMB dump above first</p>}
      </div>

      {/* ══════════════════════════════════════════════════════
          OLD BARCODE LOOKUP
      ══════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Search className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900">Old Barcode Lookup</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              When a member returns a book with the old PMB label, scan or type the old barcode to find the new PVD copy.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" value={lookupQ} onChange={(e) => setLookupQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runLookup()}
              placeholder="Enter old PMB barcode…"
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          <button onClick={runLookup} disabled={lookupBusy || !lookupQ.trim()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            {lookupBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          </button>
        </div>
        {lookupResult && (
          lookupResult.found ? (
            <div className="border border-green-200 bg-green-50 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span className="text-sm font-semibold text-green-800">Found</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-gray-500 text-xs">Old barcode</span><p className="font-mono font-bold text-red-600 line-through">{lookupResult.oldBarcode}</p></div>
                <div><span className="text-gray-500 text-xs">New barcode</span><p className="font-mono font-bold text-green-700">{lookupResult.newBarcode ?? "—"}</p></div>
                <div><span className="text-gray-500 text-xs">Book</span><p className="font-medium text-gray-800">{lookupResult.book?.title}</p></div>
                <div><span className="text-gray-500 text-xs">Copy #</span><p className="font-medium text-gray-800">{lookupResult.copyNumber} · <span className={`font-semibold ${lookupResult.status === "BORROWED" ? "text-amber-600" : "text-green-600"}`}>{lookupResult.status}</span></p></div>
                {lookupResult.loan && <>
                  <div><span className="text-gray-500 text-xs">Borrowed by</span><p className="font-medium text-gray-800">{lookupResult.loan.memberName} <span className="text-gray-400 font-normal">({lookupResult.loan.memberId})</span></p></div>
                  <div><span className="text-gray-500 text-xs">Due date</span><p className="font-medium text-gray-800">{lookupResult.loan.dueDate ?? "—"}</p></div>
                </>}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
              <XCircle className="w-4 h-4 flex-shrink-0" /> No copy found for barcode <strong className="font-mono ml-1">{lookupResult.oldBarcode}</strong>
            </div>
          )
        )}
      </div>

      {/* ══════════════════════════════════════════════════════
          STEP 5 — VALIDATE
      ══════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900">Validate Migration</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Checks all data relations — books, copies, members, loans and cross-references.
              Run this after all steps are complete.
            </p>
          </div>
        </div>

        {validateErr && <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700"><AlertCircle className="w-4 h-4 flex-shrink-0" />{validateErr}</div>}

        {validateResult && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Errors",   value: validateResult.summary.errors,   color: validateResult.summary.errors   > 0 ? "bg-red-50 text-red-700"   : "bg-gray-50 text-gray-400", icon: XCircle },
                { label: "Warnings", value: validateResult.summary.warnings, color: validateResult.summary.warnings > 0 ? "bg-amber-50 text-amber-700" : "bg-gray-50 text-gray-400", icon: AlertTriangle },
                { label: "Passed",   value: validateResult.summary.passed,   color: "bg-green-50 text-green-700", icon: CheckCircle2 },
              ].map(({ label, value, color, icon: Icon }) => (
                <div key={label} className={`${color} rounded-xl p-3 flex items-center gap-3`}>
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  <div>
                    <p className="text-2xl font-extrabold leading-none">{value}</p>
                    <p className="text-xs mt-0.5">{label}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Checks grouped */}
            {["Books","Copies","Members","Loans","Cross-checks"].map((group) => {
              const items = validateResult.checks.filter((c) => c.group === group);
              return (
                <div key={group}>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{group}</p>
                  <div className="border border-gray-100 rounded-xl overflow-hidden divide-y divide-gray-50">
                    {items.map((c) => (
                      <div key={c.label} className="flex items-center gap-3 px-4 py-2.5">
                        {c.status === "ok"    && <CheckCircle2  className="w-4 h-4 text-green-500 flex-shrink-0" />}
                        {c.status === "warn"  && <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />}
                        {c.status === "error" && <XCircle       className="w-4 h-4 text-red-500   flex-shrink-0" />}
                        {c.status === "info"  && <Info          className="w-4 h-4 text-blue-400  flex-shrink-0" />}
                        <span className="flex-1 text-sm text-gray-700">{c.label}</span>
                        <span className={`text-sm font-bold tabular-nums ${
                          c.status === "error" ? "text-red-600" :
                          c.status === "warn"  ? "text-amber-600" :
                          c.status === "ok"    ? "text-green-600" : "text-blue-600"
                        }`}>{c.count.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <button onClick={runValidate} disabled={validateBusy}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors">
          {validateBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
          {validateBusy ? "Validating…" : "Run Validation"}
        </button>
      </div>

    </div>
  );
}
