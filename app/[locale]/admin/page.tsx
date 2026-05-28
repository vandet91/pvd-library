import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import Link from "next/link";
import {
  BookOpen, Users, ArrowLeftRight, AlertCircle,
  BookMarked, ShoppingCart, Clock, AlertTriangle,
  RotateCcw, UserPlus, BookPlus, ShoppingBasket,
  Printer, ChevronRight, CheckCircle2,
  TrendingUp, TrendingDown, Minus,
  BookCheck, RefreshCcw, UserCheck, CalendarCheck,
} from "lucide-react";
import DashboardLoanChart from "@/components/admin/DashboardLoanChart";

async function getStats() {
  const now  = new Date();
  const soon = new Date(now);
  soon.setDate(soon.getDate() + 30);

  // Today's boundaries
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd   = new Date(todayStart.getTime() + 86_400_000);

  // This month start
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Last week boundary (7 days ago)
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);

  // Last month boundaries (for chart)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    totalBooks,
    totalMembers,
    activeLoans,
    overdueLoans,
    totalEbooks,
    pendingReservations,
    expiringMembers,
    // Today
    issuedToday,
    returnedToday,
    newMembersToday,
    reservationsToday,
    // Trend deltas
    booksThisMonth,
    membersThisMonth,
    loansThisWeek,
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
    // Today counters
    prisma.loan.count({ where: { createdAt: { gte: todayStart, lt: todayEnd } } }),
    prisma.loan.count({ where: { status: "RETURNED", returnDate: { gte: todayStart, lt: todayEnd } } }),
    prisma.member.count({ where: { createdAt: { gte: todayStart, lt: todayEnd } } }),
    prisma.reservation.count({ where: { createdAt: { gte: todayStart, lt: todayEnd } } }),
    // Trend deltas
    prisma.book.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.member.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.loan.count({ where: { createdAt: { gte: weekAgo } } }),
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

  // Chart: loan counts per day for this month + last month
  const [thisMonthLoans, lastMonthLoans] = await Promise.all([
    prisma.loan.findMany({
      where:  { borrowDate: { gte: monthStart, lt: todayEnd } },
      select: { borrowDate: true },
    }),
    prisma.loan.findMany({
      where:  { borrowDate: { gte: lastMonthStart, lt: lastMonthEnd } },
      select: { borrowDate: true },
    }),
  ]);

  const thisMonthByDay: Record<number, number> = {};
  for (const l of thisMonthLoans) {
    const d = new Date(l.borrowDate).getDate();
    thisMonthByDay[d] = (thisMonthByDay[d] ?? 0) + 1;
  }
  const lastMonthByDay: Record<number, number> = {};
  for (const l of lastMonthLoans) {
    const d = new Date(l.borrowDate).getDate();
    lastMonthByDay[d] = (lastMonthByDay[d] ?? 0) + 1;
  }

  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const chartData = Array.from({ length: daysInMonth }, (_, i) => ({
    day:       i + 1,
    thisMonth: thisMonthByDay[i + 1] ?? 0,
    lastMonth: lastMonthByDay[i + 1] ?? 0,
  }));

  return {
    totalBooks, totalMembers, activeLoans, overdueLoans,
    totalEbooks, pendingReservations, pendingRequests,
    expiringMembers, recentLoans,
    issuedToday, returnedToday, newMembersToday, reservationsToday,
    booksThisMonth, membersThisMonth, loansThisWeek,
    chartData,
  };
}

const memberTypeColor: Record<string, string> = {
  STUDENT: "bg-blue-100 text-blue-700",
  TEACHER: "bg-violet-100 text-violet-700",
  STAFF:   "bg-amber-100 text-amber-700",
  PUBLIC:  "bg-gray-100 text-gray-600",
};

function TrendBadge({ delta, suffix }: { delta: number; suffix: string }) {
  if (delta === 0) return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-gray-400">
      <Minus className="w-3 h-3" />
      0
    </span>
  );
  const up = delta > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${up ? "text-emerald-600" : "text-red-500"}`}>
      {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {up ? "+" : ""}{delta} <span className="font-normal text-gray-400">{suffix}</span>
    </span>
  );
}

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const [t, tc, s, session] = await Promise.all([
    getTranslations("dashboard"),
    getTranslations("common"),
    getStats(),
    auth(),
  ]);

  const userName = session?.user?.name?.split(" ")[0] ?? "Admin";

  // Greeting & date
  const now = new Date();
  const dateStr = now.toLocaleDateString(locale === "km" ? "km-KH" : "en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const LOAN_STATUS: Record<string, string> = {
    ACTIVE:   t("statusActive"),
    OVERDUE:  t("statusOverdue"),
    RETURNED: t("statusReturned"),
  };

  const statCards = [
    {
      label: t("totalBooks"),   value: s.totalBooks,   icon: BookOpen,       color: "bg-blue-500",
      href: `/${locale}/admin/books`,
      delta: s.booksThisMonth,  deltaSuffix: t("thisMonth"),
    },
    {
      label: t("totalMembers"), value: s.totalMembers, icon: Users,          color: "bg-emerald-500",
      href: `/${locale}/admin/members`,
      delta: s.membersThisMonth, deltaSuffix: t("thisMonth"),
    },
    {
      label: t("activeLoans"),  value: s.activeLoans,  icon: ArrowLeftRight, color: "bg-violet-500",
      href: `/${locale}/admin/circulation`,
      delta: s.loansThisWeek,   deltaSuffix: t("thisWeek"),
    },
    {
      label: t("overdueLoans"), value: s.overdueLoans, icon: AlertCircle,
      color: s.overdueLoans > 0 ? "bg-red-500" : "bg-gray-400",
      href: `/${locale}/admin/circulation`,
      delta: null, deltaSuffix: "",
    },
  ];

  const secondaryCards = [
    { label: t("totalEbooks"),         value: s.totalEbooks,          icon: BookMarked,    color: "bg-cyan-500",   href: `/${locale}/admin/ebooks` },
    { label: t("pendingReservations"), value: s.pendingReservations,  icon: ShoppingCart,  color: "bg-orange-500", href: `/${locale}/admin/reservations` },
    { label: t("pendingRequests"),     value: s.pendingRequests,      icon: Clock,         color: "bg-pink-500",   href: `/${locale}/admin/book-requests` },
    {
      label: t("expiringSoon"),
      value: s.expiringMembers.length,
      icon: AlertTriangle,
      color: s.expiringMembers.length > 0 ? "bg-amber-500" : "bg-gray-400",
      href: `/${locale}/admin/members`,
    },
  ];

  const quickActions = [
    { label: t("borrowBook"),     href: `/${locale}/admin/circulation`,    icon: ArrowLeftRight, color: "bg-blue-50   text-blue-700   hover:bg-blue-100" },
    { label: t("returnBook"),     href: `/${locale}/admin/circulation`,    icon: RotateCcw,      color: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" },
    { label: t("addBook"),        href: `/${locale}/admin/books/new`,      icon: BookPlus,       color: "bg-violet-50 text-violet-700  hover:bg-violet-100" },
    { label: t("addMember"),      href: `/${locale}/admin/members/new`,    icon: UserPlus,       color: "bg-orange-50 text-orange-700  hover:bg-orange-100" },
    { label: t("baskets"),        href: `/${locale}/admin/baskets`,        icon: ShoppingBasket, color: "bg-indigo-50 text-indigo-700  hover:bg-indigo-100" },
    { label: t("printLabels"),    href: `/${locale}/admin/books/labels`,   icon: Printer,        color: "bg-teal-50   text-teal-700    hover:bg-teal-100" },
    { label: t("pendingRequests"),href: `/${locale}/admin/book-requests`,  icon: Clock,          color: "bg-pink-50   text-pink-700    hover:bg-pink-100" },
  ];

  const todayStats = [
    { label: t("issuedToday"),      value: s.issuedToday,      icon: BookCheck,   color: "text-indigo-600",  bg: "bg-indigo-50" },
    { label: t("returnedToday"),    value: s.returnedToday,    icon: RefreshCcw,  color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: t("newMembersToday"),  value: s.newMembersToday,  icon: UserCheck,   color: "text-blue-600",    bg: "bg-blue-50" },
    { label: t("reservationsToday"),value: s.reservationsToday,icon: CalendarCheck,color:"text-orange-600", bg: "bg-orange-50" },
  ];

  return (
    <div className="space-y-5">

      {/* ── Welcome greeting ── */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {t("welcomeBack", { name: userName })}
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">{dateStr}</p>
        </div>
        {s.overdueLoans > 0 && (
          <Link href={`/${locale}/admin/circulation`}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-red-50 text-red-600 rounded-full hover:bg-red-100 transition-colors">
            <AlertCircle className="w-3.5 h-3.5" />
            {t("overdueCount", { count: s.overdueLoans })}
          </Link>
        )}
      </div>

      {/* ── Primary stat cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {statCards.map(({ label, value, icon: Icon, color, href, delta, deltaSuffix }) => (
          <Link key={label} href={href}
            className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow flex items-center gap-4 group">
            <div className={`w-11 h-11 ${color} rounded-xl flex items-center justify-center flex-shrink-0`}>
              <Icon className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-bold text-gray-900">{value}</p>
              <p className="text-xs text-gray-500 truncate">{label}</p>
              {delta !== null && (
                <div className="mt-0.5">
                  <TrendBadge delta={delta} suffix={deltaSuffix} />
                </div>
              )}
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

        {/* ── Left: Chart + Recent Activity ── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Loan Activity Chart */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="font-semibold text-gray-800 mb-4 text-sm">{t("loanActivity")}</h2>
            <DashboardLoanChart
              data={s.chartData}
              thisMonthLabel={t("thisMonth")}
              lastMonthLabel={t("lastMonth")}
              dayLabel={t("day")}
            />
          </div>

          {/* Recent Activity */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="font-semibold text-gray-800 mb-4 text-sm">{t("recentActivity")}</h2>
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
            <div className="mt-4 pt-3 border-t border-gray-50">
              <Link href={`/${locale}/admin/circulation`}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1">
                {t("viewAllCirculation")} <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>

        {/* ── Right column ── */}
        <div className="space-y-5">

          {/* Today's Overview */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h2 className="font-semibold text-gray-800 mb-3 text-sm">{t("todayOverview")}</h2>
            <div className="grid grid-cols-2 gap-3">
              {todayStats.map(({ label, value, icon: Icon, color, bg }) => (
                <div key={label} className={`${bg} rounded-xl p-3 flex flex-col gap-1`}>
                  <div className={`${color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <p className={`text-xl font-bold ${color}`}>{value}</p>
                  <p className="text-[11px] text-gray-500 leading-tight">{label}</p>
                </div>
              ))}
            </div>
          </div>

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
