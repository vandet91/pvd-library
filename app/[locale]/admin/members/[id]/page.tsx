"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import {
  ArrowLeft, User, BookOpen, DollarSign, Calendar,
  CheckCircle2, AlertTriangle, Clock, RefreshCw, Loader2,
} from "lucide-react";
import MemberForm from "@/components/admin/MemberForm";

/* ── types ── */
interface Member {
  id: string; memberId: string; name: string; email: string | null;
  phone: string | null; address: string | null;
  memberType: string; isActive: boolean;
  expireDate: string | null; joinDate: string; createdAt: string;
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

const loanStatusStyle: Record<string, string> = {
  ACTIVE:   "bg-blue-100 text-blue-700",
  RETURNED: "bg-green-100 text-green-700",
  OVERDUE:  "bg-red-100 text-red-700",
};

const fineStatusStyle: Record<string, string> = {
  UNPAID: "bg-red-100 text-red-700",
  PAID:   "bg-green-100 text-green-700",
};

export default function MemberDetailPage() {
  const params    = useParams<{ id: string }>();
  const locale    = useLocale();
  const t         = useTranslations("members");
  const id        = params.id;

  const [member, setMember] = useState<Member | null>(null);
  const [loans,  setLoans]  = useState<Loan[]>([]);
  const [fines,  setFines]  = useState<Fine[]>([]);
  const [tab,    setTab]    = useState<"edit" | "loans" | "fines">("edit");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [mRes, lRes, fRes] = await Promise.all([
        fetch(`/api/members/${id}`),
        fetch(`/api/loans?memberId=${id}&limit=50`),
        fetch(`/api/fines?memberId=${id}`),
      ]);
      if (mRes.ok) setMember(await mRes.json());
      if (lRes.ok) setLoans(await lRes.json());
      if (fRes.ok) setFines(await fRes.json());
      setLoading(false);
    }
    load();
  }, [id]);

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

  const activeLoans  = loans.filter((l) => l.status !== "RETURNED");
  const returnedLoans = loans.filter((l) => l.status === "RETURNED");
  const unpaidFines  = fines.filter((f) => f.status === "UNPAID");
  const totalFines   = fines.reduce((s, f) => s + f.amount, 0);

  const isExpired   = member.expireDate && new Date(member.expireDate) < new Date();
  const daysToExpiry = member.expireDate
    ? Math.ceil((new Date(member.expireDate).getTime() - Date.now()) / 86_400_000)
    : null;

  return (
    <div className="space-y-5">
      {/* ── back + title ── */}
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
        </div>
        <div className="ml-auto flex items-center gap-2">
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

      {/* ── summary cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Active Loans",   value: activeLoans.length,   icon: BookOpen,     color: "text-blue-600 bg-blue-50" },
          { label: "Total Loans",    value: loans.length,          icon: RefreshCw,    color: "text-violet-600 bg-violet-50" },
          { label: "Unpaid Fines",   value: unpaidFines.length,    icon: AlertTriangle,color: unpaidFines.length > 0 ? "text-red-600 bg-red-50" : "text-gray-400 bg-gray-50" },
          { label: "Total Fines",    value: `$${totalFines.toFixed(2)}`, icon: DollarSign, color: totalFines > 0 ? "text-amber-600 bg-amber-50" : "text-gray-400 bg-gray-50" },
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

      {/* ── tabs ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="border-b border-gray-100 flex">
          {[
            { key: "edit",  label: "Edit Info",    icon: User },
            { key: "loans", label: `Loans (${loans.length})`, icon: BookOpen },
            { key: "fines", label: `Fines (${fines.length})`, icon: DollarSign },
          ].map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setTab(key as typeof tab)}
              className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium border-b-2 transition-colors ${
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
                        {activeLoans.map((loan) => (
                          <LoanRow key={loan.id} loan={loan} />
                        ))}
                      </div>
                    </div>
                  )}
                  {returnedLoans.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 mt-4">Returned</h3>
                      <div className="space-y-2">
                        {returnedLoans.map((loan) => (
                          <LoanRow key={loan.id} loan={loan} />
                        ))}
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
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${fineStatusStyle[fine.status]}`}>
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
        </div>
      </div>
    </div>
  );
}

/* ── Loan row helper ── */
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
