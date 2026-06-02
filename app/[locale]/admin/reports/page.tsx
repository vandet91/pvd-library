"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import {
  BarChart3, TrendingUp, ArrowLeftRight, AlertTriangle, DollarSign,
  Download, BookOpen, Package, Users, BookMarked, Calendar,
  PackageX, Archive, MessageSquare, Clock, CheckCircle2,
  Loader2, FileSpreadsheet, RefreshCw,
  List, Layers, Globe, Tag, MapPin, RotateCcw, Star, UserCheck, Bell, Hash, Wifi,
  ShoppingBag, Terminal, Play, Copy, ChevronRight, Save, Pencil, Trash2, BookmarkPlus, X,
  Search, SortAsc, SortDesc, ChevronLeft, ChevronsUpDown, Zap, Filter,
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
  audienceLevelDistribution?: { name: string; count: number }[];
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
  "groupSales",
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

  // ── Sales & Revenue ──────────────────────────────────────────────
  {
    id: "sales-orders",
    group: "groupSales",
    labelKey: "catSalesOrdersLabel",
    descKey:  "catSalesOrdersDesc",
    icon: ShoppingBag,
    color: "text-amber-600 bg-amber-50 border-amber-100",
    activeColor: "border-amber-400 bg-amber-50 text-amber-700",
  },
  {
    id: "best-selling",
    group: "groupSales",
    labelKey: "catBestSellingLabel",
    descKey:  "catBestSellingDesc",
    icon: TrendingUp,
    color: "text-emerald-600 bg-emerald-50 border-emerald-100",
    activeColor: "border-emerald-400 bg-emerald-50 text-emerald-700",
  },
  {
    id: "sales-revenue",
    group: "groupSales",
    labelKey: "catSalesRevenueLabel",
    descKey:  "catSalesRevenueDesc",
    icon: BarChart3,
    color: "text-violet-600 bg-violet-50 border-violet-100",
    activeColor: "border-violet-400 bg-violet-50 text-violet-700",
  },
  {
    id: "payment-methods",
    group: "groupSales",
    labelKey: "catPaymentMethodsLabel",
    descKey:  "catPaymentMethodsDesc",
    icon: DollarSign,
    color: "text-blue-600 bg-blue-50 border-blue-100",
    activeColor: "border-blue-400 bg-blue-50 text-blue-700",
  },
  {
    id: "tax-collected",
    group: "groupSales",
    labelKey: "catTaxCollectedLabel",
    descKey:  "catTaxCollectedDesc",
    icon: Package,
    color: "text-teal-600 bg-teal-50 border-teal-100",
    activeColor: "border-teal-400 bg-teal-50 text-teal-700",
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
  const [saleEnabled,   setSaleEnabled]   = useState(false);

  useEffect(() => {
    fetch("/api/branches")
      .then((r) => r.ok ? r.json() : [])
      .then((brs: { id: string; name: string; isActive: boolean }[]) => {
        if (Array.isArray(brs)) setBranchOptions(brs.filter((b) => b.isActive));
      })
      .catch(() => {});
    fetch("/api/settings")
      .then((r) => r.ok ? r.json() : {})
      .then((s: Record<string, string>) => setSaleEnabled(s.BOOK_SALE_ENABLED === "true"))
      .catch(() => {});
  }, []);

  /* active tab */
  const [tab, setTab] = useState<"analytics" | "custom" | "sql">("analytics");

  /* ── Analytics state ── */
  const [data, setData]       = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  /* ── Custom report state ── */
  const [reportType, setReportType]       = useState("overdue");
  const [customData, setCustomData]       = useState<CustomReportData | null>(null);
  const [customLoading, setCustomLoading] = useState(false);
  const [customError, setCustomError]     = useState("");

  /* ── Custom Reports UI state ── */
  const customResultsRef = useRef<HTMLDivElement>(null);
  const [catalogSearch,  setCatalogSearch]  = useState("");
  const [sortCol,        setSortCol]        = useState<string | null>(null);
  const [sortDir,        setSortDir]        = useState<"asc" | "desc">("asc");
  const [resultsPage,    setResultsPage]    = useState(1);
  const RESULTS_PAGE_SIZE = 50;

  /* ── SQL query state ── */
  const [sqlText,      setSqlText]      = useState("SELECT * FROM \"Book\" LIMIT 20");
  const [sqlData,      setSqlData]      = useState<{ columns: { key: string; label: string }[]; rows: Record<string, string | number | null>[]; count: number } | null>(null);
  const [sqlLoading,   setSqlLoading]   = useState(false);
  const [sqlError,     setSqlError]     = useState("");
  const [sqlCopied,    setSqlCopied]    = useState(false);

  /* ── Template state ── */
  interface QueryTemplate { id: string; name: string; description: string | null; sql: string; createdBy: { name: string | null } | null; createdAt: string; }
  const [templates,       setTemplates]       = useState<QueryTemplate[]>([]);
  const [templatesLoaded, setTemplatesLoaded] = useState(false);
  const [showSaveModal,   setShowSaveModal]   = useState(false);
  const [saveName,        setSaveName]        = useState("");
  const [saveDesc,        setSaveDesc]        = useState("");
  const [savingTpl,       setSavingTpl]       = useState(false);
  const [editingTpl,      setEditingTpl]      = useState<QueryTemplate | null>(null);
  const [editName,        setEditName]        = useState("");
  const [editDesc,        setEditDesc]        = useState("");
  const [editSql,         setEditSql]         = useState("");
  const [savingEdit,      setSavingEdit]      = useState(false);
  const [deletingId,      setDeletingId]      = useState<string | null>(null);

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
    setResultsPage(1);
    setSortCol(null);
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

  /* ── Date presets ── */
  function applyPreset(preset: "today" | "week" | "month" | "year" | "clear") {
    const now   = new Date();
    const pad   = (n: number) => String(n).padStart(2, "0");
    const fmt   = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const today = fmt(now);
    if (preset === "clear") { setFrom(""); setTo(""); return; }
    if (preset === "today") { setFrom(today); setTo(today); return; }
    if (preset === "week") {
      const mon = new Date(now); mon.setDate(now.getDate() - now.getDay() + 1);
      setFrom(fmt(mon)); setTo(today); return;
    }
    if (preset === "month") { setFrom(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`); setTo(today); return; }
    if (preset === "year")  { setFrom(`${now.getFullYear()}-01-01`); setTo(today); return; }
  }

  /* ── Export custom report ── */
  function exportCustom(fmt: "csv" | "xlsx") {
    const params = new URLSearchParams({ type: reportType, format: fmt });
    if (from)     params.set("from", from);
    if (to)       params.set("to", to);
    if (branchId) params.set("branchId", branchId);
    window.open(`/api/reports/custom?${params}`, "_blank");
  }

  /* ── Run SQL query ── */
  async function runSql() {
    setSqlData(null); setSqlError(""); setSqlLoading(true);
    try {
      const res = await fetch("/api/reports/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: sqlText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Query failed");
      setSqlData(data);
    } catch (e: unknown) {
      setSqlError(String(e instanceof Error ? e.message : e));
    } finally {
      setSqlLoading(false);
    }
  }

  function exportSqlCsv() {
    if (!sqlData) return;
    const header = sqlData.columns.map((c) => c.label).join(",");
    const rows = sqlData.rows.map((row) =>
      sqlData.columns.map((c) => {
        const v = row[c.key];
        if (v === null || v === undefined) return "";
        const s = String(v);
        return s.includes(",") || s.includes('"') || s.includes("\n")
          ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(","),
    );
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a"); a.href = url; a.download = "custom-query.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  /* ── Template CRUD ── */
  async function fetchTemplates() {
    const res  = await fetch("/api/reports/templates");
    const data = await res.json();
    setTemplates(Array.isArray(data) ? data : []);
    setTemplatesLoaded(true);
  }

  async function saveTemplate() {
    if (!saveName.trim()) return;
    setSavingTpl(true);
    const res = await fetch("/api/reports/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: saveName, description: saveDesc, sql: sqlText }),
    });
    if (res.ok) {
      const tpl = await res.json();
      setTemplates(prev => [tpl, ...prev]);
      setShowSaveModal(false);
      setSaveName(""); setSaveDesc("");
    }
    setSavingTpl(false);
  }

  async function updateTemplate() {
    if (!editingTpl || !editName.trim()) return;
    setSavingEdit(true);
    const res = await fetch(`/api/reports/templates/${editingTpl.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName, description: editDesc, sql: editSql }),
    });
    if (res.ok) {
      const updated = await res.json();
      setTemplates(prev => prev.map(t => t.id === updated.id ? updated : t));
      setEditingTpl(null);
    }
    setSavingEdit(false);
  }

  async function deleteTemplate(id: string) {
    setDeletingId(id);
    await fetch(`/api/reports/templates/${id}`, { method: "DELETE" });
    setTemplates(prev => prev.filter(t => t.id !== id));
    setDeletingId(null);
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
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
          <p className="text-xs text-gray-400 mt-0.5">Analytics, custom reports, and SQL queries</p>
        </div>
        <div className="flex gap-2">
          <a href="/api/reports/export?format=xlsx"
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            <FileSpreadsheet className="w-4 h-4" /> Export Excel
          </a>
          <a href="/api/reports/export?format=csv"
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            <Download className="w-4 h-4" /> Export CSV
          </a>
        </div>
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
        <button
          onClick={() => setTab("sql")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === "sql" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <Terminal className="w-4 h-4" /> SQL Query
        </button>
      </div>

      {/* ── Filters bar (shared) ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-wrap items-end gap-3">
          {/* Quick presets */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Quick range</span>
            <div className="flex gap-1">
              {(["Today","Week","Month","Year"] as const).map((p) => (
                <button key={p} onClick={() => applyPreset(p.toLowerCase() as "today"|"week"|"month"|"year")}
                  className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-colors">
                  {p}
                </button>
              ))}
              {(from || to) && (
                <button onClick={() => applyPreset("clear")}
                  className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors">
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="w-px h-9 bg-gray-200 hidden sm:block" />

          {/* From / To */}
          <div className="flex items-end gap-2">
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{t("from")}</label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700" />
            </div>
            <span className="text-gray-300 pb-2 text-sm">→</span>
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{t("to")}</label>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700" />
            </div>
          </div>

          {/* Branch */}
          {branchOptions.length > 0 && (
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Branch</label>
              <select value={branchId} onChange={(e) => setBranchId(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-700">
                <option value="">{t("allBranchesOption")}</option>
                {branchOptions.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="ml-auto flex gap-2">
            {tab === "analytics" ? (
              <button onClick={fetchAnalytics} disabled={loading}
                className="flex items-center gap-2 bg-blue-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 disabled:opacity-60 transition-colors">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4" />}
                {t("generate")}
              </button>
            ) : tab === "custom" ? (
              <button onClick={() => fetchCustomReport(reportType)} disabled={customLoading}
                className="flex items-center gap-2 bg-blue-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 disabled:opacity-60 transition-colors">
                {customLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                Run Report
              </button>
            ) : null}
          </div>
        </div>

        {/* Active range badge */}
        {(from || to) && (
          <div className="mt-3 flex items-center gap-1.5 text-xs text-blue-700">
            <Calendar className="w-3.5 h-3.5" />
            <span>Filtering: {from || "start"} → {to || "today"}</span>
          </div>
        )}
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
                {[
                  { label: t("totalBorrowed"),      value: data.totalBorrowed,                        icon: ArrowLeftRight, bg: "bg-blue-50",   icon_c: "text-blue-600",   bar: "bg-blue-500",   sub: "Total loans in period" },
                  { label: t("totalReturned"),       value: data.totalReturned,                        icon: TrendingUp,     bg: "bg-green-50",  icon_c: "text-green-600",  bar: "bg-green-500",  sub: "Returned on time or late" },
                  { label: t("totalOverdue"),        value: data.totalOverdue,                         icon: AlertTriangle,  bg: "bg-red-50",    icon_c: "text-red-600",    bar: "bg-red-500",    sub: "Currently overdue" },
                  { label: t("totalFinesCollected"), value: `$${data.totalFinesCollected.toFixed(2)}`, icon: DollarSign,     bg: "bg-violet-50", icon_c: "text-violet-600", bar: "bg-violet-500", sub: "Fines collected" },
                ].map(({ label, value, icon: Icon, bg, icon_c, sub }) => (
                  <div key={label} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${bg}`}>
                        <Icon className={`w-4 h-4 ${icon_c}`} />
                      </div>
                    </div>
                    <p className="text-2xl font-bold text-gray-900 tabular-nums">{value}</p>
                    <p className="text-xs font-semibold text-gray-600 mt-0.5">{label}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>
                  </div>
                ))}
              </div>

              {/* Collection snapshot */}
              {data.totalCopies !== undefined && (
                <div className="grid grid-cols-3 gap-4">
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

              {/* Audience level distribution */}
              {(data.audienceLevelDistribution ?? []).filter((x) => x.name !== "UNSPECIFIED").length > 0 && (() => {
                const AUD_LABELS: Record<string, string> = { CHILDREN: "Children", YOUTH: "Youth", ADULTS: "Adults", UNSPECIFIED: "Unspecified" };
                const AUD_COLORS: Record<string, string> = { CHILDREN: "#f472b6", YOUTH: "#a78bfa", ADULTS: "#60a5fa", UNSPECIFIED: "#d1d5db" };
                const items = data.audienceLevelDistribution ?? [];
                return (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                    <h2 className="font-semibold text-gray-800 mb-4 text-sm">Audience Level Distribution</h2>
                    <div className="flex flex-wrap gap-3">
                      {items.map((item) => {
                        const total = items.reduce((s, x) => s + x.count, 0);
                        const pct   = total > 0 ? ((item.count / total) * 100).toFixed(1) : "0";
                        const color = AUD_COLORS[item.name] ?? "#d1d5db";
                        return (
                          <div key={item.name} className="flex items-center gap-2 text-sm">
                            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                            <span className="text-gray-700 font-medium">{AUD_LABELS[item.name] ?? item.name}</span>
                            <span className="text-gray-400">{item.count} ({pct}%)</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-4 flex h-4 rounded-full overflow-hidden gap-0.5">
                      {items.map((item) => {
                        const total = items.reduce((s, x) => s + x.count, 0);
                        const pct   = total > 0 ? (item.count / total) * 100 : 0;
                        const color = AUD_COLORS[item.name] ?? "#d1d5db";
                        return (
                          <div key={item.name}
                            style={{ width: `${pct}%`, backgroundColor: color }}
                            title={`${AUD_LABELS[item.name] ?? item.name}: ${item.count}`} />
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

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
        <div className="flex gap-5 items-start">

          {/* ── Left: catalog picker ── */}
          <div className="w-64 flex-shrink-0 space-y-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              <input
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                placeholder="Search reports…"
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>

            {/* Groups */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              {REPORT_GROUPS.filter((g) => g !== "groupSales" || saleEnabled).map((group) => {
                const entries = REPORT_CATALOG.filter((e) =>
                  e.group === group &&
                  (!catalogSearch || t(e.labelKey as Parameters<typeof t>[0]).toLowerCase().includes(catalogSearch.toLowerCase()) ||
                    t(e.descKey as Parameters<typeof t>[0]).toLowerCase().includes(catalogSearch.toLowerCase()))
                );
                if (entries.length === 0) return null;
                return (
                  <div key={group}>
                    <p className="px-3 pt-3 pb-1 text-[9px] font-bold uppercase tracking-widest text-gray-400">
                      {t(group as Parameters<typeof t>[0])}
                    </p>
                    {entries.map(({ id, labelKey, descKey, icon: Icon, activeColor }) => (
                      <button
                        key={id}
                        onClick={() => { setReportType(id); setCustomData(null); setCustomError(""); }}
                        onDoubleClick={() => {
                          setReportType(id);
                          setCustomError("");
                          fetchCustomReport(id);
                          // Scroll the main scroll container to bring the results into view
                          setTimeout(() => {
                            customResultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                          }, 80);
                        }}
                        title="Single click to select · Double-click to run immediately"
                        className={`w-full flex items-start gap-2.5 px-3 py-2.5 text-left transition-colors border-l-2 ${
                          reportType === id
                            ? `${activeColor} border-current`
                            : "border-transparent text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold leading-tight truncate">{t(labelKey as Parameters<typeof t>[0])}</p>
                          <p className="text-[10px] text-gray-400 leading-tight mt-0.5 line-clamp-1">{t(descKey as Parameters<typeof t>[0])}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>

            {/* Hint */}
            <p className="text-[10px] text-gray-400 text-center px-2 pb-1">
              Single click to select · <strong>Double-click</strong> to run instantly
            </p>
          </div>

          {/* ── Right: results area ── */}
          <div ref={customResultsRef} className="flex-1 min-w-0 space-y-4">

            {/* Selected report header + run button */}
            {activeCatalog && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${activeCatalog.color}`}>
                    <activeCatalog.icon className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">{t(activeCatalog.labelKey as Parameters<typeof t>[0])}</p>
                    <p className="text-xs text-gray-400">{t(activeCatalog.descKey as Parameters<typeof t>[0])}</p>
                    {(["new-acquisitions","loans-by-date","returns-by-date","returned-loans","copies-added"].includes(activeCatalog.id)) && (
                      <p className="text-[10px] text-blue-500 mt-0.5 flex items-center gap-1"><Calendar className="w-3 h-3" /> Uses date range filter above</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => fetchCustomReport(reportType)}
                  disabled={customLoading}
                  className="flex items-center gap-2 bg-blue-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 disabled:opacity-60 transition-colors"
                >
                  {customLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</> : <><Zap className="w-4 h-4" /> Run Report</>}
                </button>
              </div>
            )}

            {/* Error */}
            {customError && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {customError}
              </div>
            )}

            {/* Loading */}
            {customLoading && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 flex flex-col items-center gap-3 text-gray-400">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span className="text-sm">{t("loadingReport")}</span>
              </div>
            )}

            {/* Results */}
            {customData && !customLoading && (() => {
              // Sort
              const sorted = sortCol
                ? [...customData.rows].sort((a, b) => {
                    const av = a[sortCol] ?? ""; const bv = b[sortCol] ?? "";
                    const cmp = typeof av === "number" && typeof bv === "number"
                      ? av - bv : String(av).localeCompare(String(bv));
                    return sortDir === "asc" ? cmp : -cmp;
                  })
                : customData.rows;

              const totalPages = Math.ceil(sorted.length / RESULTS_PAGE_SIZE);
              const pageRows   = sorted.slice((resultsPage - 1) * RESULTS_PAGE_SIZE, resultsPage * RESULTS_PAGE_SIZE);

              return (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  {/* Results toolbar */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      {activeCatalog && (
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${activeCatalog.color}`}>
                          <activeCatalog.icon className="w-3.5 h-3.5" />
                        </div>
                      )}
                      <div>
                        <span className="text-sm font-semibold text-gray-800">
                          {activeCatalog ? t(activeCatalog.labelKey as Parameters<typeof t>[0]) : ""}
                        </span>
                        {customData.count === 0 ? (
                          <span className="ml-2 inline-flex items-center gap-1 text-xs text-green-600 font-medium bg-green-50 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="w-3 h-3" /> All clear
                          </span>
                        ) : (
                          <span className="ml-2 text-xs text-gray-400">{customData.count.toLocaleString()} records</span>
                        )}
                      </div>
                      {sortCol && (
                        <button onClick={() => { setSortCol(null); }} className="flex items-center gap-1 text-[10px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200 hover:bg-blue-100">
                          <Filter className="w-2.5 h-2.5" /> Sorted by {sortCol} · clear
                        </button>
                      )}
                    </div>
                    {customData.count > 0 && (
                      <div className="flex gap-2">
                        <button onClick={() => exportCustom("csv")}
                          className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50 transition-colors">
                          <Download className="w-3.5 h-3.5" /> CSV
                        </button>
                        <button onClick={() => exportCustom("xlsx")}
                          className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50 transition-colors">
                          <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Table */}
                  {customData.count > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 z-10">
                          <tr className="bg-gray-50 border-b border-gray-100">
                            {customData.columns.map((col) => {
                              const isSorted = sortCol === col.key;
                              return (
                                <th key={col.key}
                                  onClick={() => { if (isSorted) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortCol(col.key); setSortDir("asc"); } setResultsPage(1); }}
                                  className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap cursor-pointer hover:bg-gray-100 select-none transition-colors">
                                  <div className="flex items-center gap-1">
                                    {COL_LABEL_KEYS[col.label] ? t(COL_LABEL_KEYS[col.label] as Parameters<typeof t>[0]) : col.label}
                                    {isSorted
                                      ? sortDir === "asc" ? <SortAsc className="w-3 h-3 text-blue-500" /> : <SortDesc className="w-3 h-3 text-blue-500" />
                                      : <ChevronsUpDown className="w-3 h-3 text-gray-300" />}
                                  </div>
                                </th>
                              );
                            })}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {pageRows.map((row, i) => (
                            <tr key={i} className="hover:bg-blue-50/30 transition-colors">
                              {customData.columns.map((col) => {
                                const val = row[col.key];
                                const str = val === null || val === undefined ? "" : String(val);
                                const badge = STATUS_BADGE[str];
                                const isOverdue  = col.key === "DaysOverdue" && Number(val) > 0;
                                const isDaysLeft = col.key === "DaysLeft"    && Number(val) <= 3;
                                return (
                                  <td key={col.key} className="px-4 py-2.5 text-gray-700 whitespace-nowrap text-xs">
                                    {badge ? (
                                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${badge}`}>
                                        {STATUS_LABEL_KEYS[str] ? t(STATUS_LABEL_KEYS[str] as Parameters<typeof t>[0]) : str}
                                      </span>
                                    ) : isOverdue || isDaysLeft ? (
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

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
                      <p className="text-xs text-gray-500">
                        Showing {((resultsPage - 1) * RESULTS_PAGE_SIZE) + 1}–{Math.min(resultsPage * RESULTS_PAGE_SIZE, customData.count)} of {customData.count.toLocaleString()}
                      </p>
                      <div className="flex gap-1">
                        <button disabled={resultsPage === 1} onClick={() => setResultsPage(1)}
                          className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-white transition-colors">«</button>
                        <button disabled={resultsPage === 1} onClick={() => setResultsPage(p => p - 1)}
                          className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-white transition-colors">
                          <ChevronLeft className="w-3.5 h-3.5 inline" /> Prev
                        </button>
                        <span className="px-3 py-1.5 text-xs text-gray-600 font-medium">
                          {resultsPage} / {totalPages}
                        </span>
                        <button disabled={resultsPage === totalPages} onClick={() => setResultsPage(p => p + 1)}
                          className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-white transition-colors">
                          Next <ChevronRight className="w-3.5 h-3.5 inline" />
                        </button>
                        <button disabled={resultsPage === totalPages} onClick={() => setResultsPage(totalPages)}
                          className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-white transition-colors">»</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Empty prompt */}
            {!customData && !customLoading && !customError && (
              <div className="bg-white rounded-xl border border-dashed border-gray-200 p-16 flex flex-col items-center justify-center text-center gap-3">
                <FileSpreadsheet className="w-12 h-12 text-gray-200" />
                <p className="text-sm font-semibold text-gray-500">Select a report from the left</p>
                <p className="text-xs text-gray-400">then click <strong>Run Report</strong> to generate results you can sort, page, and export</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          SQL QUERY TAB
      ══════════════════════════════════════════════════════════════ */}
      {tab === "sql" && (
        <div className="flex gap-4 items-start">

          {/* ── Left: editor + results ── */}
          <div className="flex-1 min-w-0 space-y-4">

            {/* Editor card */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-semibold text-gray-700">Custom SQL Query</span>
                  <span className="text-xs text-gray-400 hidden sm:block">— SELECT only · max 1 000 rows</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { navigator.clipboard.writeText(sqlText); setSqlCopied(true); setTimeout(() => setSqlCopied(false), 1500); }}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" /> {sqlCopied ? "Copied!" : "Copy"}
                  </button>
                  <button
                    onClick={() => { setSaveName(""); setSaveDesc(""); setShowSaveModal(true); if (!templatesLoaded) fetchTemplates(); }}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-emerald-700 border border-emerald-200 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors"
                  >
                    <BookmarkPlus className="w-3.5 h-3.5" /> Save
                  </button>
                  <button
                    onClick={runSql}
                    disabled={sqlLoading || !sqlText.trim()}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-900 rounded-lg hover:bg-blue-800 disabled:opacity-50 transition-colors"
                  >
                    {sqlLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                    Run
                  </button>
                </div>
              </div>

              <textarea
                value={sqlText}
                onChange={(e) => setSqlText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runSql(); } }}
                rows={9}
                spellCheck={false}
                placeholder="SELECT * FROM &quot;Book&quot; WHERE ..."
                className="w-full px-4 py-3 font-mono text-sm bg-gray-950 text-green-400 focus:outline-none resize-y leading-relaxed"
                style={{ minHeight: "160px" }}
              />
              <div className="px-4 py-2 bg-gray-950 border-t border-gray-800 flex items-center gap-2 text-xs text-gray-500">
                <ChevronRight className="w-3 h-3" />
                <span>Ctrl+Enter to run · SELECT / WITH only · DML is blocked</span>
              </div>
            </div>

            {/* Quick-start examples */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Example queries</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {[
                  { label: "Books by category", sql: `SELECT c.name AS "Category", COUNT(b.id) AS "Books"\nFROM "Category" c\nLEFT JOIN "_BookToCategory" bc ON bc."B" = c.id\nLEFT JOIN "Book" b ON b.id = bc."A"\nGROUP BY c.name\nORDER BY "Books" DESC` },
                  { label: "Overdue loans", sql: `SELECT m.name AS "Member", b.title AS "Book",\n  l."dueDate"::date AS "Due", l.status AS "Status"\nFROM "Loan" l\nJOIN "Member" m ON m.id = l."memberId"\nJOIN "BookCopy" c ON c.id = l."copyId"\nJOIN "Book" b ON b.id = c."bookId"\nWHERE l.status = 'OVERDUE'\nORDER BY l."dueDate"` },
                  { label: "Copies by status", sql: `SELECT status, COUNT(*) AS "Copies"\nFROM "BookCopy"\nGROUP BY status\nORDER BY "Copies" DESC` },
                  { label: "Top borrowed books", sql: `SELECT b.title AS "Book", COUNT(l.id) AS "Loans"\nFROM "Loan" l\nJOIN "BookCopy" c ON c.id = l."copyId"\nJOIN "Book" b ON b.id = c."bookId"\nGROUP BY b.id, b.title\nORDER BY "Loans" DESC\nLIMIT 20` },
                  { label: "Unpaid fines by member", sql: `SELECT m.name AS "Member", m.email AS "Email",\n  SUM(f.amount) AS "Total Owed"\nFROM "Fine" f\nJOIN "Loan" l ON l.id = f."loanId"\nJOIN "Member" m ON m.id = l."memberId"\nWHERE f.status = 'UNPAID'\nGROUP BY m.id, m.name, m.email\nORDER BY "Total Owed" DESC` },
                  { label: "Stock movements this month", sql: `SELECT type, COUNT(*) AS "Count"\nFROM "StockMovement"\nWHERE "createdAt" >= date_trunc('month', NOW())\nGROUP BY type\nORDER BY "Count" DESC` },
                ].map(({ label, sql }) => (
                  <button key={label} onClick={() => { setSqlText(sql); setSqlData(null); setSqlError(""); }}
                    className="text-left px-3 py-2.5 text-xs border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors group">
                    <span className="font-medium text-gray-700 group-hover:text-blue-700">{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Error */}
            {sqlError && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 font-mono whitespace-pre-wrap">
                {sqlError}
              </div>
            )}

            {/* Results */}
            {sqlData && !sqlLoading && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                  <p className="text-sm font-semibold text-gray-700">
                    {sqlData.count === 0 ? "No rows returned" : `${sqlData.count.toLocaleString()} row${sqlData.count !== 1 ? "s" : ""}`}
                    {sqlData.count === 1000 && <span className="ml-2 text-xs text-amber-600 font-normal">(capped at 1 000)</span>}
                  </p>
                  {sqlData.count > 0 && (
                    <button onClick={exportSqlCsv}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50 transition-colors">
                      <Download className="w-3.5 h-3.5" /> Export CSV
                    </button>
                  )}
                </div>
                {sqlData.count > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          {sqlData.columns.map((col) => (
                            <th key={col.key} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                              {col.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {sqlData.rows.map((row, i) => (
                          <tr key={i} className="hover:bg-gray-50 transition-colors">
                            {sqlData.columns.map((col) => {
                              const val = row[col.key];
                              const str = val === null || val === undefined ? "" : String(val);
                              return (
                                <td key={col.key} className="px-4 py-2.5 text-gray-700 whitespace-nowrap font-mono text-xs">
                                  {str || <span className="text-gray-300">NULL</span>}
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

            {!sqlData && !sqlLoading && !sqlError && (
              <div className="bg-white rounded-xl border border-dashed border-gray-200 p-10 flex flex-col items-center gap-3 text-center">
                <Terminal className="w-10 h-10 text-gray-200" />
                <p className="text-sm text-gray-400">Write a SELECT query above and press <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono">Ctrl+Enter</kbd> or click Run</p>
              </div>
            )}
          </div>

          {/* ── Right: saved templates panel ── */}
          <div className="w-64 flex-shrink-0 space-y-3">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100 bg-gray-50">
                <span className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
                  <Save className="w-3.5 h-3.5" /> Saved Templates
                </span>
                <button
                  onClick={() => { if (!templatesLoaded) fetchTemplates(); else fetchTemplates(); }}
                  className="p-1 rounded hover:bg-gray-200 transition-colors"
                >
                  <RefreshCw className="w-3 h-3 text-gray-400" />
                </button>
              </div>

              {!templatesLoaded ? (
                <button
                  onClick={fetchTemplates}
                  className="w-full px-3 py-4 text-xs text-blue-600 hover:bg-blue-50 transition-colors text-center"
                >
                  Load templates
                </button>
              ) : templates.length === 0 ? (
                <p className="px-3 py-4 text-xs text-gray-400 text-center">No saved templates yet.<br />Click <strong>Save</strong> to store a query.</p>
              ) : (
                <div className="divide-y divide-gray-50 max-h-[480px] overflow-y-auto">
                  {templates.map((tpl) => (
                    <div key={tpl.id} className="px-3 py-2.5 group hover:bg-gray-50 transition-colors">
                      <div className="flex items-start justify-between gap-1">
                        <button
                          onClick={() => { setSqlText(tpl.sql); setSqlData(null); setSqlError(""); }}
                          className="flex-1 text-left"
                        >
                          <p className="text-xs font-semibold text-gray-800 group-hover:text-blue-700 leading-tight">{tpl.name}</p>
                          {tpl.description && <p className="text-[10px] text-gray-400 mt-0.5 leading-snug">{tpl.description}</p>}
                        </button>
                        <div className="flex gap-0.5 flex-shrink-0">
                          <button
                            onClick={() => { setEditingTpl(tpl); setEditName(tpl.name); setEditDesc(tpl.description ?? ""); setEditSql(tpl.sql); }}
                            className="p-1 rounded text-gray-300 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            title="Edit"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => { if (window.confirm(`Delete "${tpl.name}"?`)) deleteTemplate(tpl.id); }}
                            disabled={deletingId === tpl.id}
                            className="p-1 rounded text-gray-300 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                            title="Delete"
                          >
                            {deletingId === tpl.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>
                      <p className="text-[10px] text-gray-300 mt-1 font-mono truncate">{tpl.sql.slice(0, 60)}…</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Save template modal ── */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <BookmarkPlus className="w-4 h-4 text-emerald-600" /> Save Query Template
              </h3>
              <button onClick={() => setShowSaveModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Template Name *</label>
                <input
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveTemplate()}
                  autoFocus
                  placeholder="e.g. Monthly overdue report"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Description (optional)</label>
                <input
                  value={saveDesc}
                  onChange={(e) => setSaveDesc(e.target.value)}
                  placeholder="What this query does…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="bg-gray-950 rounded-lg px-3 py-2 font-mono text-xs text-green-400 max-h-28 overflow-y-auto whitespace-pre-wrap">
                {sqlText}
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setShowSaveModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button
                onClick={saveTemplate}
                disabled={savingTpl || !saveName.trim()}
                className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
              >
                {savingTpl && <Loader2 className="w-4 h-4 animate-spin" />}
                Save Template
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit template modal ── */}
      {editingTpl && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Pencil className="w-4 h-4 text-blue-600" /> Edit Template
              </h3>
              <button onClick={() => setEditingTpl(null)} className="p-1.5 rounded-lg hover:bg-gray-100">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Template Name *</label>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  autoFocus
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                <input
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">SQL</label>
                <textarea
                  value={editSql}
                  onChange={(e) => setEditSql(e.target.value)}
                  rows={10}
                  spellCheck={false}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 font-mono text-sm bg-gray-950 text-green-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setEditingTpl(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button
                onClick={updateTemplate}
                disabled={savingEdit || !editName.trim()}
                className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {savingEdit && <Loader2 className="w-4 h-4 animate-spin" />}
                Save Changes
              </button>
            </div>
          </div>
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
