"use client";

import { useState, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import {
  BookOpen, ShoppingCart, BookMarked,
  Clock, CheckCircle, AlertTriangle, RotateCcw,
  Calendar, AlertCircle, PackageX,
} from "lucide-react";
import MemberHeader from "@/components/shared/MemberHeader";
import RestrictionBanner from "@/components/shared/RestrictionBanner";
import { useLibraryName } from "@/context/library-name";

interface Loan {
  id: string;
  borrowDate: string;
  dueDate: string;
  returnDate: string | null;
  status: "ACTIVE" | "OVERDUE" | "RETURNED" | "LOST";
  renewalCount: number;
  book: {
    id: string;
    title: string;
    isbn: string | null;
    coverImage: string | null;
    materialType?: string | null;
    author?: { name: string } | null;
  };
  fines: { id: string; amount: number; status: "UNPAID" | "PAID" | "WAIVED"; type: "LATE_FEE" | "REPLACEMENT" | "DAMAGED" }[];
}

function daysUntil(date: string) {
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000);
}

export default function LoansPage() {
  const locale = useLocale();
  const t  = useTranslations("loans");
  const to = useTranslations("opac");
  const tc = useTranslations("common");
  const libraryName = useLibraryName();

  const [loans,   setLoans]   = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/loans")
      .then(async (r) => {
        if (r.status === 401) { setError(t("logInPrompt"));   setLoading(false); return; }
        if (r.status === 404) { setError(t("noMemberAccount")); setLoading(false); return; }
        if (!r.ok)            { setError(t("failedToLoad"));  setLoading(false); return; }
        const data = await r.json().catch(() => []);
        setLoans(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => { setError(t("serverError")); setLoading(false); });
  }, [t]);

  const active   = loans.filter((l) => l.status === "ACTIVE");
  const overdue  = loans.filter((l) => l.status === "OVERDUE");
  const returned = loans.filter((l) => l.status === "RETURNED");
  const lost     = loans.filter((l) => l.status === "LOST");

  const unpaidFines = loans
    .flatMap((l) => l.fines ?? [])
    .filter((f) => f.status === "UNPAID")
    .reduce((sum, f) => sum + f.amount, 0);

  const statusStyle: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
    ACTIVE:   { label: t("statusActive"),   icon: <Clock className="w-3.5 h-3.5" />,         cls: "bg-blue-50 text-blue-700"    },
    OVERDUE:  { label: t("statusOverdue"),  icon: <AlertTriangle className="w-3.5 h-3.5" />, cls: "bg-red-50 text-red-600"      },
    RETURNED: { label: t("statusReturned"), icon: <CheckCircle className="w-3.5 h-3.5" />,   cls: "bg-green-50 text-green-700"  },
    LOST:     { label: "Lost",              icon: <PackageX className="w-3.5 h-3.5" />,       cls: "bg-red-100 text-red-700"     },
  };

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Sticky top nav ── */}
      <nav className="sticky top-0 z-30 bg-[#0f1e4a]/95 backdrop-blur border-b border-white/10">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-1">
            <Link href={`/${locale}/discover`} className="flex items-center gap-2 pr-3 mr-2 border-r border-white/20">
              <div className="w-7 h-7 bg-blue-500/30 rounded-lg flex items-center justify-center flex-shrink-0">
                <BookOpen className="w-4 h-4 text-blue-300" />
              </div>
              <span className="text-sm font-bold text-white hidden sm:block leading-none">{libraryName}</span>
            </Link>
            <Link href={`/${locale}/discover`} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white/60 hover:text-white hover:bg-white/10 transition-colors">
              <BookOpen className="w-3.5 h-3.5" /><span className="hidden sm:inline">{to("discover")}</span>
            </Link>
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-blue-500/25 ring-1 ring-blue-400/30 cursor-default">
              <BookOpen className="w-3.5 h-3.5 text-blue-300" /><span className="hidden sm:inline">{t("title")}</span>
            </span>
            <Link href={`/${locale}/ebooks`} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white/60 hover:text-white hover:bg-white/10 transition-colors">
              <BookMarked className="w-3.5 h-3.5" /><span className="hidden sm:inline">{to("eLibrary")}</span>
            </Link>
          </div>
          <MemberHeader theme="dark" />
        </div>
      </nav>

      <RestrictionBanner />

      {/* ── Page header ── */}
      <header className="bg-gradient-to-br from-blue-900 via-blue-900 to-indigo-900 text-white px-4 py-4">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/15 rounded-xl flex items-center justify-center flex-shrink-0">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">{t("title")}</h1>
              <p className="text-white/60 text-sm">{t("subtitle")}</p>
            </div>
          </div>
          {/* Summary chips */}
          {!loading && !error && (
            <div className="mt-4 flex flex-wrap gap-2">
              {active.length > 0 && (
                <span className="bg-white/15 text-white text-xs px-3 py-1 rounded-full font-medium">
                  {active.length} {t("activeChip")}
                </span>
              )}
              {overdue.length > 0 && (
                <span className="bg-red-500/80 text-white text-xs px-3 py-1 rounded-full font-semibold flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> {overdue.length} {t("overdueChip")}
                </span>
              )}
              {unpaidFines > 0 && (
                <span className="bg-orange-400/80 text-white text-xs px-3 py-1 rounded-full font-semibold">
                  ${unpaidFines.toFixed(2)} {t("inFines")}
                </span>
              )}
              {lost.length > 0 && (
                <span className="bg-red-800/80 text-white text-xs px-3 py-1 rounded-full font-semibold flex items-center gap-1">
                  <PackageX className="w-3 h-3" /> {lost.length} Lost
                </span>
              )}
              {returned.length > 0 && (
                <span className="bg-white/10 text-white/70 text-xs px-3 py-1 rounded-full">
                  {returned.length} {t("returnedChip")}
                </span>
              )}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        {loading ? (
          <div className="text-center text-gray-400 py-16">{t("loading")}</div>
        ) : error ? (
          <div className="text-center py-16">
            <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 mb-4">{error}</p>
            <Link href={`/${locale}/member/login`}
              className="inline-flex items-center gap-2 bg-blue-900 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-800 transition-colors">
              {t("logIn")}
            </Link>
          </div>
        ) : loans.length === 0 ? (
          <div className="text-center py-16">
            <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 mb-2">{t("noBooksYet")}</p>
            <Link href={`/${locale}/discover`}
              className="inline-flex items-center gap-2 bg-blue-900 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-800 transition-colors">
              <BookOpen className="w-4 h-4" /> {t("browseBooks")}
            </Link>
          </div>
        ) : (
          <div className="space-y-6">

            {/* Overdue — shown first */}
            {overdue.length > 0 && (
              <div>
                <h2 className="font-semibold text-red-600 mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  {t("overdueSection")}
                  <span className="ml-auto text-sm font-normal text-gray-400">{overdue.length} {t("books")}</span>
                </h2>
                <div className="space-y-3">
                  {overdue.map((loan) => (
                    <LoanCard key={loan.id} loan={loan} t={t} statusStyle={statusStyle} />
                  ))}
                </div>
                <p className="text-xs text-red-400 mt-2 text-center">{t("returnWarning")}</p>
              </div>
            )}

            {/* Lost books */}
            {lost.length > 0 && (
              <div>
                <h2 className="font-semibold text-red-700 mb-3 flex items-center gap-2">
                  <PackageX className="w-4 h-4" />
                  Lost Books
                  <span className="ml-auto text-sm font-normal text-gray-400">{lost.length} {t("books")}</span>
                </h2>
                <div className="space-y-3">
                  {lost.map((loan) => (
                    <LoanCard key={loan.id} loan={loan} t={t} statusStyle={statusStyle} />
                  ))}
                </div>
                <p className="text-xs text-red-400 mt-2 text-center">Please visit the library to settle the replacement fee.</p>
              </div>
            )}

            {/* Active loans */}
            {active.length > 0 && (
              <div>
                <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-500" />
                  {t("currentlyBorrowed")}
                  <span className="ml-auto text-sm font-normal text-gray-400">{active.length} {t("books")}</span>
                </h2>
                <div className="space-y-3">
                  {active.map((loan) => (
                    <LoanCard key={loan.id} loan={loan} t={t} statusStyle={statusStyle} />
                  ))}
                </div>
              </div>
            )}

            {/* Return history */}
            {returned.length > 0 && (
              <div>
                <h2 className="font-semibold text-gray-700 mb-3 text-sm flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-gray-400" />
                  {t("returnHistory")}
                </h2>
                <div className="space-y-2">
                  {returned.map((loan) => (
                    <LoanCard key={loan.id} loan={loan} t={t} statusStyle={statusStyle} dimmed />
                  ))}
                </div>
              </div>
            )}

          </div>
        )}
      </main>
    </div>
  );
}

type TFn = ReturnType<typeof useTranslations>;

function DueBadge({ loan, t }: { loan: Loan; t: TFn }) {
  if (loan.status === "RETURNED") {
    return (
      <span className="text-xs text-gray-400">
        {t("returnedOn", { date: new Date(loan.returnDate!).toLocaleDateString() })}
      </span>
    );
  }
  if (loan.status === "LOST") {
    return (
      <span className="text-xs font-semibold text-red-700 flex items-center gap-1">
        <PackageX className="w-3.5 h-3.5" />
        Reported lost · replacement fee applied
      </span>
    );
  }
  const days = daysUntil(loan.dueDate);
  if (loan.status === "OVERDUE") {
    return (
      <span className="text-xs font-semibold text-red-600 flex items-center gap-1">
        <AlertCircle className="w-3.5 h-3.5" />
        {t("daysOverdue", { count: Math.abs(days) })}
      </span>
    );
  }
  return (
    <span className={`text-xs flex items-center gap-1 ${days <= 3 ? "text-orange-600 font-semibold" : "text-gray-500"}`}>
      <Calendar className="w-3.5 h-3.5" />
      {t("dueIn", { days, date: new Date(loan.dueDate).toLocaleDateString() })}
    </span>
  );
}

function LoanCard({
  loan, dimmed = false, t, statusStyle,
}: {
  loan: Loan;
  dimmed?: boolean;
  t: TFn;
  statusStyle: Record<string, { label: string; icon: React.ReactNode; cls: string }>;
}) {
  const s = statusStyle[loan.status] ?? statusStyle["ACTIVE"];
  const isLost    = loan.status === "LOST";
  const isOverdue = loan.status === "OVERDUE";
  return (
    <div className={`bg-white rounded-xl border shadow-sm p-4 flex items-center gap-4 ${
      isLost ? "border-red-300 bg-red-50/30" : isOverdue ? "border-red-200" : "border-gray-100"
    } ${dimmed ? "opacity-60" : ""}`}>
      {/* Cover */}
      <div className={`w-12 h-16 rounded-lg flex items-center justify-center flex-shrink-0 ${
        isLost || isOverdue ? "bg-red-50" : "bg-gradient-to-br from-blue-50 to-indigo-50"
      }`}>
        {loan.book.coverImage
          ? <img src={loan.book.coverImage} alt={loan.book.title} className="h-full w-full object-cover rounded-lg" /> // eslint-disable-line @next/next/no-img-element
          : isLost
            ? <PackageX className="w-6 h-6 text-red-400" />
            : <BookOpen className={`w-6 h-6 ${isOverdue ? "text-red-300" : "text-blue-300"}`} />}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="font-semibold text-gray-900 text-sm truncate">{loan.book.title}</p>
          {loan.book.materialType && loan.book.materialType !== "BOOK" && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-semibold uppercase tracking-wide flex-shrink-0">
              {loan.book.materialType.replace("_", " ")}
            </span>
          )}
        </div>
        {loan.book.author && (
          <p className="text-xs text-gray-500">{loan.book.author.name}</p>
        )}

        <div className="flex items-center gap-2 flex-wrap mt-1.5">
          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${s.cls}`}>
            {s.icon} {s.label}
          </span>
          {loan.renewalCount > 0 && (
            <span className="text-xs text-gray-400">
              {t("renewed", { count: loan.renewalCount })}
            </span>
          )}
        </div>

        <div className="mt-1">
          <DueBadge loan={loan} t={t} />
        </div>

        {loan.fines?.map((fine: { id: string; amount: number; status: string; type: string }) => (
          <div key={fine.id} className={`mt-1.5 text-xs px-2 py-1 rounded-lg font-medium w-fit flex items-center gap-1 ${
            fine.status === "UNPAID"
              ? fine.type === "REPLACEMENT"
                ? "bg-red-50 text-red-700 border border-red-200"
                : "bg-orange-50 text-orange-700 border border-orange-200"
              : "bg-gray-100 text-gray-500"
          }`}>
            <AlertCircle className="w-3 h-3" />
            {fine.type === "REPLACEMENT"
              ? `Replacement fee: $${fine.amount.toFixed(2)} · ${fine.status}`
              : t("fine", { amount: fine.amount.toFixed(2), status: fine.status })}
          </div>
        ))}
      </div>
    </div>
  );
}
