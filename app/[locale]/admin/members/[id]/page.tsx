"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import {
  ArrowLeft, User, BookOpen, DollarSign, Calendar,
  CheckCircle2, AlertTriangle, Clock, RefreshCw, Loader2,
  ShieldAlert, ShieldCheck, ShieldX, ShieldOff, Shield,
  AlertCircle, CheckCircle, Plus, FileText, X, Send, Phone,
} from "lucide-react";
import MemberForm from "@/components/admin/MemberForm";

/* ── Types ─────────────────────────────────────────────────────────────────── */

interface Member {
  id: string; memberId: string; name: string; email: string | null;
  phone: string | null; address: string | null;
  memberType: string; isActive: boolean;
  expireDate: string | null; joinDate: string; createdAt: string;
  restrictionStatus: string;
  restrictionReason: string | null;
  restrictedAt: string | null;
  restrictedBy: string | null;
  restrictionExpiry: string | null;
  telegramChatId:   string | null;
  telegramLinkedAt: string | null;
}

interface Loan {
  id: string; status: string; borrowDate: string; dueDate: string; returnDate: string | null;
  renewalCount: number;
  book: { title: string; isbn: string | null; author: { name: string } | null };
  fine: { amount: number; status: string } | null;
}

interface Fine {
  id: string; amount: number; daysLate: number; status: string;
  paidAt: string | null; createdAt: string;
  loan: { book: { title: string } };
}

interface Incident {
  id: string;
  type: string;
  description: string;
  severity: number;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolution: string | null;
  actorName: string | null;
  createdAt: string;
}

/* ── Restriction config ─────────────────────────────────────────────────────── */

const RESTRICTION_LEVELS = [
  { value: "IN_LIBRARY_ONLY", label: "In-Library Only",
    desc: "Can log in and read in-library. Home loans blocked.", color: "bg-blue-100 text-blue-700", Icon: ShieldOff },
  { value: "SUSPENDED",       label: "Suspended",
    desc: "Can log in but cannot borrow or reserve anything.", color: "bg-amber-100 text-amber-700", Icon: ShieldAlert },
  { value: "BLOCKED",         label: "Blocked",
    desc: "Cannot log in. Temporary — set an expiry date.", color: "bg-red-100 text-red-700", Icon: ShieldX },
  { value: "BLACKLISTED",     label: "Blacklisted",
    desc: "Permanently flagged. Login denied. Admin override required to lift.", color: "bg-gray-900 text-white", Icon: ShieldX },
] as const;

const INCIDENT_TYPES = [
  { value: "BOOK_DAMAGE",       label: "Book Damaged" },
  { value: "BOOK_LOST",         label: "Book Lost / Not Returned" },
  { value: "REPEATED_LATE",     label: "Repeated Late Returns" },
  { value: "BEHAVIORAL",        label: "Behavioral Issue" },
  { value: "POLICY_VIOLATION",  label: "Policy Violation" },
  { value: "OTHER",             label: "Other" },
] as const;

const SEVERITY_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: "Minor",    color: "bg-yellow-100 text-yellow-700" },
  2: { label: "Moderate", color: "bg-orange-100 text-orange-700" },
  3: { label: "Serious",  color: "bg-red-100 text-red-700" },
};

/** Convert a local or international phone number to a Telegram deep-link URL. */
function phoneToTelegramUrl(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const normalized =
    digits.startsWith("0") && digits.length >= 9 && digits.length <= 10
      ? "855" + digits.slice(1)
      : digits;
  return `https://t.me/+${normalized}`;
}

function restrictionBadge(status: string) {
  switch (status) {
    case "IN_LIBRARY_ONLY": return { label: "In-Library Only", color: "bg-blue-100 text-blue-700",   Icon: ShieldOff  };
    case "SUSPENDED":       return { label: "Suspended",       color: "bg-amber-100 text-amber-700", Icon: ShieldAlert };
    case "BLOCKED":         return { label: "Blocked",         color: "bg-red-100 text-red-700",     Icon: ShieldX    };
    case "BLACKLISTED":     return { label: "Blacklisted",     color: "bg-gray-900 text-white",      Icon: ShieldX    };
    default:                return null;
  }
}

const loanStatusStyle: Record<string, string> = {
  ACTIVE:   "bg-blue-100 text-blue-700",
  RETURNED: "bg-green-100 text-green-700",
  OVERDUE:  "bg-red-100 text-red-700",
};

const fineStatusStyle: Record<string, string> = {
  UNPAID: "bg-red-100 text-red-700",
  PAID:   "bg-green-100 text-green-700",
  WAIVED: "bg-gray-100 text-gray-500",
};

/* ── Page ───────────────────────────────────────────────────────────────────── */

export default function MemberDetailPage() {
  const params  = useParams<{ id: string }>();
  const locale  = useLocale();
  const t       = useTranslations("members");
  const id      = params.id;

  const [member,    setMember]    = useState<Member | null>(null);
  const [loans,     setLoans]     = useState<Loan[]>([]);
  const [fines,     setFines]     = useState<Fine[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [tab,       setTab]       = useState<"edit" | "loans" | "fines" | "discipline">("edit");
  const [loading,   setLoading]   = useState(true);
  const [phoneClickAction, setPhoneClickAction] = useState("both");

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [mRes, lRes, fRes, iRes] = await Promise.all([
      fetch(`/api/members/${id}`),
      fetch(`/api/loans?memberId=${id}&limit=50`),
      fetch(`/api/fines?memberId=${id}`),
      fetch(`/api/members/${id}/incidents`),
    ]);
    if (mRes.ok) setMember(await mRes.json());
    if (lRes.ok) setLoans(await lRes.json());
    if (fRes.ok) setFines(await fRes.json());
    if (iRes.ok) setIncidents(await iRes.json());
    setLoading(false);
  }, [id]);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.ok ? r.json() : {})
      .then((d: Record<string, string>) => {
        if (d.PHONE_CLICK_ACTION) setPhoneClickAction(d.PHONE_CLICK_ACTION);
      })
      .catch(() => {});
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading…
      </div>
    );
  }

  if (!member) {
    return <p className="text-center text-gray-500 py-16">Member not found.</p>;
  }

  const activeLoans   = loans.filter((l) => l.status !== "RETURNED");
  const returnedLoans = loans.filter((l) => l.status === "RETURNED");
  const unpaidFines   = fines.filter((f) => f.status === "UNPAID");
  const totalFines    = fines.reduce((s, f) => s + f.amount, 0);
  const openIncidents = incidents.filter((i) => !i.resolvedAt);

  const isExpired    = member.expireDate && new Date(member.expireDate) < new Date();
  const daysToExpiry = member.expireDate
    ? Math.ceil((new Date(member.expireDate).getTime() - Date.now()) / 86_400_000)
    : null;

  const rBadge = restrictionBadge(member.restrictionStatus);

  return (
    <div className="space-y-5">
      {/* ── Back + title ── */}
      <div className="flex items-center gap-3">
        <Link href={`/${locale}/admin/members`}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{member.name}</h1>
          <p className="text-sm text-gray-500">
            <span className="font-mono">{member.memberId}</span>
            &nbsp;·&nbsp;{member.memberType}
          </p>
          {member.phone && (
            <div className="flex items-center gap-2 mt-1">
              {phoneClickAction !== "telegram" && phoneClickAction !== "disabled" ? (
                <a
                  href={`tel:${member.phone}`}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 transition-colors"
                >
                  <Phone className="w-3 h-3" />
                  {member.phone}
                </a>
              ) : (
                <span className="flex items-center gap-1 text-xs text-gray-500">
                  <Phone className="w-3 h-3" />
                  {member.phone}
                </span>
              )}
              {(phoneClickAction === "both" || phoneClickAction === "telegram") && (
                <a
                  href={phoneToTelegramUrl(member.phone)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={member.telegramChatId ? "Open Telegram (account linked)" : "Open in Telegram"}
                  className={`flex items-center gap-1 text-xs transition-colors ${
                    member.telegramChatId
                      ? "text-sky-500 hover:text-sky-700 font-medium"
                      : "text-gray-400 hover:text-sky-400"
                  }`}
                >
                  <Send className="w-3 h-3" />
                  {member.telegramChatId ? "Telegram" : "Telegram?"}
                </a>
              )}
            </div>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">
          {rBadge && (
            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1 ${rBadge.color}`}>
              <rBadge.Icon className="w-3 h-3" /> {rBadge.label}
            </span>
          )}
          {/* Telegram link status */}
          {member.telegramChatId ? (
            <span
              className="px-2.5 py-1 rounded-full bg-sky-100 text-sky-700 text-xs font-semibold flex items-center gap-1"
              title={`Telegram linked${member.telegramLinkedAt ? " on " + new Date(member.telegramLinkedAt).toLocaleDateString() : ""}`}
            >
              <Send className="w-3 h-3" /> Telegram Linked
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-400 text-xs font-medium flex items-center gap-1">
              <Send className="w-3 h-3" /> No Telegram
            </span>
          )}
          {!member.isActive && (
            <span className="px-2.5 py-1 rounded-full bg-red-100 text-red-700 text-xs font-semibold">Inactive</span>
          )}
          {isExpired && (
            <span className="px-2.5 py-1 rounded-full bg-red-100 text-red-700 text-xs font-semibold flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Expired
            </span>
          )}
          {!isExpired && daysToExpiry !== null && daysToExpiry <= 30 && (
            <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold flex items-center gap-1">
              <Clock className="w-3 h-3" /> Expires in {daysToExpiry}d
            </span>
          )}
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Active Loans",   value: activeLoans.length,   icon: BookOpen,      color: "text-blue-600 bg-blue-50" },
          { label: "Total Loans",    value: loans.length,          icon: RefreshCw,     color: "text-violet-600 bg-violet-50" },
          { label: "Unpaid Fines",   value: unpaidFines.length,    icon: AlertTriangle, color: unpaidFines.length > 0 ? "text-red-600 bg-red-50" : "text-gray-400 bg-gray-50" },
          { label: "Open Incidents", value: openIncidents.length,  icon: ShieldAlert,   color: openIncidents.length > 0 ? "text-orange-600 bg-orange-50" : "text-gray-400 bg-gray-50" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
              <Icon className="w-4 h-4" />
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900">{value}</p>
              <p className="text-xs text-gray-500">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Tabs ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="border-b border-gray-100 flex overflow-x-auto">
          {[
            { key: "edit",       label: "Edit Info",              icon: User },
            { key: "loans",      label: `Loans (${loans.length})`, icon: BookOpen },
            { key: "fines",      label: `Fines (${fines.length})`, icon: DollarSign },
            { key: "discipline", label: `Discipline${openIncidents.length > 0 ? ` (${openIncidents.length})` : ""}`, icon: Shield },
          ].map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setTab(key as typeof tab)}
              className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                tab === key
                  ? "border-indigo-600 text-indigo-700 bg-indigo-50/40"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50"
              }`}>
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {/* ── Edit tab ── */}
          {tab === "edit" && (
            <MemberForm initial={{
              id:         member.id,
              name:       member.name,
              email:      member.email ?? undefined,
              phone:      member.phone ?? undefined,
              address:    member.address ?? undefined,
              memberType: member.memberType as never,
              isActive:   member.isActive,
              expireDate: member.expireDate ?? undefined,
            }} />
          )}

          {/* ── Loans tab ── */}
          {tab === "loans" && (
            <div className="space-y-4">
              {loans.length === 0 ? (
                <p className="text-center text-gray-400 py-10">No loan history.</p>
              ) : (
                <>
                  {activeLoans.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Active / Overdue</h3>
                      <div className="space-y-2">
                        {activeLoans.map((loan) => <LoanRow key={loan.id} loan={loan} />)}
                      </div>
                    </div>
                  )}
                  {returnedLoans.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 mt-4">Returned</h3>
                      <div className="space-y-2">
                        {returnedLoans.map((loan) => <LoanRow key={loan.id} loan={loan} />)}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Fines tab ── */}
          {tab === "fines" && (
            <div className="space-y-2">
              {fines.length === 0 ? (
                <p className="text-center text-gray-400 py-10">No fines on record.</p>
              ) : (
                fines.map((fine) => (
                  <div key={fine.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-gray-100">
                    <div className="min-w-0 mr-3">
                      <p className="text-sm font-medium text-gray-800 truncate">{fine.loan.book.title}</p>
                      <p className="text-xs text-gray-500">{fine.daysLate} days late · {new Date(fine.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-bold text-gray-800">${fine.amount.toFixed(2)}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${fineStatusStyle[fine.status] ?? "bg-gray-100 text-gray-500"}`}>
                        {fine.status}
                      </span>
                    </div>
                  </div>
                ))
              )}
              {fines.length > 0 && (
                <div className="flex justify-between pt-3 border-t border-gray-100 text-sm font-semibold text-gray-700">
                  <span>Total</span>
                  <span>${totalFines.toFixed(2)}</span>
                </div>
              )}
            </div>
          )}

          {/* ── Discipline tab ── */}
          {tab === "discipline" && (
            <DisciplineTab
              member={member}
              incidents={incidents}
              memberId={id}
              onRefresh={loadAll}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Discipline tab component ───────────────────────────────────────────────── */

function DisciplineTab({
  member, incidents, memberId, onRefresh
}: {
  member: Member;
  incidents: Incident[];
  memberId: string;
  onRefresh: () => void;
}) {
  const [showRestrict, setShowRestrict] = useState(false);
  const [showIncident, setShowIncident] = useState(false);
  const [showResolve,  setShowResolve]  = useState<string | null>(null); // incidentId
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restriction form
  const [rStatus,  setRStatus]  = useState<string>("SUSPENDED");
  const [rReason,  setRReason]  = useState("");
  const [rExpiry,  setRExpiry]  = useState("");

  // Incident form
  const [iType,     setIType]     = useState<string>("BOOK_DAMAGE");
  const [iDesc,     setIDesc]     = useState("");
  const [iSeverity, setISeverity] = useState(1);

  // Resolve form
  const [resolveText, setResolveText] = useState("");

  const rBadge = restrictionBadge(member.restrictionStatus);
  const isRestricted = member.restrictionStatus !== "NONE";

  async function applyRestriction() {
    if (!rReason.trim()) return;
    setBusy(true); setError(null);
    const res = await fetch(`/api/members/${memberId}/restriction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "apply", restrictionStatus: rStatus, reason: rReason, expiryDate: rExpiry || undefined }),
    });
    setBusy(false);
    if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error ?? `Error ${res.status}`); return; }
    setShowRestrict(false);
    setRReason(""); setRExpiry("");
    onRefresh();
  }

  async function liftRestriction() {
    setBusy(true); setError(null);
    const res = await fetch(`/api/members/${memberId}/restriction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "lift" }),
    });
    setBusy(false);
    if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error ?? `Error ${res.status}`); return; }
    onRefresh();
  }

  async function logIncident() {
    if (!iDesc.trim()) return;
    setBusy(true); setError(null);
    const res = await fetch(`/api/members/${memberId}/incidents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: iType, description: iDesc, severity: iSeverity }),
    });
    setBusy(false);
    if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error ?? `Error ${res.status}`); return; }
    setShowIncident(false);
    setIDesc(""); setIType("BOOK_DAMAGE"); setISeverity(1);
    onRefresh();
  }

  async function resolveIncident(incidentId: string) {
    if (!resolveText.trim()) return;
    setBusy(true); setError(null);
    const res = await fetch(`/api/members/${memberId}/incidents`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ incidentId, resolution: resolveText }),
    });
    setBusy(false);
    if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error ?? `Error ${res.status}`); return; }
    setShowResolve(null);
    setResolveText("");
    onRefresh();
  }

  return (
    <div className="space-y-6">

      {/* ── Error banner ── */}
      {error && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {/* ── Current restriction status ── */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <Shield className="w-4 h-4" /> Account Restriction
        </h3>

        <div className={`rounded-xl border p-4 flex items-start gap-4 ${
          isRestricted ? "border-red-200 bg-red-50" : "border-green-200 bg-green-50"
        }`}>
          <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
            isRestricted ? "bg-red-100" : "bg-green-100"
          }`}>
            {isRestricted
              ? <ShieldX className="w-5 h-5 text-red-600" />
              : <ShieldCheck className="w-5 h-5 text-green-600" />}
          </div>
          <div className="flex-1 min-w-0">
            {isRestricted && rBadge ? (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${rBadge.color}`}>
                    {rBadge.label}
                  </span>
                  {member.restrictionExpiry && (
                    <span className="text-xs text-gray-500">
                      Expires {new Date(member.restrictionExpiry).toLocaleDateString()}
                    </span>
                  )}
                  {!member.restrictionExpiry && member.restrictionStatus !== "IN_LIBRARY_ONLY" && member.restrictionStatus !== "SUSPENDED" && (
                    <span className="text-xs text-red-500 font-medium">Permanent</span>
                  )}
                </div>
                {member.restrictionReason && (
                  <p className="text-sm text-gray-700 mt-1.5 italic">"{member.restrictionReason}"</p>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  {member.restrictedAt && `Applied ${new Date(member.restrictedAt).toLocaleDateString()}`}
                  {member.restrictedBy && ` by ${member.restrictedBy}`}
                </p>
              </>
            ) : (
              <p className="text-sm font-medium text-green-700">No restrictions — full access</p>
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            {isRestricted ? (
              <button
                onClick={liftRestriction}
                disabled={busy}
                className="px-3 py-1.5 text-xs font-medium bg-white border border-green-300 text-green-700 rounded-lg hover:bg-green-50 transition-colors disabled:opacity-50">
                {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : "Lift Restriction"}
              </button>
            ) : (
              <button
                onClick={() => setShowRestrict(true)}
                className="px-3 py-1.5 text-xs font-medium bg-white border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors">
                Apply Restriction
              </button>
            )}
            {isRestricted && (
              <button
                onClick={() => setShowRestrict(true)}
                className="px-3 py-1.5 text-xs font-medium bg-white border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
                Change
              </button>
            )}
          </div>
        </div>

        {/* Apply/Change restriction modal */}
        {showRestrict && (
          <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">Apply Restriction</p>
              <button onClick={() => setShowRestrict(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {RESTRICTION_LEVELS.map(({ value, label, desc, color, Icon }) => (
                <button key={value} onClick={() => setRStatus(value)}
                  className={`flex items-start gap-2 p-2.5 rounded-lg border text-left transition-all text-xs ${
                    rStatus === value
                      ? "border-indigo-400 bg-indigo-50 ring-1 ring-indigo-300"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}>
                  <span className={`flex-shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold ${color}`}>
                    <Icon className="w-3 h-3 inline mr-0.5" />{label}
                  </span>
                  <span className="text-gray-500 leading-snug hidden sm:block">{desc}</span>
                </button>
              ))}
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Reason <span className="text-red-500">*</span></label>
              <textarea
                value={rReason}
                onChange={(e) => setRReason(e.target.value)}
                rows={2}
                placeholder="e.g. Returned 3 books with water damage and refused to pay replacement fine"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                Expiry date <span className="text-gray-400">(leave blank = permanent)</span>
              </label>
              <input type="date" value={rExpiry} onChange={(e) => setRExpiry(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>

            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowRestrict(false)}
                className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-100">
                Cancel
              </button>
              <button onClick={applyRestriction} disabled={busy || !rReason.trim()}
                className="px-4 py-1.5 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
                {busy ? <Loader2 className="w-3 h-3 animate-spin inline mr-1" /> : null}
                Apply Restriction
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Incident log ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <FileText className="w-4 h-4" /> Incident Log
            {incidents.length > 0 && (
              <span className="text-xs font-normal text-gray-400">({incidents.length} total)</span>
            )}
          </h3>
          <button onClick={() => setShowIncident(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
            <Plus className="w-3.5 h-3.5" /> Log Incident
          </button>
        </div>

        {/* Log incident form */}
        {showIncident && (
          <div className="mb-3 rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">Log New Incident</p>
              <button onClick={() => setShowIncident(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex gap-3 flex-wrap">
              <div className="flex-1 min-w-[160px]">
                <label className="text-xs font-medium text-gray-600 block mb-1">Type</label>
                <select value={iType} onChange={(e) => setIType(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300">
                  {INCIDENT_TYPES.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Severity</label>
                <div className="flex gap-1">
                  {[1, 2, 3].map((s) => (
                    <button key={s} onClick={() => setISeverity(s)}
                      className={`px-3 py-2 text-xs rounded-lg border font-medium transition-colors ${
                        iSeverity === s
                          ? s === 1 ? "bg-yellow-100 border-yellow-300 text-yellow-700"
                            : s === 2 ? "bg-orange-100 border-orange-300 text-orange-700"
                            : "bg-red-100 border-red-300 text-red-700"
                          : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
                      }`}>
                      {SEVERITY_LABELS[s].label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Description <span className="text-red-500">*</span></label>
              <textarea
                value={iDesc}
                onChange={(e) => setIDesc(e.target.value)}
                rows={2}
                placeholder="Describe what happened…"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>

            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowIncident(false)}
                className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-100">
                Cancel
              </button>
              <button onClick={logIncident} disabled={busy || !iDesc.trim()}
                className="px-4 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                {busy ? <Loader2 className="w-3 h-3 animate-spin inline mr-1" /> : null}
                Save Incident
              </button>
            </div>
          </div>
        )}

        {incidents.length === 0 ? (
          <div className="text-center text-gray-400 py-8 border border-dashed border-gray-200 rounded-xl">
            <CheckCircle className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">No incidents on record</p>
          </div>
        ) : (
          <div className="space-y-2">
            {incidents.map((inc) => {
              const sev = SEVERITY_LABELS[inc.severity] ?? SEVERITY_LABELS[1];
              const incType = INCIDENT_TYPES.find((t) => t.value === inc.type)?.label ?? inc.type;
              return (
                <div key={inc.id} className={`rounded-xl border p-4 ${inc.resolvedAt ? "bg-gray-50 border-gray-100 opacity-70" : "bg-white border-gray-200"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      <div className="flex-shrink-0 mt-0.5">
                        {inc.resolvedAt
                          ? <CheckCircle className="w-4 h-4 text-green-500" />
                          : <AlertCircle className="w-4 h-4 text-amber-500" />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-gray-800">{incType}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${sev.color}`}>{sev.label}</span>
                          {inc.resolvedAt && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-green-100 text-green-700">Resolved</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mt-1">{inc.description}</p>
                        {inc.resolution && (
                          <p className="text-xs text-green-700 mt-1 italic">Resolution: {inc.resolution}</p>
                        )}
                        <p className="text-xs text-gray-400 mt-1">
                          {new Date(inc.createdAt).toLocaleDateString()}
                          {inc.actorName && ` · by ${inc.actorName}`}
                          {inc.resolvedAt && inc.resolvedBy && ` · resolved by ${inc.resolvedBy}`}
                        </p>
                      </div>
                    </div>
                    {!inc.resolvedAt && (
                      <button onClick={() => { setShowResolve(inc.id); setResolveText(""); }}
                        className="shrink-0 px-2.5 py-1 text-xs border border-green-200 text-green-700 rounded-lg hover:bg-green-50 transition-colors">
                        Resolve
                      </button>
                    )}
                  </div>

                  {/* Inline resolve form */}
                  {showResolve === inc.id && (
                    <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                      <textarea
                        value={resolveText}
                        onChange={(e) => setResolveText(e.target.value)}
                        rows={2}
                        placeholder="Describe how this was resolved…"
                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-green-300"
                      />
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setShowResolve(null)}
                          className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-100">
                          Cancel
                        </button>
                        <button onClick={() => resolveIncident(inc.id)} disabled={busy || !resolveText.trim()}
                          className="px-3 py-1.5 text-xs font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
                          {busy ? <Loader2 className="w-3 h-3 animate-spin inline mr-1" /> : null}
                          Mark Resolved
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Loan row helper ─────────────────────────────────────────────────────────── */

function LoanRow({ loan }: { loan: Loan }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-800 truncate">{loan.book.title}</p>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
          <span>Due {new Date(loan.dueDate).toLocaleDateString()}</span>
          {loan.renewalCount > 0 && (
            <span className="flex items-center gap-0.5 text-indigo-500">
              <RefreshCw className="w-3 h-3" /> {loan.renewalCount}×
            </span>
          )}
          {loan.fine && (
            <span className={`px-1.5 py-0.5 rounded-full ${fineStatusStyle[loan.fine.status] ?? "bg-gray-100"}`}>
              ${loan.fine.amount.toFixed(2)} fine
            </span>
          )}
        </div>
      </div>
      <span className={`text-xs px-2 py-1 rounded-full font-medium shrink-0 ${loanStatusStyle[loan.status] ?? "bg-gray-100 text-gray-600"}`}>
        {loan.status === "RETURNED" ? <CheckCircle2 className="w-3 h-3 inline mr-0.5" /> : null}
        {loan.status}
      </span>
    </div>
  );
}
