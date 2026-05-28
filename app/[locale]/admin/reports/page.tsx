"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  BarChart3, TrendingUp, ArrowLeftRight, AlertTriangle, DollarSign,
  Download, BookOpen, Package, Users, BookMarked, Calendar,
  PackageX, Archive, MessageSquare, Clock, CheckCircle2,
  Loader2, FileSpreadsheet, RefreshCw,
  List, Layers, Globe, Tag, MapPin, RotateCcw, Star, UserCheck, Bell, Hash, Wifi,
} from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

/* ── Types ──────────────────────────────────────────────────────────────── */
interface ReportData {
  totalBorrowed: number;
  totalReturned: number;
  totalOverdue: number;
  totalFinesCollected: number;
  totalBooks?: number;
  totalCopies?: number;
  activeMembers?: number;
  copyStatusDistribution?: { name: string; count: number }[];
  copyConditionDistribution?: { name: string; count: number }[];
  popularBooks: { id: string; title: string; borrowCount: number; author?: { name: string } }[];
  monthlyLoans: { month: string; loans: number }[];
  categoryDistribution: { name: string; count: number }[];
  materialTypeDistribution: { name: string; count: number }[];
  topMembers: { name: string; loans: number }[];
  finesByMonth: { month: string; amount: number }[];
}

interface CustomReportData {
  type: string;
  count: number;
  columns: { key: string; label: string }[];
  rows: Record<string, string | number | null>[];
}

/* ── Constants ──────────────────────────────────────────────────────────── */
const STATUS_COLORS: Record<string, string> = {
  AVAILABLE: "#10b981", BORROWED: "#3b82f6", RESERVED: "#a855f7",
  LOST: "#ef4444", DAMAGED: "#f97316", WITHDRAWN: "#9ca3af",
};
const MAT_LABELS: Record<string, string> = {
  BOOK: "Book", MAGAZINE: "Magazine", JOURNAL: "Journal", NEWSPAPER: "Newspaper",
  DVD: "DVD", AUDIO_CD: "Audio CD", THESIS: "Thesis", MAP: "Map", OTHER: "Other",
};
const PIE_COLORS = ["#1e3a8a","#3b82f6","#60a5fa","#93c5fd","#bfdbfe","#dbeafe","#eff6ff","#6366f1","#8b5cf6","#a78bfa"];

// Richer palette for the donut chart: dark navy → teal → amber → purple → rose
const DONUT_COLORS = [
  "#1e3a8a", // deep navy  – Fiction
  "#0ea5e9", // sky blue   – Technology
  "#f59e0b", // amber      – Science
  "#8b5cf6", // violet     – History
  "#d1d5db", // light gray – Others
  "#10b981", // emerald
  "#ef4444", // red
  "#f97316", // orange
  "#06b6d4", // cyan
  "#a855f7", // purple
];

// tKey-based catalog — labels/descs are looked up via t(key) at render time
const REPORT_GROUPS = [
  "groupCirculation",
  "groupOverdue",
  "groupCollection",
  "groupMembers",
  "groupAnalytics",
] as const;

const REPORT_CATALOG = [
  // ── Circulation ──────────────────────────────────────────────────
  {
    id: "active-loans",
    group: "groupCirculation",
    labelKey: "catActiveLoansLabel",
    descKey:  "catActiveLoansDesc",
    icon: ArrowLeftRight,
    color: "text-blue-600 bg-blue-50 border-blue-100",
    activeColor: "border-blue-400 bg-blue-50 text-blue-700",
  },
  {
    id: "all-unreturned",
    group: "groupCirculation",
    labelKey: "catAllUnreturnedLabel",
    descKey:  "catAllUnreturnedDesc",
    icon: Layers,
    color: "text-blue-700 bg-blue-50 border-blue-200",
    activeColor: "border-blue-500 bg-blue-100 text-blue-800",
  },
  {
    id: "loans-by-date",
    group: "groupCirculation",
    labelKey: "catLoansByDateLabel",
    descKey:  "catLoansByDateDesc",
    icon: Calendar,
    color: "text-sky-600 bg-sky-50 border-sky-100",
    activeColor: "border-sky-400 bg-sky-50 text-sky-700",
  },
  {
    id: "returns-by-date",
    group: "groupCirculation",
    labelKey: "catReturnsByDateLabel",
    descKey:  "catReturnsByDateDesc",
    icon: RotateCcw,
    color: "text-teal-600 bg-teal-50 border-teal-100",
    activeColor: "border-teal-400 bg-teal-50 text-teal-700",
  },
  {
    id: "returned-loans",
    group: "groupCirculation",
    labelKey: "catReturnedLoansLabel",
    descKey:  "catReturnedLoansDesc",
    icon: CheckCircle2,
    color: "text-green-600 bg-green-50 border-green-100",
    activeColor: "border-green-400 bg-green-50 text-green-700",
  },
  {
    id: "expiring-today",
    group: "groupCirculation",
    labelKey: "catExpiringTodayLabel",
    descKey:  "catExpiringTodayDesc",
    icon: Bell,
    color: "text-orange-600 bg-orange-50 border-orange-100",
    activeColor: "border-orange-400 bg-orange-50 text-orange-700",
  },
  {
    id: "loans-by-location",
    group: "groupCirculation",
    labelKey: "catLoansByLocationLabel",
    descKey:  "catLoansByLocationDesc",
    icon: MapPin,
    color: "text-cyan-600 bg-cyan-50 border-cyan-100",
    activeColor: "border-cyan-400 bg-cyan-50 text-cyan-700",
  },
  {
    id: "reservations",
    group: "groupCirculation",
    labelKey: "catReservationsLabel",
    descKey:  "catReservationsDesc",
    icon: BookMarked,
    color: "text-purple-600 bg-purple-50 border-purple-100",
    activeColor: "border-purple-400 bg-purple-50 text-purple-700",
  },

  // ── Overdue & Fines ──────────────────────────────────────────────
  {
    id: "overdue",
    group: "groupOverdue",
    labelKey: "catOverdueLabel",
    descKey:  "catOverdueDesc",
    icon: AlertTriangle,
    color: "text-red-600 bg-red-50 border-red-100",
    activeColor: "border-red-400 bg-red-50 text-red-700",
  },
  {
    id: "unpaid-fines",
    group: "groupOverdue",
    labelKey: "catUnpaidFinesLabel",
    descKey:  "catUnpaidFinesDesc",
    icon: DollarSign,
    color: "text-amber-600 bg-amber-50 border-amber-100",
    activeColor: "border-amber-400 bg-amber-50 text-amber-700",
  },

  // ── Books & Collection ───────────────────────────────────────────
  {
    id: "all-books",
    group: "groupCollection",
    labelKey: "catAllBooksLabel",
    descKey:  "catAllBooksDesc",
    icon: BookOpen,
    color: "text-indigo-600 bg-indigo-50 border-indigo-100",
    activeColor: "border-indigo-400 bg-indigo-50 text-indigo-700",
  },
  {
    id: "new-acquisitions",
    group: "groupCollection",
    labelKey: "catNewAcqLabel",
    descKey:  "catNewAcqDesc",
    icon: Calendar,
    color: "text-green-600 bg-green-50 border-green-100",
    activeColor: "border-green-400 bg-green-50 text-green-700",
  },
  {
    id: "books-by-language",
    group: "groupCollection",
    labelKey: "catBooksByLanguageLabel",
    descKey:  "catBooksByLanguageDesc",
    icon: Globe,
    color: "text-indigo-600 bg-indigo-50 border-indigo-100",
    activeColor: "border-indigo-400 bg-indigo-50 text-indigo-700",
  },
  {
    id: "books-by-category",
    group: "groupCollection",
    labelKey: "catBooksByCategoryLabel",
    descKey:  "catBooksByCategoryDesc",
    icon: BookMarked,
    color: "text-purple-600 bg-purple-50 border-purple-100",
    activeColor: "border-purple-400 bg-purple-50 text-purple-700",
  },
  {
    id: "count-by-category",
    group: "groupCollection",
    labelKey: "catCountByCategoryLabel",
    descKey:  "catCountByCategoryDesc",
    icon: Hash,
    color: "text-violet-600 bg-violet-50 border-violet-100",
    activeColor: "border-violet-400 bg-violet-50 text-violet-700",
  },
  {
    id: "copies-by-status",
    group: "groupCollection",
    labelKey: "catCopiesByStatusLabel",
    descKey:  "catCopiesByStatusDesc",
    icon: Layers,
    color: "text-teal-600 bg-teal-50 border-teal-100",
    activeColor: "border-teal-400 bg-teal-50 text-teal-700",
  },
  {
    id: "total-copies",
    group: "groupCollection",
    labelKey: "catTotalCopiesLabel",
    descKey:  "catTotalCopiesDesc",
    icon: Package,
    color: "text-teal-700 bg-teal-50 border-teal-200",
    activeColor: "border-teal-500 bg-teal-100 text-teal-800",
  },
  {
    id: "copies-added",
    group: "groupCollection",
    labelKey: "catCopiesAddedLabel",
    descKey:  "catCopiesAddedDesc",
    icon: Hash,
    color: "text-green-700 bg-green-50 border-green-200",
    activeColor: "border-green-500 bg-green-100 text-green-800",
  },
  {
    id: "with-ebooks",
    group: "groupCollection",
    labelKey: "catWithEbooksLabel",
    descKey:  "catWithEbooksDesc",
    icon: Wifi,
    color: "text-violet-600 bg-violet-50 border-violet-100",
    activeColor: "border-violet-400 bg-violet-50 text-violet-700",
  },
  {
    id: "low-stock",
    group: "groupCollection",
    labelKey: "catLowStockLabel",
    descKey:  "catLowStockDesc",
    icon: PackageX,
    color: "text-orange-600 bg-orange-50 border-orange-100",
    activeColor: "border-orange-400 bg-orange-50 text-orange-700",
  },
  {
    id: "never-borrowed",
    group: "groupCollection",
    labelKey: "catNeverBorrowedLabel",
    descKey:  "catNeverBorrowedDesc",
    icon: Archive,
    color: "text-gray-600 bg-gray-50 border-gray-200",
    activeColor: "border-gray-400 bg-gray-100 text-gray-700",
  },

  // ── Members ──────────────────────────────────────────────────────
  {
    id: "borrowers-list",
    group: "groupMembers",
    labelKey: "catBorrowersListLabel",
    descKey:  "catBorrowersListDesc",
    icon: Users,
    color: "text-blue-600 bg-blue-50 border-blue-100",
    activeColor: "border-blue-400 bg-blue-50 text-blue-700",
  },
  {
    id: "top-borrowers",
    group: "groupMembers",
    labelKey: "catTopBorrowersLabel",
    descKey:  "catTopBorrowersDesc",
    icon: UserCheck,
    color: "text-violet-600 bg-violet-50 border-violet-100",
    activeColor: "border-violet-400 bg-violet-50 text-violet-700",
  },
  {
    id: "expiring-members",
    group: "groupMembers",
    labelKey: "catExpiringLabel",
    descKey:  "catExpiringDesc",
    icon: Clock,
    color: "text-rose-600 bg-rose-50 border-rose-100",
    activeColor: "border-rose-400 bg-rose-50 text-rose-700",
  },
  {
    id: "book-requests",
    group: "groupMembers",
    labelKey: "catBookRequestsLabel",
    descKey:  "catBookRequestsDesc",
    icon: MessageSquare,
    color: "text-indigo-600 bg-indigo-50 border-indigo-100",
    activeColor: "border-indigo-400 bg-indigo-50 text-indigo-700",
  },

  // ── Analytics & Special ──────────────────────────────────────────
  {
    id: "most-borrowed",
    group: "groupAnalytics",
    labelKey: "catMostBorrowedLabel",
    descKey:  "catMostBorrowedDesc",
    icon: TrendingUp,
    color: "text-blue-600 bg-blue-50 border-blue-100",
    activeColor: "border-blue-400 bg-blue-50 text-blue-700",
  },
  {
    id: "most-read-category",
    group: "groupAnalytics",
    labelKey: "catMostReadCategoryLabel",
    descKey:  "catMostReadCategoryDesc",
    icon: Star,
    color: "text-violet-600 bg-violet-50 border-violet-100",
    activeColor: "border-violet-400 bg-violet-50 text-violet-700",
  },
  {
    id: "basket-tagged",
    group: "groupAnalytics",
    labelKey: "catBasketTaggedLabel",
    descKey:  "catBasketTaggedDesc",
    icon: Tag,
    color: "text-emerald-600 bg-emerald-50 border-emerald-100",
    activeColor: "border-emerald-400 bg-emerald-50 text-emerald-700",
  },
  {
    id: "basket-untagged",
    group: "groupAnalytics",
    labelKey: "catBasketUntaggedLabel",
    descKey:  "catBasketUntaggedDesc",
    icon: Tag,
    color: "text-amber-600 bg-amber-50 border-amber-100",
    activeColor: "border-amber-400 bg-amber-50 text-amber-700",
  },
];

const STATUS_BADGE: Record<string, string> = {
  OVERDUE:   "bg-red-100 text-red-700",
  ACTIVE:    "bg-blue-100 text-blue-700",
  RETURNED:  "bg-green-100 text-green-700",
  UNPAID:    "bg-amber-100 text-amber-700",
  PAID:      "bg-green-100 text-green-700",
  PENDING:   "bg-yellow-100 text-yellow-700",
  APPROVED:  "bg-blue-100 text-blue-700",
  READY:     "bg-green-100 text-green-700",
  REJECTED:  "bg-red-100 text-red-700",
  HOME:      "bg-indigo-100 text-indigo-700",
  IN_LIBRARY:"bg-teal-100 text-teal-700",
};

// Maps API-returned English column labels → translation keys in the "reports" namespace
const COL_LABEL_KEYS: Record<string, string> = {
  "Member":      "colMember",
  "Member ID":   "colMemberId",
  "Book":        "colBook",
  "Book Title":  "colBookTitle",
  "Title":       "colTitle",
  "Loan Type":   "colLoanType",
  "Borrow Date": "colBorrowDate",
  "Due Date":    "colDueDate",
  "Days Overdue":"colDaysOverdue",
  "Fine ($)":    "colFine",
  "Fine Status": "colFineStatus",
  "Amount ($)":  "colAmount",
  "Days Late":   "colDaysLate",
  "Returned":    "colReturned",
  "Status":      "colStatus",
  "Hold Shelf":  "colHoldShelf",
  "Expires":     "colExpires",
  "Created":     "colCreated",
  "Requested":   "colRequested",
  "Author":      "colAuthor",
  "Category":    "colCategory",
  "Type":        "colType",
  "ISBN":        "colISBN",
  "Copies":      "colCopies",
  "Added":       "colAdded",
  "Total":       "colTotalCol",
  "Available":   "colAvailable",
  "Location":    "colLocation",
  "Reason":      "colReason",
  "Email":       "colEmail",
  "Phone":       "colPhone",
  "Days Left":   "colDaysLeft",
  "Renewals":    "colRenewals",
  "Name":        "colName",
  // new column labels
  "Return Date": "colReturnDate",
  "Language":    "colLanguage",
  "Count":       "colCount",
  "Title Count": "colTitleCount",
  "Copy #":      "colCopyNo",
  "Barcode":     "colBarcode",
  "Condition":   "colCondition",
  "Loanable":    "colLoanable",
  "Acquired":    "colAcquired",
  "E-Resources": "colEResources",
  "Types":       "colTypes",
  "Rank":        "colRank",
  "Loan Count":  "colLoanCount",
  "Member Type": "colMemberType",
  "Join Date":   "colJoinDate",
  "Basket":      "colBasket",
};

// Maps raw DB status/enum values → translation keys in the "reports" namespace
const STATUS_LABEL_KEYS: Record<string, string> = {
  OVERDUE:    "statusOverdue",
  ACTIVE:     "statusActive",
  RETURNED:   "statusReturned",
  UNPAID:     "statusUnpaid",
  PAID:       "statusPaid",
  PENDING:    "statusPending",
  APPROVED:   "statusApproved",
  READY:      "statusReady",
  REJECTED:   "statusRejected",
  HOME:       "statusHome",
  IN_LIBRARY: "statusInLibrary",
};

/* ═══════════════════════════════════════════════════════════════════════════
   PAGE
════════════════════════════════════════════════════════════════════════════ */
export default function ReportsPage() {
  const t  = useTranslations("reports");
  const tc = useTranslations("common");

  /* shared date range + branch filter */
  const [from,     setFrom]     = useState("");
  const [to,       setTo]       = useState("");
  const [branchId, setBranchId] = useState("");
  const [branchOptions, setBranchOptions] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    fetch("/api/branches")
      .then((r) => r.ok ? r.json() : [])
      .then((brs: { id: string; name: string; isActive: boolean }[]) => {
        if (Array.isArray(brs)) setBranchOptions(brs.filter((b) => b.isActive));
      })
      .catch(() => {});
  }, []);

  /* active tab */
  const [tab, setTab] = useState<"analytics" | "custom">("analytics");

  /* ── Analytics state ── */
  const [data, setData]       = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  /* ── Custom report state ── */
  const [reportType, setReportType]       = useState("overdue");
  const [customData, setCustomData]       = useState<CustomReportData | null>(null);
  const [customLoading, setCustomLoading] = useState(false);
  const [customError, setCustomError]     = useState("");

  /* ── Fetch analytics ── */
  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (from)     params.set("from", from);
    if (to)       params.set("to", to);
    if (branchId) params.set("branchId", branchId);
    const res = await fetch(`/api/reports?${params}`);
    setData(await res.json());
    setLoading(false);
  }, [from, to, branchId]);

  useEffect(() => { fetchAnalytics(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Fetch custom report ── */
  async function fetchCustomReport(type: string) {
    setCustomData(null);
    setCustomError("");
    setCustomLoading(true);
    try {
      const params = new URLSearchParams({ type });
      if (from)     params.set("from", from);
      if (to)       params.set("to", to);
      if (branchId) params.set("branchId", branchId);
      const res = await fetch(`/api/reports/custom?${params}`);
      if (!res.ok) throw new Error(await res.text());
      setCustomData(await res.json());
    } catch (e: unknown) {
      setCustomError(String(e));
    } finally {
      setCustomLoading(false);
    }
  }

  /* ── Export custom report ── */
  function exportCustom(fmt: "csv" | "xlsx") {
    const params = new URLSearchParams({ type: reportType, format: fmt });
    if (from)     params.set("from", from);
    if (to)       params.set("to", to);
    if (branchId) params.set("branchId", branchId);
    window.open(`/api/reports/custom?${params}`, "_blank");
  }

  const stats = data ? [
    { label: t("totalBorrowed"),      value: data.totalBorrowed,                         icon: ArrowLeftRight, color: "text-blue-600 bg-blue-50" },
    { label: t("totalReturned"),       value: data.totalReturned,                         icon: TrendingUp,     color: "text-green-600 bg-green-50" },
    { label: t("totalOverdue"),        value: data.totalOverdue,                          icon: AlertTriangle,  color: "text-red-600 bg-red-50" },
    { label: t("totalFinesCollected"), value: `$${data.totalFinesCollected.toFixed(2)}`,  icon: DollarSign,     color: "text-violet-600 bg-violet-50" },
  ] : [];

  const activeCatalog = REPORT_CATALOG.find((r) => r.id === reportType);

  return (
    <div className="space-y-6">

      {/* ── Page header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
        {tab === "analytics" && (
          <div className="flex gap-2">
            <a href="/api/reports/export?format=xlsx"
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
              <Download className="w-4 h-4" /> Excel
            </a>
            <a href="/api/reports/export?format=csv"
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
              <Download className="w-4 h-4" /> CSV
            </a>
          </div>
        )}
      </div>

      {/* ── Tab switcher ── */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        <button
          onClick={() => setTab("analytics")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === "analytics" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <BarChart3 className="w-4 h-4" /> {t("tabAnalytics")}
        </button>
        <button
          onClick={() => setTab("custom")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === "custom" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" /> {t("tabCustom")}
        </button>
      </div>

      {/* ── Date range filter (shared) ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h2 className="font-semibold text-gray-700 mb-4 text-sm">{t("dateRange")}</h2>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="report-date-from" className="block text-xs text-gray-500 mb-1">{t("from")}</label>
            <input id="report-date-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label htmlFor="report-date-to" className="block text-xs text-gray-500 mb-1">{t("to")}</label>
            <input id="report-date-to" type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          {branchOptions.length > 0 && (
            <div>
              <label htmlFor="report-branch" className="block text-xs text-gray-500 mb-1">{t("branchFilter")}</label>
              <select id="report-branch" value={branchId} onChange={(e) => setBranchId(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                <option value="">{t("allBranchesOption")}</option>
                {branchOptions.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          )}
          {tab === "analytics" ? (
            <button onClick={fetchAnalytics}
              className="flex items-center gap-2 bg-blue-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 transition-colors">
              <BarChart3 className="w-4 h-4" /> {t("generate")}
            </button>
          ) : (
            <button onClick={() => fetchCustomReport(reportType)}
              className="flex items-center gap-2 bg-blue-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 transition-colors">
              <RefreshCw className="w-4 h-4" /> {t("generate")}
            </button>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          ANALYTICS TAB
      ══════════════════════════════════════════════════════════════ */}
      {tab === "analytics" && (
        <>
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
              <Loader2 className="w-5 h-5 animate-spin" /> {tc("loading")}
            </div>
          ) : data && (
            <>
              {/* Stats cards */}
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                {stats.map(({ label, value, icon: Icon, color }) => (
                  <div key={label} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex items-center gap-4">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xl font-bold text-gray-900">{value}</p>
                      <p className="text-xs text-gray-500">{label}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Collection snapshot */}
              {data.totalCopies !== undefined && (
                <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
                  <CollectionCard icon={BookOpen} label={t("colTotalTitles")}   value={data.totalBooks    ?? 0} color="text-indigo-600 bg-indigo-50" />
                  <CollectionCard icon={Package}  label={t("colTotalCopies")}   value={data.totalCopies   ?? 0} color="text-teal-600   bg-teal-50"   />
                  <CollectionCard icon={Users}    label={t("colActiveMembers")} value={data.activeMembers ?? 0} color="text-amber-600  bg-amber-50"  />
                </div>
              )}

              {/* Copy status + condition */}
              {data.copyStatusDistribution && data.copyStatusDistribution.length > 0 && (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                    <h2 className="font-semibold text-gray-800 mb-4 text-sm flex items-center gap-2">
                      <Package className="w-4 h-4 text-teal-500" /> {t("copyStatusTitle")}
                    </h2>
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie data={data.copyStatusDistribution} dataKey="count" nameKey="name"
                          cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2}
                          label={({ name, percent }: { name?: string; percent?: number }) =>
                            (percent ?? 0) > 0.05 ? `${name ?? ""} ${((percent ?? 0) * 100).toFixed(0)}%` : ""
                          } labelLine={false}>
                          {data.copyStatusDistribution.map((entry) => (
                            <Cell key={entry.name} fill={STATUS_COLORS[entry.name] ?? "#9ca3af"} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  {data.copyConditionDistribution && data.copyConditionDistribution.length > 0 && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                      <h2 className="font-semibold text-gray-800 mb-4 text-sm flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-orange-500" /> {t("conditionTitle")}
                      </h2>
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={data.copyConditionDistribution} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }} />
                          <Bar dataKey="count" radius={[4, 4, 0, 0]} name="Copies">
                            {data.copyConditionDistribution.map((entry) => {
                              const cls: Record<string, string> = {
                                EXCELLENT: "#059669", GOOD: "#10b981", FAIR: "#facc15",
                                POOR: "#fb923c", DAMAGED: "#ef4444", LOST: "#9ca3af",
                                WITHDRAWN: "#6b7280", ARCHIVED: "#94a3b8",
                              };
                              return <Cell key={entry.name} fill={cls[entry.name] ?? "#9ca3af"} />;
                            })}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              )}

              {/* Monthly trend + category pie */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                  <h2 className="font-semibold text-gray-800 mb-4 text-sm">{t("monthlyTrend")}</h2>
                  {data.monthlyLoans.length === 0 ? (
                    <p className="text-gray-400 text-sm text-center py-8">{tc("noData")}</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={data.monthlyLoans} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }} />
                        <Bar dataKey="loans" fill="#1e3a8a" radius={[4, 4, 0, 0]} name="Loans" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                  <h2 className="font-semibold text-gray-800 mb-4 text-sm">{t("categoryDistribution")}</h2>
                  {data.categoryDistribution.length === 0 ? (
                    <p className="text-gray-400 text-sm text-center py-8">{tc("noData")}</p>
                  ) : (
                    <div className="flex items-center gap-2">
                      {/* Donut chart */}
                      <div className="flex-shrink-0 w-[180px] h-[220px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={data.categoryDistribution}
                              dataKey="count"
                              nameKey="name"
                              cx="50%" cy="50%"
                              innerRadius={52}
                              outerRadius={82}
                              paddingAngle={2}
                              startAngle={90}
                              endAngle={-270}
                            >
                              {data.categoryDistribution.map((_, i) => (
                                <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip
                              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                              formatter={(v, name) => {
                                const n = Number(v);
                                const total = data.categoryDistribution.reduce((s, x) => s + x.count, 0);
                                const pct = total > 0 ? ((n / total) * 100).toFixed(1) : "0";
                                return [`${n} (${pct}%)`, name];
                              }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      {/* Right-side legend */}
                      <div className="flex-1 min-w-0 space-y-1.5">
                        {(() => {
                          const total = data.categoryDistribution.reduce((s, x) => s + x.count, 0);
                          return data.categoryDistribution.slice(0, 9).map((item, i) => {
                            const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
                            return (
                              <div key={item.name} className="flex items-center gap-2 group">
                                <span
                                  className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                                  style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }}
                                />
                                <span className="text-xs text-gray-700 flex-1 truncate leading-tight">{item.name}</span>
                                <span className="text-xs font-semibold text-gray-500 flex-shrink-0 tabular-nums">{pct}%</span>
                              </div>
                            );
                          });
                        })()}
                        {data.categoryDistribution.length > 9 && (
                          <p className="text-[10px] text-gray-400 pt-1">
                            +{data.categoryDistribution.length - 9} more
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Material type */}
              {data.materialTypeDistribution.length > 1 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                  <h2 className="font-semibold text-gray-800 mb-4 text-sm">{t("materialTypeTitle")}</h2>
                  <div className="flex flex-wrap gap-3">
                    {data.materialTypeDistribution.map((item, i) => {
                      const total = data.materialTypeDistribution.reduce((s, x) => s + x.count, 0);
                      const pct   = total > 0 ? ((item.count / total) * 100).toFixed(1) : "0";
                      return (
                        <div key={item.name} className="flex items-center gap-2 text-sm">
                          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                          <span className="text-gray-700 font-medium">{MAT_LABELS[item.name] ?? item.name}</span>
                          <span className="text-gray-400">{item.count} ({pct}%)</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-4 flex h-4 rounded-full overflow-hidden gap-0.5">
                    {data.materialTypeDistribution.map((item, i) => {
                      const total = data.materialTypeDistribution.reduce((s, x) => s + x.count, 0);
                      const pct   = total > 0 ? (item.count / total) * 100 : 0;
                      return (
                        <div key={item.name}
                          style={{ width: `${pct}%`, backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                          title={`${MAT_LABELS[item.name] ?? item.name}: ${item.count}`} />
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Top members + fines by month */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                  <h2 className="font-semibold text-gray-800 mb-4 text-sm">{t("topMembers")}</h2>
                  {data.topMembers.length === 0 ? (
                    <p className="text-gray-400 text-sm text-center py-8">{tc("noData")}</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={data.topMembers} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                        <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 10 }} />
                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }} />
                        <Bar dataKey="loans" fill="#6366f1" radius={[0, 4, 4, 0]} name="Loans" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                  <h2 className="font-semibold text-gray-800 mb-4 text-sm">{t("fineCollection")}</h2>
                  {data.finesByMonth.length === 0 ? (
                    <p className="text-gray-400 text-sm text-center py-8">{tc("noData")}</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={data.finesByMonth} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip
                          contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                          formatter={(v) => [`$${Number(v).toFixed(2)}`, "Amount"]}
                        />
                        <Line type="monotone" dataKey="amount" stroke="#10b981" strokeWidth={2}
                          dot={{ fill: "#10b981", r: 3 }} name="Amount ($)" />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* Popular books */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <h2 className="font-semibold text-gray-800 mb-4">{t("popularBooks")}</h2>
                {data.popularBooks.length === 0 ? (
                  <p className="text-gray-400 text-sm">{tc("noData")}</p>
                ) : (
                  <div className="space-y-3">
                    {data.popularBooks.map((book, i) => (
                      <div key={book.id} className="flex items-center gap-4">
                        <span className="w-7 h-7 rounded-full bg-gray-100 text-gray-500 text-xs font-bold flex items-center justify-center flex-shrink-0">
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{book.title}</p>
                          <p className="text-xs text-gray-400">{book.author?.name}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="h-2 bg-blue-100 rounded-full overflow-hidden w-24">
                            <div className="h-full bg-blue-500 rounded-full"
                              style={{ width: `${Math.min(100, (book.borrowCount / (data.popularBooks[0]?.borrowCount || 1)) * 100)}%` }} />
                          </div>
                          <span className="text-sm font-bold text-blue-600 w-6 text-right">{book.borrowCount}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════
          CUSTOM REPORTS TAB
      ══════════════════════════════════════════════════════════════ */}
      {tab === "custom" && (
        <div className="space-y-5">

          {/* Report type selector */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">{t("selectReport")}</h2>
            <div className="space-y-5">
              {REPORT_GROUPS.map((group) => {
                const entries = REPORT_CATALOG.filter((e) => e.group === group);
                return (
                  <div key={group}>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                      {t(group as Parameters<typeof t>[0])}
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                      {entries.map(({ id, labelKey, descKey, icon: Icon, color, activeColor }) => (
                        <button
                          key={id}
                          onClick={() => { setReportType(id); setCustomData(null); setCustomError(""); }}
                          title={t(descKey as Parameters<typeof t>[0])}
                          className={`flex flex-col items-start gap-1.5 px-3 py-3 rounded-xl border text-left transition-all ${
                            reportType === id ? activeColor : `${color} hover:opacity-80`
                          }`}
                        >
                          <Icon className="w-4 h-4 flex-shrink-0" />
                          <span className="text-xs font-semibold leading-tight">{t(labelKey as Parameters<typeof t>[0])}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Selected report info + generate */}
            {activeCatalog && (
              <div className="mt-4 flex items-center justify-between flex-wrap gap-3 pt-4 border-t border-gray-100">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{t(activeCatalog.labelKey as Parameters<typeof t>[0])}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{t(activeCatalog.descKey as Parameters<typeof t>[0])}</p>
                  {(["new-acquisitions","loans-by-date","returns-by-date","returned-loans","copies-added"].includes(activeCatalog.id)) && (
                    <p className="text-xs text-blue-600 mt-0.5">{t("dateRangeHint")}</p>
                  )}
                </div>
                <button
                  onClick={() => fetchCustomReport(reportType)}
                  disabled={customLoading}
                  className="flex items-center gap-2 bg-blue-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 transition-colors disabled:opacity-60"
                >
                  {customLoading
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> {t("generating")}</>
                    : <><RefreshCw className="w-4 h-4" /> {t("generateBtn")}</>}
                </button>
              </div>
            )}
          </div>

          {/* Error */}
          {customError && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
              {customError}
            </div>
          )}

          {/* Loading skeleton */}
          {customLoading && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 flex items-center justify-center gap-3 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">{t("loadingReport")}</span>
            </div>
          )}

          {/* Results */}
          {customData && !customLoading && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              {/* Table header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  {activeCatalog && (
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${activeCatalog.color}`}>
                      <activeCatalog.icon className="w-4 h-4" />
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-semibold text-gray-800">
                      {activeCatalog ? t(activeCatalog.labelKey as Parameters<typeof t>[0]) : ""}
                    </p>
                    <p className="text-xs text-gray-400">
                      {customData.count === 0
                        ? t("noRecords")
                        : t("recordCount", { count: customData.count })}
                    </p>
                  </div>
                  {customData.count === 0 && (
                    <span className="flex items-center gap-1 text-xs text-green-600 font-medium bg-green-50 px-2.5 py-1 rounded-full">
                      <CheckCircle2 className="w-3.5 h-3.5" /> {t("allClear")}
                    </span>
                  )}
                </div>

                {customData.count > 0 && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => exportCustom("csv")}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" /> CSV
                    </button>
                    <button
                      onClick={() => exportCustom("xlsx")}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
                    </button>
                  </div>
                )}
              </div>

              {/* Table */}
              {customData.count > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        {customData.columns.map((col) => (
                          <th key={col.key} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                            {COL_LABEL_KEYS[col.label]
                              ? t(COL_LABEL_KEYS[col.label] as Parameters<typeof t>[0])
                              : col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {customData.rows.map((row, i) => (
                        <tr key={i} className="hover:bg-gray-50 transition-colors">
                          {customData.columns.map((col) => {
                            const val = row[col.key];
                            const str = val === null || val === undefined ? "" : String(val);
                            const badge = STATUS_BADGE[str];
                            const isNumericHighlight =
                              (col.key === "DaysOverdue" && Number(val) > 0) ||
                              (col.key === "DaysLeft"    && Number(val) <= 3) ||
                              (col.key === "DaysLeft"    && Number(val) === 0);
                            return (
                              <td key={col.key} className="px-4 py-3 text-gray-700 whitespace-nowrap">
                                {badge ? (
                                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${badge}`}>
                                    {STATUS_LABEL_KEYS[str]
                                      ? t(STATUS_LABEL_KEYS[str] as Parameters<typeof t>[0])
                                      : str}
                                  </span>
                                ) : isNumericHighlight ? (
                                  <span className="font-semibold text-red-600">{str}</span>
                                ) : col.key === "Amount" || col.key === "FineAmount" ? (
                                  <span className="font-medium text-amber-700">${Number(val).toFixed(2)}</span>
                                ) : (
                                  str || <span className="text-gray-300">—</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Empty prompt */}
          {!customData && !customLoading && !customError && (
            <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 flex flex-col items-center justify-center text-center gap-3">
              <FileSpreadsheet className="w-10 h-10 text-gray-300" />
              <p className="text-sm font-medium text-gray-500">{t("selectReportPrompt")}</p>
              <p className="text-xs text-gray-400">{t("resultsExportHint")}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CollectionCard({ icon: Icon, label, value, color }: {
  icon: typeof BookOpen; label: string; value: number; color: string;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex items-center gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xl font-bold text-gray-900">{value.toLocaleString()}</p>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
    </div>
  );
}
