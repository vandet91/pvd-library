"use client";

import { useState, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import {
  AlertCircle, CheckCircle, XCircle, BookOpen,
  BookMarked, AlertTriangle, Banknote, MapPin,
} from "lucide-react";
import MemberHeader from "@/components/shared/MemberHeader";
import RestrictionBanner from "@/components/shared/RestrictionBanner";
import { useLibraryName } from "@/context/library-name";

interface MemberFine {
  id:            string;
  amount:        number;
  daysLate:      number;
  type:          "LATE_FEE" | "REPLACEMENT" | "DAMAGED";
  status:        "UNPAID" | "PAID" | "WAIVED";
  paidAt:        string | null;
  paymentMethod: string | null;
  notes:         string | null;
  createdAt:     string;
  book:  { title: string; coverImage: string | null };
  loan:  { dueDate: string; returnDate: string | null };
}

function TypeLabel({ type }: { type: string }) {
  if (type === "LATE_FEE")    return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-700 font-medium">Late Return</span>;
  if (type === "REPLACEMENT") return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-700 font-medium">Lost / Replacement</span>;
  if (type === "DAMAGED")     return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">Damaged</span>;
  return null;
}

export default function MemberFinesPage() {
  const t   = useTranslations("fines");
  const to  = useTranslations("opac");
  const locale = useLocale();
  const libraryName = useLibraryName();

  const [fines,   setFines]   = useState<MemberFine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/member/fines")
      .then(async (r) => {
        if (r.status === 401) { setError(t("loginRequired")); setLoading(false); return; }
        if (r.status === 404) { setError(t("noMemberAccount")); setLoading(false); return; }
        if (!r.ok)            { setError(t("loadFailed"));     setLoading(false); return; }
        const data = await r.json();
        setFines(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => { setError(t("loadFailed")); setLoading(false); });
  }, [t]);

  const unpaid = fines.filter((f) => f.status === "UNPAID");
  const paid   = fines.filter((f) => f.status === "PAID");
  const waived = fines.filter((f) => f.status === "WAIVED");
  const totalUnpaid = unpaid.reduce((s, f) => s + f.amount, 0);

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Nav ── */}
      <nav className="sticky top-0 z-30 bg-[#0f1e4a]/95 backdrop-blur border-b border-white/10">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-1">
            <Link href={`/${locale}/discover`} className="flex items-center gap-2 pr-3 mr-2 border-r border-white/20">
              <div className="w-7 h-7 bg-blue-500/30 rounded-lg flex items-center justify-center flex-shrink-0">
                <BookOpen className="w-4 h-4 text-blue-300" />
              </div>
              <span className="text-sm font-bold text-white hidden sm:block leading-none">{libraryName}</span>
            </Link>
            <Link href={`/${locale}/loans`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white/60 hover:text-white hover:bg-white/10 transition-colors">
              <BookOpen className="w-3.5 h-3.5" /><span className="hidden sm:inline">{to("myLoans")}</span>
            </Link>
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-orange-500/25 ring-1 ring-orange-400/30 cursor-default">
              <Banknote className="w-3.5 h-3.5 text-orange-300" /><span className="hidden sm:inline">{t("myFines")}</span>
            </span>
            <Link href={`/${locale}/ebooks`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white/60 hover:text-white hover:bg-white/10 transition-colors">
              <BookMarked className="w-3.5 h-3.5" /><span className="hidden sm:inline">{to("eLibrary")}</span>
            </Link>
          </div>
          <MemberHeader theme="dark" />
        </div>
      </nav>

      <RestrictionBanner />

      {/* ── Hero ── */}
      <header className="bg-gradient-to-br from-orange-900 via-red-900 to-rose-800 text-white px-4 py-5">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-white/15 rounded-xl flex items-center justify-center flex-shrink-0">
              <Banknote className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">{t("myFines")}</h1>
              <p className="text-white/60 text-sm">{t("myFinesSubtitle")}</p>
            </div>
          </div>
          {!loading && !error && (
            <div className="flex flex-wrap gap-2 mt-2">
              {totalUnpaid > 0 && (
                <span className="bg-red-500/80 text-white text-xs px-3 py-1 rounded-full font-semibold">
                  ${totalUnpaid.toFixed(2)} {t("unpaid")}
                </span>
              )}
              {paid.length > 0 && (
                <span className="bg-white/15 text-white text-xs px-3 py-1 rounded-full">
                  {paid.length} {t("paid")}
                </span>
              )}
              {waived.length > 0 && (
                <span className="bg-white/10 text-white/70 text-xs px-3 py-1 rounded-full">
                  {waived.length} {t("waived")}
                </span>
              )}
              {fines.length === 0 && (
                <span className="bg-green-500/80 text-white text-xs px-3 py-1 rounded-full font-semibold flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> {t("noFinesGood")}
                </span>
              )}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">

        {loading ? (
          <div className="text-center text-gray-400 py-16">{t("loading")}</div>
        ) : error ? (
          <div className="text-center py-16">
            <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 mb-4">{error}</p>
            <Link href={`/${locale}/member/login`}
              className="inline-flex items-center gap-2 bg-blue-900 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-800 transition-colors">
              {t("signIn")}
            </Link>
          </div>
        ) : fines.length === 0 ? (
          <div className="text-center py-16">
            <CheckCircle className="w-14 h-14 text-green-300 mx-auto mb-3" />
            <p className="text-gray-600 font-semibold text-base mb-1">{t("noFinesGood")}</p>
            <p className="text-gray-400 text-sm">{t("noFinesDesc")}</p>
          </div>
        ) : (
          <>
            {/* ── Unpaid ── */}
            {unpaid.length > 0 && (
              <section>
                <h2 className="font-semibold text-red-600 mb-3 flex items-center gap-2 text-sm">
                  <AlertTriangle className="w-4 h-4" />
                  {t("unpaidSection")}
                  <span className="ml-auto font-bold text-red-700">${totalUnpaid.toFixed(2)}</span>
                </h2>

                <div className="space-y-3">
                  {unpaid.map((fine) => (
                    <FineCard key={fine.id} fine={fine} t={t} />
                  ))}
                </div>

                {/* Pay-at-counter banner */}
                <div className="mt-4 bg-orange-50 border border-orange-200 rounded-xl p-4 flex gap-3">
                  <MapPin className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-orange-800">{t("payAtCounter")}</p>
                    <p className="text-xs text-orange-600 mt-0.5">{t("payAtCounterDesc")}</p>
                  </div>
                </div>
              </section>
            )}

            {/* ── Paid ── */}
            {paid.length > 0 && (
              <section>
                <h2 className="font-semibold text-gray-700 mb-3 flex items-center gap-2 text-sm">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  {t("paidSection")}
                </h2>
                <div className="space-y-3">
                  {paid.map((fine) => (
                    <FineCard key={fine.id} fine={fine} t={t} />
                  ))}
                </div>
              </section>
            )}

            {/* ── Waived ── */}
            {waived.length > 0 && (
              <section>
                <h2 className="font-semibold text-gray-500 mb-3 flex items-center gap-2 text-sm">
                  <XCircle className="w-4 h-4 text-gray-400" />
                  {t("waivedSection")}
                </h2>
                <div className="space-y-3 opacity-70">
                  {waived.map((fine) => (
                    <FineCard key={fine.id} fine={fine} t={t} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

type TFn = ReturnType<typeof useTranslations>;

function FineCard({ fine, t }: { fine: MemberFine; t: TFn }) {
  const isUnpaid = fine.status === "UNPAID";
  const isPaid   = fine.status === "PAID";

  return (
    <div className={`bg-white rounded-xl border shadow-sm p-4 flex items-center gap-4 ${
      isUnpaid ? "border-red-200" : "border-gray-100"
    }`}>
      {/* Cover */}
      <div className={`w-10 h-14 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden ${
        isUnpaid ? "bg-red-50" : "bg-gray-50"
      }`}>
        {fine.book.coverImage
          ? <img src={fine.book.coverImage} alt={fine.book.title} className="h-full w-full object-contain" /> // eslint-disable-line @next/next/no-img-element
          : <BookOpen className={`w-5 h-5 ${isUnpaid ? "text-red-300" : "text-gray-300"}`} />}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 text-sm truncate">{fine.book.title}</p>
        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
          <TypeLabel type={fine.type} />
          {fine.daysLate > 0 && (
            <span className="text-[10px] text-gray-500">{fine.daysLate} {t("daysOverdue").toLowerCase()}</span>
          )}
        </div>
        {fine.status === "PAID" && fine.paidAt && (
          <p className="text-xs text-gray-400 mt-0.5">
            {t("paidOn", { date: new Date(fine.paidAt).toLocaleDateString() })}
            {fine.paymentMethod && fine.paymentMethod !== "waived" && (
              <span className="ml-1 text-gray-400">· {fine.paymentMethod.replace("_", " ")}</span>
            )}
          </p>
        )}
        {fine.status === "WAIVED" && fine.paidAt && (
          <p className="text-xs text-gray-400 mt-0.5">
            {t("waivedOn", { date: new Date(fine.paidAt).toLocaleDateString() })}
          </p>
        )}
      </div>

      {/* Amount + status */}
      <div className="text-right flex-shrink-0">
        <p className={`text-base font-bold ${isUnpaid ? "text-red-600" : "text-gray-400 line-through"}`}>
          ${fine.amount.toFixed(2)}
        </p>
        <div className="mt-0.5">
          {isUnpaid && (
            <span className="flex items-center gap-1 text-[11px] font-medium text-red-500">
              <AlertCircle className="w-3 h-3" /> {t("unpaid")}
            </span>
          )}
          {isPaid && (
            <span className="flex items-center gap-1 text-[11px] font-medium text-green-600">
              <CheckCircle className="w-3 h-3" /> {t("paid")}
            </span>
          )}
          {fine.status === "WAIVED" && (
            <span className="flex items-center gap-1 text-[11px] font-medium text-gray-400">
              <XCircle className="w-3 h-3" /> {t("waived")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
