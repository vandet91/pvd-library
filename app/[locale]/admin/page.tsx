import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import {
  BookOpen, Users, ArrowLeftRight, AlertCircle,
  BookMarked, ShoppingCart, Clock, AlertTriangle,
  RotateCcw, UserPlus, BookPlus, ShoppingBasket,
  Printer, ChevronRight, CheckCircle2,
} from "lucide-react";

async function getStats() {
  const now  = new Date();
  const soon = new Date(now);
  soon.setDate(soon.getDate() + 30);

  const [
    totalBooks,
    totalMembers,
    activeLoans,
    overdueLoans,
    totalEbooks,
    pendingReservations,
    expiringMembers,
  ] = await Promise.all([
    prisma.book.count(),
    prisma.member.count({ where: { isActive: true } }),
    prisma.loan.count({ where: { status: "ACTIVE" } }),
    prisma.loan.count({ where: { status: "OVERDUE" } }),
    prisma.ebook.count(),
    prisma.reservation.count({ where: { status: "PENDING" } }),
    prisma.member.findMany({
      where: {
        isActive: true,
        expireDate: { not: null, lte: soon, gte: now },
      },
      select: { id: true, name: true, memberId: true, expireDate: true, memberType: true },
      orderBy: { expireDate: "asc" },
      take: 5,
    }),
  ]);

  let pendingRequests = 0;
  try {
    pendingRequests = await (prisma as unknown as { bookRequest: { count: (a: unknown) => Promise<number> } })
      .bookRequest.count({ where: { status: "PENDING" } });
  } catch { /* model not yet in cached client */ }

  const recentLoans = await prisma.loan.findMany({
    take: 8,
    orderBy: { createdAt: "desc" },
    include: {
      member: { select: { id: true, name: true } },
      book:   { select: { title: true } },
    },
  });

  return {
    totalBooks, totalMembers, activeLoans, overdueLoans,
    totalEbooks, pendingReservations, pendingRequests,
    expiringMembers, recentLoans,
  };
}

const memberTypeColor: Record<string, string> = {
  STUDENT: "bg-blue-100 text-blue-700",
  TEACHER: "bg-violet-100 text-violet-700",
  STAFF:   "bg-amber-100 text-amber-700",
  PUBLIC:  "bg-gray-100 text-gray-600",
};

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t  = await getTranslations("dashboard");
  const tc = await getTranslations("common");
  const s  = await getStats();

  const LOAN_STATUS: Record<string, string> = {
    ACTIVE:   t("statusActive"),
    OVERDUE:  t("statusOverdue"),
    RETURNED: t("statusReturned"),
  };

  const statCards = [
    { label: t("totalBooks"),   value: s.totalBooks,   icon: BookOpen,       color: "bg-blue-500",    href: `/${locale}/admin/books` },
    { label: t("totalMembers"), value: s.totalMembers, icon: Users,          color: "bg-emerald-500", href: `/${locale}/admin/members` },
    { label: t("activeLoans"),  value: s.activeLoans,  icon: ArrowLeftRight, color: "bg-violet-500",  href: `/${locale}/admin/circulation` },
    { label: t("overdueLoans"), value: s.overdueLoans, icon: AlertCircle,    color: s.overdueLoans > 0 ? "bg-red-500" : "bg-gray-400", href: `/${locale}/admin/circulation` },
  ];

  const secondaryCards = [
    { label: t("totalEbooks"),        value: s.totalEbooks,          icon: BookMarked,    color: "bg-cyan-500",   href: `/${locale}/admin/ebooks` },
    { label: t("pendingReservations"), value: s.pendingReservations, icon: ShoppingCart,  color: "bg-orange-500", href: `/${locale}/admin/reservations` },
    { label: t("pendingRequests"),    value: s.pendingRequests,      icon: Clock,         color: "bg-pink-500",   href: `/${locale}/admin/book-requests` },
    { label: t("expiringSoon"),       value: s.expiringMembers.length, icon: AlertTriangle, color: s.expiringMembers.length > 0 ? "bg-amber-500" : "bg-gray-400", href: `/${locale}/admin/members` },
  ];

  const quickActions = [
    { label: t("borrowBook"),  href: `/${locale}/admin/circulation`,   icon: ArrowLeftRight, color: "bg-blue-50   text-blue-700   hover:bg-blue-100" },
    { label: t("returnBook"),  href: `/${locale}/admin/circulation`,   icon: RotateCcw,      color: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" },
    { label: t("addBook"),     href: `/${locale}/admin/books/new`,     icon: BookPlus,       color: "bg-violet-50 text-violet-700  hover:bg-violet-100" },
    { label: t("addMember"),       href: `/${locale}/admin/members/new`,   icon: UserPlus,       color: "bg-orange-50 text-orange-700  hover:bg-orange-100" },
    { label: t("baskets"),        href: `/${locale}/admin/baskets`,       icon: ShoppingBasket, color: "bg-indigo-50 text-indigo-700  hover:bg-indigo-100" },
    { label: t("printLabels"),    href: `/${locale}/admin/books/labels`,  icon: Printer,        color: "bg-teal-50   text-teal-700    hover:bg-teal-100" },
    { label: t("pendingRequests"), href: `/${locale}/admin/book-requests`, icon: Clock,         color: "bg-pink-50   text-pink-700    hover:bg-pink-100" },
  ];

  return (
    <div className="space-y-6">

      {/* ── Primary stat cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {statCards.map(({ label, value, icon: Icon, color, href }) => (
          <Link key={label} href={href}
            className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow flex items-center gap-4 group">
            <div className={`w-11 h-11 ${color} rounded-xl flex items-center justify-center flex-shrink-0`}>
              <Icon className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-bold text-gray-900">{value}</p>
              <p className="text-xs text-gray-500 mt-0.5 truncate">{label}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* ── Secondary stat row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {secondaryCards.map(({ label, value, icon: Icon, color, href }) => (
          <Link key={label} href={href}
            className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow flex items-center gap-3">
            <div className={`w-9 h-9 ${color} rounded-lg flex items-center justify-center flex-shrink-0`}>
              <Icon className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold text-gray-900">{value}</p>
              <p className="text-xs text-gray-500 truncate">{label}</p>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ── Recent Activity ── */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="font-semibold text-gray-800 mb-4">{t("recentActivity")}</h2>
          {s.recentLoans.length === 0 ? (
            <p className="text-gray-400 text-sm">{tc("noData")}</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {s.recentLoans.map((loan) => {
                const isOverdue  = loan.status === "OVERDUE";
                const isReturned = loan.status === "RETURNED";
                return (
                  <div key={loan.id} className="flex items-center gap-3 py-2.5">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      isReturned ? "bg-green-400" : isOverdue ? "bg-red-400" : "bg-blue-400"
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{loan.book.title}</p>
                      <Link
                        href={`/${locale}/admin/members/${loan.member.id}`}
                        className="text-xs text-indigo-600 hover:underline"
                      >
                        {loan.member.name}
                      </Link>
                    </div>
                    <span className={`shrink-0 text-xs px-2 py-1 rounded-full font-medium flex items-center gap-1 ${
                      isReturned ? "bg-green-100 text-green-700" :
                      isOverdue  ? "bg-red-100   text-red-700"   :
                                   "bg-blue-100  text-blue-700"
                    }`}>
                      {isReturned && <CheckCircle2 className="w-3 h-3" />}
                      {isOverdue  && <AlertCircle  className="w-3 h-3" />}
                      {LOAN_STATUS[loan.status] ?? loan.status}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="mt-4 pt-3 border-t border-gray-50 flex items-center justify-between">
            <Link href={`/${locale}/admin/circulation`}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1">
              {t("viewAllCirculation")} <ChevronRight className="w-3.5 h-3.5" />
            </Link>
            {s.overdueLoans > 0 && (
              <Link href={`/${locale}/admin/circulation`}
                className="text-xs text-red-600 hover:text-red-800 font-medium flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                {t("overdueCount", { count: s.overdueLoans })}
              </Link>
            )}
          </div>
        </div>

        {/* ── Right column ── */}
        <div className="space-y-5">

          {/* Quick Actions */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h2 className="font-semibold text-gray-800 mb-3 text-sm">{t("quickActions")}</h2>
            <div className="space-y-1.5">
              {quickActions.map(({ label, href, icon: Icon, color }) => (
                <Link key={label} href={href}
                  className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors ${color}`}>
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  {label}
                </Link>
              ))}
            </div>
          </div>

          {/* Expiring memberships */}
          {s.expiringMembers.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-amber-100 p-5">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <h2 className="font-semibold text-gray-800 text-sm">{t("membershipsExpiring")}</h2>
              </div>
              <div className="space-y-1.5">
                {s.expiringMembers.map((m) => {
                  const daysLeft = Math.ceil(
                    (new Date(m.expireDate!).getTime() - Date.now()) / 86_400_000,
                  );
                  return (
                    <Link key={m.id} href={`/${locale}/admin/members/${m.id}`}
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-amber-50 transition-colors">
                      <div className="min-w-0 mr-2">
                        <p className="text-sm font-medium text-gray-800 truncate">{m.name}</p>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${memberTypeColor[m.memberType] ?? "bg-gray-100"}`}>
                          {m.memberType}
                        </span>
                      </div>
                      <span className={`shrink-0 text-xs font-semibold px-2 py-1 rounded-full ${
                        daysLeft <= 7 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                      }`}>
                        {daysLeft}d
                      </span>
                    </Link>
                  );
                })}
              </div>
              <div className="mt-2 pt-2 border-t border-amber-50">
                <Link href={`/${locale}/admin/members`}
                  className="text-xs text-amber-700 hover:text-amber-900 font-medium flex items-center gap-1">
                  {t("manageMembers")} <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
