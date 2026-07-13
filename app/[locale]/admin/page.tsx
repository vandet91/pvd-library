export const dynamic = "force-dynamic";

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
  ShoppingBag, DollarSign, Package, Landmark,
  BadgeDollarSign, Users2,
} from "lucide-react";
import DashboardLoanChart from "@/components/admin/DashboardLoanChart";
import { formatPrice } from "@/lib/price-format";

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

  // Available vs total copies
  const copyStats = await prisma.bookCopy.aggregate({
    _count: { id: true },
    where:  { status: "AVAILABLE" },
  });
  const totalCopies     = await prisma.bookCopy.count();
  const availableCopies = copyStats._count.id;

  // Unpaid fines
  const unpaidFines = await prisma.fine.aggregate({
    where: { status: "UNPAID" },
    _sum:   { amount: true },
    _count: { id: true },
  });

  // Audience level distribution
  const audienceDist = await prisma.book.groupBy({
    by:      ["audienceLevel"],
    _count:  { id: true },
    orderBy: { _count: { id: "desc" } },
  });

  // Branch copy distribution (top 5)
  const branchCopies = await prisma.bookCopy.groupBy({
    by:      ["branchId"],
    where:   { branchId: { not: null } },
    _count:  { id: true },
    orderBy: { _count: { id: "desc" } },
    take:    5,
  });
  const branchIds = branchCopies.map((b) => b.branchId!).filter(Boolean);
  const branchNames = branchIds.length > 0
    ? await prisma.branch.findMany({ where: { id: { in: branchIds } }, select: { id: true, name: true } })
    : [];

  let pendingRequests = 0;
  try {
    pendingRequests = await (prisma as unknown as { bookRequest: { count: (a: unknown) => Promise<number> } })
      .bookRequest.count({ where: { status: "PENDING" } });
  } catch { /* model not yet in cached client */ }

  // ── Bookstore stats (only when sale enabled) ────────────────────────────
  const saleSetting = await prisma.settings.findUnique({ where: { key: "BOOK_SALE_ENABLED" } });
  const saleEnabled = saleSetting?.value === "true";
  const currencySetting = await prisma.settings.findUnique({ where: { key: "STOCK_CURRENCY" } });
  const saleCurrency = currencySetting?.value ?? "USD";

  let pendingPaymentOrders = 0;
  let revenueThisMonth     = 0;
  let ordersToday          = 0;
  let revenueTodayAmount   = 0;
  let recentOrders: { id: string; orderNumber: string; status: string; total: number; currency: string; memberRel: { name: string } | null }[] = [];

  if (saleEnabled) {
    const [pendingAgg, revenueAgg, ordersTodayCount, revTodayAgg, latestOrders] = await Promise.all([
      prisma.saleOrder.count({ where: { status: "PAYMENT_SUBMITTED" } }),
      prisma.saleOrder.aggregate({
        where:   { status: { in: ["PAYMENT_CONFIRMED", "PREPARING", "READY_FOR_PICKUP", "SHIPPED", "COMPLETED"] }, createdAt: { gte: monthStart } },
        _sum:    { total: true },
      }),
      prisma.saleOrder.count({ where: { createdAt: { gte: todayStart, lt: todayEnd } } }),
      prisma.saleOrder.aggregate({
        where: { status: { in: ["PAYMENT_CONFIRMED", "PREPARING", "READY_FOR_PICKUP", "SHIPPED", "COMPLETED"] }, createdAt: { gte: todayStart, lt: todayEnd } },
        _sum:  { total: true },
      }),
      prisma.saleOrder.findMany({
        take:    6,
        orderBy: { createdAt: "desc" },
        select:  { id: true, orderNumber: true, status: true, total: true, currency: true, memberRel: { select: { name: true } } },
      }),
    ]);
    pendingPaymentOrders = pendingAgg;
    revenueThisMonth     = revenueAgg._sum.total ?? 0;
    ordersToday          = ordersTodayCount;
    revenueTodayAmount   = revTodayAgg._sum.total ?? 0;
    recentOrders         = latestOrders;
  }

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
    // Copies
    totalCopies, availableCopies,
    // Fines
    unpaidFinesAmount: unpaidFines._sum.amount ?? 0,
    unpaidFinesCount:  unpaidFines._count.id,
    // Audience
    audienceDist: audienceDist.map((g) => ({ level: String(g.audienceLevel), count: g._count.id })),
    // Branches
    branchCopyDist: branchCopies.map((b) => ({
      branchId:   b.branchId!,
      branchName: branchNames.find((n) => n.id === b.branchId)?.name ?? "Unknown",
      count:      b._count.id,
    })),
    // Bookstore
    saleEnabled, saleCurrency,
    pendingPaymentOrders, revenueThisMonth,
    ordersToday, revenueTodayAmount, recentOrders,
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

  const availabilityPct = s.totalCopies > 0
    ? Math.round((s.availableCopies / s.totalCopies) * 100)
    : 0;

  const AUDIENCE_COLORS: Record<string, string> = {
    CHILDREN:    "bg-pink-400",
    YOUTH:       "bg-purple-400",
    ADULTS:      "bg-blue-400",
    UNSPECIFIED: "bg-gray-300",
  };

  const ORDER_STATUS_COLOR: Record<string, string> = {
    PENDING_PAYMENT:   "bg-amber-100 text-amber-700",
    PAYMENT_SUBMITTED: "bg-blue-100 text-blue-700",
    PAYMENT_CONFIRMED: "bg-cyan-100 text-cyan-700",
    PREPARING:         "bg-indigo-100 text-indigo-700",
    READY_FOR_PICKUP:  "bg-purple-100 text-purple-700",
    SHIPPED:           "bg-violet-100 text-violet-700",
    COMPLETED:         "bg-green-100 text-green-700",
    CANCELLED:         "bg-red-100 text-red-700",
  };

  const quickActions = [
    { label: t("borrowBook"),     href: `/${locale}/admin/circulation`,    icon: ArrowLeftRight, color: "bg-blue-50   text-blue-700   hover:bg-blue-100" },
    { label: t("returnBook"),     href: `/${locale}/admin/circulation`,    icon: RotateCcw,      color: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" },
    { label: t("addBook"),        href: `/${locale}/admin/books/new`,      icon: BookPlus,       color: "bg-violet-50 text-violet-700  hover:bg-violet-100" },
    { label: t("addMember"),      href: `/${locale}/admin/members/new`,    icon: UserPlus,       color: "bg-orange-50 text-orange-700  hover:bg-orange-100" },
    { label: t("baskets"),        href: `/${locale}/admin/baskets`,        icon: ShoppingBasket, color: "bg-indigo-50 text-indigo-700  hover:bg-indigo-100" },
    { label: t("printLabels"),    href: `/${locale}/admin/books/labels`,   icon: Printer,        color: "bg-teal-50   text-teal-700    hover:bg-teal-100" },
    { label: t("pendingRequests"),href: `/${locale}/admin/book-requests`,  icon: Clock,          color: "bg-pink-50   text-pink-700    hover:bg-pink-100" },
    ...(s.saleEnabled ? [{ label: "View Orders", href: `/${locale}/admin/orders`, icon: ShoppingBag, color: "bg-amber-50  text-amber-700  hover:bg-amber-100" }] : []),
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
        <div className="flex items-center gap-2 flex-wrap">
          {s.overdueLoans > 0 && (
            <Link href={`/${locale}/admin/circulation`}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-red-50 text-red-600 rounded-full hover:bg-red-100 transition-colors">
              <AlertCircle className="w-3.5 h-3.5" />
              {t("overdueCount", { count: s.overdueLoans })}
            </Link>
          )}
          {s.unpaidFinesCount > 0 && (
            <Link href={`/${locale}/admin/fines`}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-orange-50 text-orange-700 rounded-full hover:bg-orange-100 transition-colors">
              <BadgeDollarSign className="w-3.5 h-3.5" />
              ${s.unpaidFinesAmount.toFixed(2)} unpaid fines ({s.unpaidFinesCount})
            </Link>
          )}
          {s.saleEnabled && s.pendingPaymentOrders > 0 && (
            <Link href={`/${locale}/admin/orders`}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-amber-50 text-amber-700 rounded-full hover:bg-amber-100 transition-colors animate-pulse">
              <ShoppingBag className="w-3.5 h-3.5" />
              {s.pendingPaymentOrders} order{s.pendingPaymentOrders !== 1 ? "s" : ""} need payment review
            </Link>
          )}
        </div>
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

      {/* ── Bookstore KPI strip (when enabled) ── */}
      {s.saleEnabled && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Link href={`/${locale}/admin/orders`}
            className={`rounded-xl p-4 shadow-sm border flex items-center gap-3 hover:shadow-md transition-shadow ${
              s.pendingPaymentOrders > 0 ? "bg-amber-50 border-amber-200" : "bg-white border-gray-100"
            }`}>
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
              s.pendingPaymentOrders > 0 ? "bg-amber-500" : "bg-gray-300"
            }`}>
              <ShoppingBag className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <p className={`text-lg font-bold ${s.pendingPaymentOrders > 0 ? "text-amber-700" : "text-gray-900"}`}>
                {s.pendingPaymentOrders}
              </p>
              <p className="text-xs text-gray-500 truncate">Pending Payment Review</p>
            </div>
          </Link>

          <Link href={`/${locale}/admin/orders`}
            className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow flex items-center gap-3">
            <div className="w-9 h-9 bg-emerald-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <DollarSign className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold text-gray-900 truncate">{formatPrice(s.revenueThisMonth, s.saleCurrency)}</p>
              <p className="text-xs text-gray-500 truncate">Revenue This Month</p>
            </div>
          </Link>

          <Link href={`/${locale}/admin/orders`}
            className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow flex items-center gap-3">
            <div className="w-9 h-9 bg-violet-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <Package className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold text-gray-900">{s.ordersToday}</p>
              <p className="text-xs text-gray-500 truncate">Orders Today</p>
            </div>
          </Link>

          <Link href={`/${locale}/admin/orders`}
            className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow flex items-center gap-3">
            <div className="w-9 h-9 bg-teal-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <TrendingUp className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold text-gray-900 truncate">{formatPrice(s.revenueTodayAmount, s.saleCurrency)}</p>
              <p className="text-xs text-gray-500 truncate">Revenue Today</p>
            </div>
          </Link>
        </div>
      )}

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

          {/* Recent Sales Orders (when enabled) */}
          {s.saleEnabled && s.recentOrders.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-amber-500" />
                  Recent Sale Orders
                </h2>
                <Link href={`/${locale}/admin/orders`} className="text-xs text-amber-600 hover:text-amber-800 font-medium flex items-center gap-1">
                  View all <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
              <div className="divide-y divide-gray-50">
                {s.recentOrders.map((order) => (
                  <Link key={order.id} href={`/${locale}/admin/orders`}
                    className="flex items-center justify-between py-2.5 hover:bg-gray-50/50 -mx-2 px-2 rounded-lg transition-colors">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-mono font-semibold text-gray-800">{order.orderNumber}</p>
                      <p className="text-xs text-gray-400 truncate">{order.memberRel?.name ?? "—"}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${ORDER_STATUS_COLOR[order.status] ?? "bg-gray-100 text-gray-600"}`}>
                        {order.status.replace(/_/g, " ")}
                      </span>
                      <p className="text-xs font-bold text-amber-600">{formatPrice(order.total, order.currency)}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

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

          {/* Copy Availability */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h2 className="font-semibold text-gray-800 mb-3 text-sm flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-blue-500" /> Collection Health
            </h2>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Available copies</span>
                  <span className="font-semibold text-gray-800">{s.availableCopies} / {s.totalCopies} ({availabilityPct}%)</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-400 rounded-full transition-all"
                    style={{ width: `${availabilityPct}%` }} />
                </div>
              </div>
              {/* Audience breakdown */}
              {s.audienceDist.length > 0 && (
                <div className="pt-2 border-t border-gray-50">
                  <p className="text-xs text-gray-400 mb-2">Audience Level</p>
                  <div className="space-y-1.5">
                    {s.audienceDist.map((g) => {
                      const pct = s.totalBooks > 0 ? Math.round((g.count / s.totalBooks) * 100) : 0;
                      return (
                        <div key={g.level}>
                          <div className="flex justify-between text-xs mb-0.5">
                            <span className="text-gray-600 capitalize">{g.level.charAt(0) + g.level.slice(1).toLowerCase()}</span>
                            <span className="text-gray-500">{g.count} ({pct}%)</span>
                          </div>
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${AUDIENCE_COLORS[g.level] ?? "bg-gray-300"}`}
                              style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {/* Branch breakdown */}
              {s.branchCopyDist.length > 0 && (
                <div className="pt-2 border-t border-gray-50">
                  <p className="text-xs text-gray-400 mb-2 flex items-center gap-1">
                    <Landmark className="w-3 h-3" /> Copies by Branch
                  </p>
                  <div className="space-y-1.5">
                    {s.branchCopyDist.map((b) => {
                      const pct = s.totalCopies > 0 ? Math.round((b.count / s.totalCopies) * 100) : 0;
                      return (
                        <div key={b.branchId}>
                          <div className="flex justify-between text-xs mb-0.5">
                            <span className="text-gray-600 truncate max-w-[140px]">{b.branchName}</span>
                            <span className="text-gray-500">{b.count} ({pct}%)</span>
                          </div>
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
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
