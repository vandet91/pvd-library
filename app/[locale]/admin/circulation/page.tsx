"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowRightLeft, ScanLine, CheckCheck, Clock, AlertTriangle, X,
  RefreshCw, Loader2, Barcode, BookOpen, User, Plus, Trash2,
  ShoppingBasket, RotateCcw, Calendar, PackageX, DollarSign, Home, BookMarked,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

/* ── Shared types ───────────────────────────────────────────────── */
interface Loan {
  id: string; status: string; loanType?: string; borrowDate: string; dueDate: string; returnDate?: string;
  renewalCount: number;
  member: { id: string; name: string; memberId: string };
  book: { title: string; isbn: string | null; barcode: string | null; price?: number | null; referenceOnly?: boolean; author: { name: string } | null };
  copy?: { id: string; copyNumber: number; barcode: string | null } | null;
  fine?: { amount: number; status: string } | null;
}

interface MemberResult {
  id: string; name: string; memberId: string; memberType: string;
  expireDate?: string | null;
  hasOverdue?: boolean;
  _count?: { loans: number };
}

interface BookResult {
  id: string; title: string; isbn: string | null; barcode: string | null;
  availableCopies?: number; materialType?: string; referenceOnly?: boolean;
  author?: { name: string } | null;
  _scannedCopy?: { id: string; copyNumber: number; barcode: string | null };
  copies?: { id: string; copyNumber: number; barcode: string | null }[];
}

const MAT_CLS: Record<string, string> = {
  BOOK:      "bg-blue-50   text-blue-700",
  MAGAZINE:  "bg-pink-50   text-pink-700",
  JOURNAL:   "bg-purple-50 text-purple-700",
  NEWSPAPER: "bg-yellow-50 text-yellow-700",
  DVD:       "bg-red-50    text-red-700",
  AUDIO_CD:  "bg-orange-50 text-orange-700",
  THESIS:    "bg-teal-50   text-teal-700",
  MAP:       "bg-green-50  text-green-700",
  OTHER:     "bg-gray-100  text-gray-600",
};

type Tab = "active" | "borrow" | "return";

/* ── Reusable member autocomplete ────────────────────────────────── */
function MemberSearch({
  value, onChange, onSelect, onClear, maxLoans,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (m: MemberResult) => void;
  onClear: () => void;
  maxLoans: number;
  placeholder?: string;
}) {
  const t = useTranslations("circulation");
  const [suggestions, setSuggestions] = useState<MemberResult[]>([]);
  const [busy,        setBusy]        = useState(false);
  const [open,        setOpen]        = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    const q = value.trim();
    if (!q) { setSuggestions([]); setOpen(false); return; }
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        const res: MemberResult[] = await fetch(`/api/members?q=${encodeURIComponent(q)}`).then((r) => r.json());
        setSuggestions(Array.isArray(res) ? res.slice(0, 6) : []);
        setOpen(true);
      } catch { setSuggestions([]); }
      setBusy(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [value]);

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          type="text" value={value}
          onChange={(e) => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder={placeholder ?? t("memberSearchPlaceholder")}
          className="w-full pl-9 pr-8 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {value && (
          <button type="button" onClick={onClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {open && (busy || suggestions.length > 0) && (
        <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          {busy ? (
            <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-gray-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t("searching")}
            </div>
          ) : suggestions.map((m) => {
            const expired = m.expireDate && new Date(m.expireDate) < new Date();
            const cnt = m._count?.loans ?? 0;
            return (
              <button key={m.id} type="button"
                onMouseDown={(e) => { e.preventDefault(); onSelect(m); setSuggestions([]); setOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-blue-50 transition-colors text-left border-b border-gray-50 last:border-0">
                <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <User className="w-3.5 h-3.5 text-blue-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800 truncate">{m.name}</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-mono text-blue-600">{m.memberId}</span>
                    <span className={`text-xs font-medium ${cnt >= maxLoans ? "text-red-500" : cnt > 0 ? "text-amber-600" : "text-gray-400"}`}>
                      {cnt}/{maxLoans} {t("booksLabel")}
                    </span>
                    {m.hasOverdue && (
                      <span className="text-xs text-red-500 font-medium flex items-center gap-0.5">
                        <AlertTriangle className="w-3 h-3" /> {t("overdue")}
                      </span>
                    )}
                    {expired && <span className="text-xs text-red-400">{t("expired")}</span>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Main page ───────────────────────────────────────────────────── */
export default function CirculationPage() {
  const t  = useTranslations("circulation");
  const tc = useTranslations("common");

  const [tab, setTab] = useState<Tab>("active");

  /* Quota from settings */
  const [maxLoans, setMaxLoans] = useState(3);
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s) => { if (s.MAX_LOANS_PER_MEMBER) setMaxLoans(Number(s.MAX_LOANS_PER_MEMBER)); })
      .catch(() => {});
  }, []);

  /* ── Active loans (all) ──────────────────────────────────────── */
  const [loans,        setLoans]        = useState<Loan[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [filterStatus, setFilterStatus] = useState<"ALL" | "ACTIVE" | "OVERDUE">("ALL");
  const [filterType,   setFilterType]   = useState<"ALL" | "HOME" | "IN_LIBRARY">("ALL");
  const [filterSearch, setFilterSearch] = useState("");
  const [sortBy,       setSortBy]       = useState<"dueDate" | "borrowDate" | "member" | "book">("dueDate");
  const [renewBusy,  setRenewBusy]  = useState<string | null>(null);
  const [renewMsg,   setRenewMsg]   = useState<{ id: string; ok: boolean; text: string } | null>(null);
  const [returnBusy, setReturnBusy] = useState<string | null>(null);
  const [returnMsg,  setReturnMsg]  = useState<{ id: string; ok: boolean; text: string } | null>(null);

  /* ── Lost book dialog ──────────────────────────────────────────── */
  const [lostDialog, setLostDialog] = useState<{ loan: Loan; amount: string } | null>(null);
  const [lostBusy,   setLostBusy]   = useState(false);
  const [lostMsg,    setLostMsg]    = useState<{ id: string; ok: boolean; text: string } | null>(null);

  function openLostDialog(loan: Loan) {
    // Pre-fill from book.price → fallback to $20.00 (matches server 3-layer logic)
    const prefill = loan.book.price && loan.book.price > 0
      ? loan.book.price.toFixed(2)
      : "20.00";
    setLostDialog({ loan, amount: prefill });
    setLostMsg(null);
  }

  async function confirmLost() {
    if (!lostDialog) return;
    setLostBusy(true);
    try {
      const res = await fetch(`/api/loans/${lostDialog.loan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark-lost", amount: parseFloat(lostDialog.amount) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setLostMsg({ id: lostDialog.loan.id, ok: false, text: err.error ?? t("lostFailed") });
      } else {
        setLostMsg({ id: lostDialog.loan.id, ok: true, text: t("lostSuccess") });
        setLoans((prev) => prev.filter((l) => l.id !== lostDialog.loan.id));
        window.dispatchEvent(new Event("alertsChanged"));
        setTimeout(() => setLostDialog(null), 1500);
      }
    } finally {
      setLostBusy(false);
    }
  }

  const fetchLoans = useCallback(async () => {
    setLoading(true);
    const [a, b] = await Promise.all([
      fetch("/api/loans?status=ACTIVE").then((r)  => r.json()),
      fetch("/api/loans?status=OVERDUE").then((r) => r.json()),
    ]);
    setLoans([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]);
    setLoading(false);
  }, []);
  useEffect(() => { fetchLoans(); }, [fetchLoans]);

  async function handleRenew(loanId: string) {
    setRenewBusy(loanId); setRenewMsg(null);
    try {
      const res = await fetch(`/api/loans/${loanId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "renew" }),
      });
      if (res.ok) {
        setRenewMsg({ id: loanId, ok: true, text: t("renewSuccess") });
        fetchLoans(); window.dispatchEvent(new CustomEvent("alertsChanged"));
      } else {
        const data = await res.json().catch(() => ({}));
        setRenewMsg({ id: loanId, ok: false, text: data.error ?? t("renewFailed") });
      }
    } catch { setRenewMsg({ id: loanId, ok: false, text: t("networkError") }); }
    setRenewBusy(null);
    setTimeout(() => setRenewMsg(null), 3000);
  }

  async function handleReturn(loanId: string, onDone?: () => void) {
    setReturnBusy(loanId); setReturnMsg(null);
    try {
      const res = await fetch(`/api/loans/${loanId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "return" }),
      });
      if (res.ok) {
        setReturnMsg({ id: loanId, ok: true, text: t("returnSuccess") });
        fetchLoans(); onDone?.();
        window.dispatchEvent(new CustomEvent("alertsChanged"));
      } else {
        const data = await res.json().catch(() => ({}));
        setReturnMsg({ id: loanId, ok: false, text: data.error ?? t("returnFailed") });
      }
    } catch { setReturnMsg({ id: loanId, ok: false, text: t("networkError") }); }
    setReturnBusy(null);
    setTimeout(() => setReturnMsg(null), 3000);
  }

  /* ── Borrow tab state ────────────────────────────────────────── */
  const [borrowMember,  setBorrowMember]  = useState<MemberResult | null>(null);
  const [borrowQuery,   setBorrowQuery]   = useState("");
  const [borrowedIds,   setBorrowedIds]   = useState<Set<string>>(new Set()); // bookIds member already has on loan
  const [bookCart,      setBookCart]      = useState<BookResult[]>([]);
  const [bookQuery,     setBookQuery]     = useState("");
  const [bookSuggestions, setBookSuggestions] = useState<BookResult[]>([]);
  const [bookBusy,      setBookBusy]      = useState(false);
  const [showBookDrop,  setShowBookDrop]  = useState(false);
  const [expandedBookId, setExpandedBookId] = useState<string | null>(null);
  const [loanDays,      setLoanDays]      = useState(14);
  const [loanType,      setLoanType]      = useState<"HOME" | "IN_LIBRARY">("HOME");
  const [borrowLoading, setBorrowLoading] = useState(false);
  const [activeInLibLoans, setActiveInLibLoans] = useState<{ title: string; dueDate: string }[]>([]);
  const [inLibOverride, setInLibOverride] = useState(false);
  const [borrowMsg,     setBorrowMsg]     = useState<{ type: "success" | "error"; text: string } | null>(null);
  const bookRef    = useRef<HTMLDivElement>(null);
  const bookVideoRef = useRef<HTMLVideoElement>(null);
  const [scanTarget, setScanTarget] = useState<"member-b" | "book" | "member-r" | null>(null);
  const memberBVideoRef = useRef<HTMLVideoElement>(null);

  const activeLoans    = borrowMember?._count?.loans ?? 0;
  const hasOverdue     = borrowMember?.hasOverdue ?? false;
  const atQuota        = activeLoans >= maxLoans;
  const memberExpired  = !!borrowMember?.expireDate && new Date(borrowMember.expireDate) < new Date();
  // Expired blocks all loans. Overdue/quota only blocks take-home.
  const memberBlocked  = !!borrowMember && (memberExpired || (loanType === "HOME" && (hasOverdue || atQuota)));
  const IN_LIB_LIMIT   = 1;
  const slotsLeft      = loanType === "IN_LIBRARY"
    ? Math.max(0, IN_LIB_LIMIT - bookCart.length)
    : Math.max(0, maxLoans - activeLoans - bookCart.length);
  const canAddBook     = !!borrowMember && !memberExpired && (
    loanType === "IN_LIBRARY" ? bookCart.length < IN_LIB_LIMIT : (!hasOverdue && slotsLeft > 0)
  );
  // Auto-switch to IN_LIBRARY if any reference-only book is in the cart
  const hasRefBook = bookCart.some((b) => b.referenceOnly);

  // IN_LIBRARY warnings — advisory only, resolved with "Allow Anyway".
  // IN_LIBRARY loans are independent of the HOME quota so neither overdue
  // nor quota is a hard block; they just require librarian acknowledgement.
  const inLibHasOverdue  = loanType === "IN_LIBRARY" && hasOverdue;
  const inLibHasExisting = loanType === "IN_LIBRARY" && activeInLibLoans.length > 0;
  const inLibNeedsOverride = (inLibHasOverdue || inLibHasExisting) && !inLibOverride;

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (bookRef.current && !bookRef.current.contains(e.target as Node)) setShowBookDrop(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    const q = bookQuery.trim();
    if (!q) { setBookSuggestions([]); setShowBookDrop(false); return; }
    const timer = setTimeout(async () => {
      setBookBusy(true);
      try {
        const res: BookResult[] = await fetch(`/api/books?q=${encodeURIComponent(q)}&limit=6&copies=true`).then((r) => r.json());
        const cartIds = new Set(bookCart.map((b) => b.id));
        setBookSuggestions(Array.isArray(res) ? res.filter((b) => !cartIds.has(b.id)) : []);
        setShowBookDrop(true);
      } catch { setBookSuggestions([]); }
      setBookBusy(false);
    }, 300);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookQuery]);

  async function selectBorrowMember(m: MemberResult) {
    setBorrowMember(m); setBorrowQuery(m.memberId);
    setBookCart([]); setBorrowMsg(null); setInLibOverride(false);
    // Preload the books this member already has on loan so we can block re-adding
    try {
      const [active, overdue] = await Promise.all([
        fetch(`/api/loans?memberId=${m.id}&status=ACTIVE`).then((r)  => r.json()),
        fetch(`/api/loans?memberId=${m.id}&status=OVERDUE`).then((r) => r.json()),
      ]);
      const allLoans = [...(Array.isArray(active) ? active : []), ...(Array.isArray(overdue) ? overdue : [])];
      const ids = new Set<string>();
      for (const l of allLoans) { if (l?.bookId) ids.add(l.bookId); }
      setBorrowedIds(ids);
      // Detect in-library loans across BOTH active and overdue — an overdue
      // in-library loan (not returned after session) must still count toward
      // the conflict warning so the librarian sees the true total.
      const inLib = allLoans
        .filter((l: Loan) => l?.loanType === "IN_LIBRARY")
        .map((l: Loan) => ({ title: l.book?.title ?? "Unknown", dueDate: l.dueDate }));
      setActiveInLibLoans(inLib);
    } catch { setBorrowedIds(new Set()); setActiveInLibLoans([]); }
  }
  function clearBorrowMember() {
    setBorrowMember(null); setBorrowQuery(""); setBookCart([]); setBorrowMsg(null);
    setBorrowedIds(new Set()); setLoanType("HOME");
    setActiveInLibLoans([]); setInLibOverride(false);
  }
  function addToCart(b: BookResult) {
    if (!canAddBook) return;
    if (borrowedIds.has(b.id)) {
      setBorrowMsg({
        type: "error",
        text: t("alreadyHasTitle", { title: b.title }),
      });
      return;
    }
    // Auto-switch to in-library if a reference-only book is added
    if (b.referenceOnly && loanType === "HOME") setLoanType("IN_LIBRARY");
    setBookCart((p) => [...p, b]);
    setBookQuery(""); setBookSuggestions([]); setShowBookDrop(false);
  }

  async function startScan(target: "member-b" | "book" | "member-r") {
    setScanTarget(target);
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader  = new BrowserMultiFormatReader();
      const videoEl = target === "book" ? bookVideoRef.current
                    : target === "member-b" ? memberBVideoRef.current
                    : memberRVideoRef.current;
      if (!videoEl) return;
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      videoEl.srcObject = stream; videoEl.play();
      reader.decodeFromStream(stream, videoEl, (result) => {
        if (result) {
          const val = result.getText();
          if (target === "member-b") setBorrowQuery(val);
          else if (target === "book") setBookQuery(val);
          else setReturnQuery(val);
          stream.getTracks().forEach((t) => t.stop());
          setScanTarget(null);
        }
      });
    } catch { setScanTarget(null); }
  }

  async function handleBorrow(e: React.FormEvent) {
    e.preventDefault();
    if (!borrowMember || bookCart.length === 0) return;
    setBorrowLoading(true); setBorrowMsg(null);
    const res = await fetch("/api/loans/batch", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        memberId: borrowMember.id,
        items: bookCart.map((b) => ({
          bookId: b.id,
          copyId: b._scannedCopy?.id,
        })),
        loanDays,
        loanType,
      }),
    });
    setBorrowLoading(false);
    if (res.ok) {
      const { count } = await res.json();
      setBorrowMsg({ type: "success", text: loanType === "IN_LIBRARY" ? t("issuedForInLibrary", { count }) : t("borrowedSuccess", { count }) });
      setBookCart([]); setLoanType("HOME"); setInLibOverride(false);

      // Refresh member quota + in-library loan list (ACTIVE and OVERDUE both)
      // so the conflict warning shows the true total for the next attempt.
      const [updatedMembers, freshActive, freshOverdue] = await Promise.all([
        fetch(`/api/members?q=${borrowMember.memberId}`).then((r) => r.json()),
        fetch(`/api/loans?memberId=${borrowMember.id}&status=ACTIVE`).then((r) => r.json()),
        fetch(`/api/loans?memberId=${borrowMember.id}&status=OVERDUE`).then((r) => r.json()),
      ]);
      const refreshed = (updatedMembers as MemberResult[]).find((m) => m.id === borrowMember.id);
      if (refreshed) setBorrowMember(refreshed);
      const allFresh = [
        ...(Array.isArray(freshActive)  ? (freshActive  as Loan[]) : []),
        ...(Array.isArray(freshOverdue) ? (freshOverdue as Loan[]) : []),
      ];
      const inLib = allFresh
        .filter((l) => l?.loanType === "IN_LIBRARY")
        .map((l) => ({ title: l.book?.title ?? "Unknown", dueDate: l.dueDate }));
      setActiveInLibLoans(inLib);

      fetchLoans(); window.dispatchEvent(new CustomEvent("alertsChanged"));
    } else {
      const data = await res.json();
      setBorrowMsg({ type: "error", text: data.error ?? t("renewFailed") });
    }
  }

  /* ── Return tab state ────────────────────────────────────────── */
  type ReturnMode = "scan" | "member";
  const [returnMode, setReturnMode] = useState<ReturnMode>("scan");

  // Scan-to-return mode
  const [scanBarcode,    setScanBarcode]    = useState("");
  const [scannedLoan,    setScannedLoan]    = useState<Loan | null>(null);
  const [scanLookupBusy, setScanLookupBusy] = useState(false);
  const [scanError,      setScanError]      = useState<string | null>(null);
  const bookScanVideoRef = useRef<HTMLVideoElement>(null);

  // Member-browse mode
  const [returnMember,  setReturnMember]  = useState<MemberResult | null>(null);
  const [returnQuery,   setReturnQuery]   = useState("");
  const [memberLoans,   setMemberLoans]   = useState<Loan[]>([]);
  const [memberLoansBusy, setMemberLoansBusy] = useState(false);
  const memberRVideoRef = useRef<HTMLVideoElement>(null);

  async function loadMemberLoans(memberId: string) {
    setMemberLoansBusy(true);
    try {
      const [a, b] = await Promise.all([
        fetch(`/api/loans?memberId=${memberId}&status=ACTIVE`).then((r)  => r.json()),
        fetch(`/api/loans?memberId=${memberId}&status=OVERDUE`).then((r) => r.json()),
      ]);
      setMemberLoans([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]);
    } catch { setMemberLoans([]); }
    setMemberLoansBusy(false);
  }

  function selectReturnMember(m: MemberResult) {
    setReturnMember(m); setReturnQuery(m.memberId);
    loadMemberLoans(m.id);
  }
  function clearReturnMember() {
    setReturnMember(null); setReturnQuery(""); setMemberLoans([]);
  }

  async function handleReturnBook(loanId: string) {
    await handleReturn(loanId, () => {
      setMemberLoans((prev) => prev.filter((l) => l.id !== loanId));
      if (returnMember) {
        fetch(`/api/members?q=${returnMember.memberId}`)
          .then((r) => r.json())
          .then((res: MemberResult[]) => {
            const refreshed = res.find((m) => m.id === returnMember.id);
            if (refreshed) setReturnMember(refreshed);
          }).catch(() => {});
      }
    });
  }

  /* ── Scan-to-return: look up active loan by barcode/ISBN ─────── */
  async function lookupByBarcode(raw: string) {
    const q = raw.trim();
    if (!q) return;
    setScanLookupBusy(true); setScanError(null); setScannedLoan(null);
    try {
      const res = await fetch(`/api/loans?barcode=${encodeURIComponent(q)}&status=ACTIVE`);
      if (res.status === 404) { setScanError(t("noBookBarcode")); setScanLookupBusy(false); return; }
      const active: Loan[] = await res.json();
      // Also try OVERDUE if not found in ACTIVE
      let loan = Array.isArray(active) ? active[0] : null;
      if (!loan) {
        const res2 = await fetch(`/api/loans?barcode=${encodeURIComponent(q)}&status=OVERDUE`);
        if (res2.ok) {
          const overdue: Loan[] = await res2.json();
          loan = Array.isArray(overdue) ? overdue[0] : null;
        }
      }
      if (!loan) setScanError(t("noActiveLoan"));
      else        setScannedLoan(loan);
    } catch { setScanError(t("networkErrorRetry")); }
    setScanLookupBusy(false);
  }

  async function handleScannedReturn() {
    if (!scannedLoan) return;
    await handleReturn(scannedLoan.id, () => {
      setScannedLoan(null);
      setScanBarcode("");
    });
  }

  async function startBookScan() {
    setScanTarget("book-return" as never);
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader  = new BrowserMultiFormatReader();
      const videoEl = bookScanVideoRef.current;
      if (!videoEl) return;
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      videoEl.srcObject = stream; videoEl.play();
      reader.decodeFromStream(stream, videoEl, (result) => {
        if (result) {
          const val = result.getText();
          setScanBarcode(val);
          stream.getTracks().forEach((t) => t.stop());
          setScanTarget(null);
          lookupByBarcode(val);
        }
      });
    } catch { setScanTarget(null); }
  }

  /* ── Helpers ─────────────────────────────────────────────────── */
  function daysOverdue(dueDate: string) {
    return Math.max(0, Math.ceil((Date.now() - new Date(dueDate).getTime()) / 86_400_000));
  }

  /* ── Filtered + sorted active loans ─────────────────────────── */
  const filteredLoans = loans
    .filter((l) => {
      if (filterStatus !== "ALL" && l.status !== filterStatus) return false;
      if (filterType !== "ALL" && (l.loanType ?? "HOME") !== filterType) return false;
      if (filterSearch.trim()) {
        const q = filterSearch.trim().toLowerCase();
        const match =
          l.member.name.toLowerCase().includes(q) ||
          l.member.memberId.toLowerCase().includes(q) ||
          l.book.title.toLowerCase().includes(q) ||
          (l.book.barcode ?? "").toLowerCase().includes(q) ||
          (l.book.isbn ?? "").toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "dueDate":    return new Date(a.dueDate).getTime()    - new Date(b.dueDate).getTime();
        case "borrowDate": return new Date(b.borrowDate).getTime() - new Date(a.borrowDate).getTime();
        case "member":     return a.member.name.localeCompare(b.member.name);
        case "book":       return a.book.title.localeCompare(b.book.title);
        default:           return 0;
      }
    });

  const overdueCount = loans.filter((l) => l.status === "OVERDUE").length;
  const activeCount  = loans.filter((l) => l.status === "ACTIVE").length;

  /* ── UI ──────────────────────────────────────────────────────── */
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        {([
          ["active", t("activeLoans"),   <Clock key="c"          className="w-4 h-4" />],
          ["borrow", t("borrowBook"),    <ArrowRightLeft key="a" className="w-4 h-4" />],
          ["return", t("returnBook"),    <RotateCcw key="r"      className="w-4 h-4" />],
        ] as [Tab, string, React.ReactNode][]).map(([key, label, icon]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === key ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}>
            {icon}{label}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════
          BORROW TAB
          ════════════════════════════════════════════════════════ */}
      {tab === "borrow" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">

          {/* Left: member + book search */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-5">

            {/* Step 1 — member */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                {t("step1SelectMember")}
              </p>
              <div className="flex gap-2">
                <div className="flex-1">
                  <MemberSearch
                    value={borrowQuery}
                    onChange={(v) => { setBorrowQuery(v); if (borrowMember) { setBorrowMember(null); setBookCart([]); } }}
                    onSelect={selectBorrowMember}
                    onClear={clearBorrowMember}
                    maxLoans={maxLoans}
                  />
                </div>
                <button type="button" onClick={() => startScan("member-b")} title={t("scanMemberCard")}
                  className="flex items-center px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
                  <ScanLine className="w-4 h-4" />
                </button>
              </div>
              {scanTarget === "member-b" && (
                <div className="mt-2 relative rounded-lg overflow-hidden bg-black aspect-video">
                  <video ref={memberBVideoRef} className="w-full h-full object-cover" />
                  <button type="button" onClick={() => setScanTarget(null)}
                    className="absolute top-2 right-2 bg-black/50 text-white p-1 rounded-full"><X className="w-3 h-3" /></button>
                </div>
              )}

              {/* Member card */}
              {borrowMember && (() => {
                const pct = Math.min(100, Math.round(((activeLoans + bookCart.length) / maxLoans) * 100));
                const barColor = pct >= 100 ? "bg-red-500" : pct >= 66 ? "bg-orange-400" : "bg-blue-500";
                return (
                  <div className={`mt-2 rounded-lg px-3 py-3 border ${
                    memberExpired ? "bg-red-50 border-red-300"
                    : hasOverdue  ? "bg-red-50 border-red-200"
                    : atQuota     ? "bg-amber-50 border-amber-200"
                    :               "bg-blue-50 border-blue-100"
                  }`}>
                    <div className="flex items-center gap-2 mb-2">
                      <User className={`w-4 h-4 ${hasOverdue ? "text-red-400" : "text-blue-400"}`} />
                      <p className="text-sm font-semibold text-gray-800">{borrowMember.name}</p>
                      <span className="text-xs font-mono text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded ml-auto">
                        {borrowMember.memberId}
                      </span>
                    </div>
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-xs text-gray-500">{t("quota")}</span>
                        <span className={`text-xs font-bold ${hasOverdue ? "text-red-600" : atQuota ? "text-amber-600" : "text-gray-700"}`}>
                          {activeLoans + bookCart.length} / {maxLoans}
                        </span>
                      </div>
                      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-300 ${barColor}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    {memberExpired && (
                      <p className="mt-2 text-xs text-red-700 font-semibold flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" /> {t("memberExpiredBlocked")}
                      </p>
                    )}
                    {!memberExpired && hasOverdue && (
                      <p className="mt-2 text-xs text-red-600 font-semibold flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" /> {t("memberOverdueBlocked")}
                      </p>
                    )}
                    {!memberExpired && !hasOverdue && atQuota && (
                      <p className="mt-2 text-xs text-amber-700 font-medium flex items-center gap-1">
                        <CheckCheck className="w-3.5 h-3.5" /> {t("memberAtQuota")}
                      </p>
                    )}
                    {!memberBlocked && slotsLeft > 0 && (
                      <p className="mt-1.5 text-xs text-green-600">
                        ✓ {loanType === "IN_LIBRARY"
                          ? t("slotsAvailInLib", { count: slotsLeft })
                          : t("slotsAvailHome", { count: slotsLeft })}
                      </p>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Loan type toggle */}
            {borrowMember && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{t("loanType")}</p>
                <div className="flex gap-2 bg-gray-100 p-1 rounded-xl w-fit">
                  <button type="button"
                    onClick={() => { if (!hasRefBook) { setLoanType("HOME"); setInLibOverride(false); } }}
                    disabled={hasRefBook}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      loanType === "HOME"
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-500 hover:text-gray-700"
                    } disabled:opacity-40 disabled:cursor-not-allowed`}>
                    <Home className="w-4 h-4" /> {t("takeHome")}
                  </button>
                  <button type="button"
                    onClick={() => { setLoanType("IN_LIBRARY"); setInLibOverride(false); }}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      loanType === "IN_LIBRARY"
                        ? "bg-amber-100 text-amber-800 shadow-sm"
                        : "text-gray-500 hover:text-gray-700"
                    }`}>
                    <BookMarked className="w-4 h-4" /> {t("readInLibrary")}
                  </button>
                </div>
                {loanType === "IN_LIBRARY" && (
                  <p className="mt-1.5 text-xs text-amber-700">
                    {t("inLibraryDesc")}
                  </p>
                )}

                {/* ── In-library advisory warnings ── */}
                {loanType === "IN_LIBRARY" && (inLibHasOverdue || inLibHasExisting) && (
                  <div className={`mt-3 rounded-xl border px-4 py-3 ${inLibOverride ? "bg-green-50 border-green-200" : "bg-orange-50 border-orange-300"}`}>
                    {inLibOverride ? (
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-green-600 flex-shrink-0" />
                          <p className="text-xs font-semibold text-green-700">{t("overrideApproved")}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setInLibOverride(false)}
                          className="text-xs text-green-600 underline hover:no-underline flex-shrink-0"
                        >
                          {t("undoOverride")}
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-start gap-2 mb-2">
                          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-orange-600" />
                          <div className="space-y-1.5">
                            {/* Overdue warning */}
                            {inLibHasOverdue && (
                              <p className="text-xs font-semibold text-orange-700">
                                {t("inLibOverdueWarning")}
                              </p>
                            )}
                            {/* Existing in-library loans */}
                            {inLibHasExisting && (
                              <div>
                                <p className="text-xs font-semibold text-orange-700">
                                  {t("hasInLibLoans", { count: activeInLibLoans.length })}
                                </p>
                                <ul className="mt-0.5 space-y-0.5">
                                  {activeInLibLoans.map((l, i) => (
                                    <li key={i} className="text-xs text-orange-600">
                                      · {l.title}
                                      <span className="text-orange-400 ml-1">({t("dueShort")} {new Date(l.dueDate).toLocaleDateString()})</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setInLibOverride(true)}
                            className="px-3 py-1.5 bg-orange-600 text-white text-xs font-semibold rounded-lg hover:bg-orange-700 transition-colors"
                          >
                            {t("allowAnyway")}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setLoanType("HOME"); setInLibOverride(false); }}
                            className="px-3 py-1.5 border border-orange-300 text-orange-700 text-xs font-medium rounded-lg hover:bg-orange-100 transition-colors"
                          >
                            {tc("cancel")}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
                {hasRefBook && loanType === "HOME" && (
                  <p className="mt-1.5 text-xs text-red-600">{t("refBookCart")}</p>
                )}
              </div>
            )}

            {/* Step 2 — books */}
            {borrowMember && !memberBlocked && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  {t("step2AddBooks")} {loanType === "IN_LIBRARY"
                    ? `(${slotsLeft === 0 ? t("limitReached") : t("oneBookOnly")})`
                    : `(${t("slotsLeft", { count: slotsLeft })})`}
                </p>
                <div ref={bookRef} className="relative">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <BookOpen className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                      <input type="text" value={bookQuery}
                        onChange={(e) => setBookQuery(e.target.value)}
                        onFocus={() => bookSuggestions.length > 0 && setShowBookDrop(true)}
                        placeholder={t("titleBarcodePlaceholder")}
                        disabled={slotsLeft === 0}
                        className="w-full pl-9 pr-8 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                      {bookQuery && (
                        <button type="button" onClick={() => { setBookQuery(""); setBookSuggestions([]); setExpandedBookId(null); }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <button type="button" onClick={() => startScan("book")} disabled={slotsLeft === 0}
                      className="flex items-center px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">
                      <ScanLine className="w-4 h-4" />
                    </button>
                  </div>

                  {showBookDrop && (bookBusy || bookSuggestions.length > 0) && (
                    <div className="absolute z-20 top-full mt-1 left-0 right-10 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                      {bookBusy ? (
                        <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-gray-400">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t("searching")}
                        </div>
                      ) : bookSuggestions.map((b) => {
                        const alreadyOnLoan  = borrowedIds.has(b.id);
                        const unavailable    = (b.availableCopies ?? 0) < 1;
                        const refBlocked     = b.referenceOnly && loanType === "HOME";
                        const disabled       = unavailable || alreadyOnLoan || refBlocked;
                        const availCopies    = b.copies ?? [];
                        const isExpanded     = expandedBookId === b.id;
                        const hasMultipleCopies = availCopies.length > 1;
                        return (
                        <div key={b.id} className="border-b border-gray-50 last:border-0">
                          {/* ── Book row ── */}
                          <div className={`flex items-center gap-3 px-3 py-2.5 ${disabled ? "opacity-40" : "hover:bg-indigo-50"} transition-colors`}>
                            {/* Add whole book (auto-pick copy) */}
                            <button type="button"
                              onMouseDown={(e) => { e.preventDefault(); if (!disabled) addToCart(b); }}
                              disabled={disabled}
                              title={
                                alreadyOnLoan ? t("alreadyOnLoanTitle")
                                : refBlocked  ? t("refOnlySwitch")
                                : t("addBookAuto")
                              }
                              className="flex items-center gap-3 flex-1 text-left disabled:cursor-not-allowed min-w-0">
                              <div className="w-7 h-7 rounded bg-indigo-100 flex items-center justify-center flex-shrink-0">
                                <BookOpen className="w-3.5 h-3.5 text-indigo-500" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <p className="text-sm font-medium text-gray-800 truncate">{b.title}</p>
                                  {b.referenceOnly && (
                                    <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded font-bold uppercase tracking-wide">REF</span>
                                  )}
                                  {b.materialType && b.materialType !== "BOOK" && (
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase ${MAT_CLS[b.materialType] ?? "bg-gray-100 text-gray-600"}`}>
                                      {b.materialType.replace("_", " ")}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {b.barcode && (
                                    <span className="text-xs font-mono text-indigo-600 font-semibold">
                                      <Barcode className="w-3 h-3 inline mr-0.5" />{b.barcode}
                                    </span>
                                  )}
                                  <span className={`text-xs font-medium ${!unavailable ? "text-green-600" : "text-red-500"}`}>
                                    {!unavailable ? t("availCopies", { count: b.availableCopies }) : t("unavailable")}
                                  </span>
                                  {alreadyOnLoan && (
                                    <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded font-bold uppercase tracking-wide">{t("alreadyOnLoanTitle")}</span>
                                  )}
                                </div>
                              </div>
                            </button>

                            {/* Right: expand button (multiple copies) OR plain + (single) */}
                            {!disabled && hasMultipleCopies ? (
                              <button
                                type="button"
                                onMouseDown={(e) => { e.preventDefault(); setExpandedBookId(isExpanded ? null : b.id); }}
                                title={isExpanded ? t("collapseCopies") : t("pickCopy")}
                                className={`flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border transition-colors ${
                                  isExpanded
                                    ? "bg-indigo-100 text-indigo-700 border-indigo-200"
                                    : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-indigo-50 hover:text-indigo-600"
                                }`}
                              >
                                <Barcode className="w-3.5 h-3.5" />
                                {isExpanded ? "▴" : "▾"}
                              </button>
                            ) : !disabled ? (
                              <Plus className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                            ) : refBlocked ? (
                              <BookMarked className="w-4 h-4 text-amber-400 flex-shrink-0" />
                            ) : null}
                          </div>

                          {/* ── Expanded copies list ── */}
                          {isExpanded && availCopies.length > 0 && (
                            <div className="bg-indigo-50 border-t border-indigo-100 px-3 py-2 flex flex-wrap gap-1.5">
                              {availCopies.map((copy) => (
                                <button
                                  key={copy.id}
                                  type="button"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    addToCart({ ...b, _scannedCopy: copy });
                                    setExpandedBookId(null);
                                  }}
                                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-indigo-200 rounded-lg text-xs font-medium text-indigo-700 hover:bg-indigo-100 hover:border-indigo-400 transition-colors"
                                >
                                  <Barcode className="w-3 h-3" />
                                  {copy.barcode ?? `Copy #${copy.copyNumber}`}
                                  <span className="text-indigo-400 text-[10px]">#{copy.copyNumber}</span>
                                </button>
                              ))}
                              <p className="w-full text-[10px] text-indigo-400 mt-0.5">{t("clickBarcodeHint")}</p>
                            </div>
                          )}
                        </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                {scanTarget === "book" && (
                  <div className="mt-2 relative rounded-lg overflow-hidden bg-black aspect-video">
                    <video ref={bookVideoRef} className="w-full h-full object-cover" />
                    <button type="button" onClick={() => setScanTarget(null)}
                      className="absolute top-2 right-2 bg-black/50 text-white p-1 rounded-full"><X className="w-3 h-3" /></button>
                  </div>
                )}
              </div>
            )}

            {/* Loan days — only for take-home loans */}
            {borrowMember && loanType === "HOME" && (
              <div>
                <label htmlFor="circ-loan-days" className="block text-sm font-medium text-gray-700 mb-1.5">{t("loanDays")}</label>
                <input id="circ-loan-days" type="number" value={loanDays} min={1} max={90}
                  onChange={(e) => setLoanDays(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            )}
          </div>

          {/* Right: cart + submit */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
            <div className="flex items-center gap-2">
              <ShoppingBasket className={`w-5 h-5 ${loanType === "IN_LIBRARY" ? "text-amber-500" : "text-indigo-500"}`} />
              <h2 className="font-semibold text-gray-800">
                {loanType === "IN_LIBRARY" ? t("booksForInLibrary") : t("booksToBorrow")}
              </h2>
              {bookCart.length > 0 && (
                <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full ${loanType === "IN_LIBRARY" ? "bg-amber-100 text-amber-700" : "bg-indigo-100 text-indigo-700"}`}>{bookCart.length}</span>
              )}
            </div>
            {loanType === "IN_LIBRARY" && (
              <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-700">
                <BookMarked className="w-3.5 h-3.5 flex-shrink-0" />
                {t("inLibReadingDesc")}
              </div>
            )}
            {bookCart.length === 0 ? (
              <div className="text-center py-10 text-gray-300">
                <BookOpen className="w-10 h-10 mx-auto mb-2" />
                <p className="text-sm">{!borrowMember ? t("selectMemberFirst") : t("addBooksOnLeft")}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {bookCart.map((b, i) => (
                  <div key={b.id} className={`flex items-center gap-3 border rounded-lg px-3 py-2.5 ${loanType === "IN_LIBRARY" ? "bg-amber-50 border-amber-100" : "bg-indigo-50 border-indigo-100"}`}>
                    <span className={`w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0 ${loanType === "IN_LIBRARY" ? "bg-amber-200 text-amber-800" : "bg-indigo-200 text-indigo-700"}`}>{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-medium text-gray-800 truncate">{b.title}</p>
                        {b.referenceOnly && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded font-bold uppercase tracking-wide">REF</span>
                        )}
                        {b.materialType && b.materialType !== "BOOK" && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase ${MAT_CLS[b.materialType] ?? "bg-gray-100 text-gray-600"}`}>
                            {b.materialType.replace("_", " ")}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {(b._scannedCopy?.barcode || b.barcode) && (
                          <p className={`text-xs font-mono font-semibold ${loanType === "IN_LIBRARY" ? "text-amber-700" : "text-indigo-600"}`}>
                            {b._scannedCopy?.barcode ?? b.barcode}
                          </p>
                        )}
                        {b._scannedCopy && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded font-bold uppercase tracking-wide">
                            Copy #{b._scannedCopy.copyNumber}
                          </span>
                        )}
                      </div>
                    </div>
                    <button type="button" onClick={() => setBookCart((p) => p.filter((x) => x.id !== b.id))}
                      className="text-gray-300 hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            )}
            {borrowMsg && (
              <div className={`text-sm px-4 py-3 rounded-lg border ${borrowMsg.type === "success" ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-600 border-red-200"}`}>
                {borrowMsg.text}
              </div>
            )}
            <form onSubmit={handleBorrow}>
              <button type="submit"
                disabled={borrowLoading || !borrowMember || bookCart.length === 0 || memberBlocked || inLibNeedsOverride}
                className={`w-full text-white py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
                  loanType === "IN_LIBRARY" ? "bg-amber-600 hover:bg-amber-700" : "bg-blue-900 hover:bg-blue-800"
                }`}>
                {borrowLoading
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> {t("processing")}</>
                  : bookCart.length > 0
                    ? loanType === "IN_LIBRARY"
                      ? <><BookMarked className="w-4 h-4" /> {t("issueForInLibrary", { count: bookCart.length })}</>
                      : <><CheckCheck className="w-4 h-4" /> {t("borrowBooks", { count: bookCart.length })}</>
                    : t("borrow")}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          RETURN TAB
          ════════════════════════════════════════════════════════ */}
      {tab === "return" && (
        <div className="space-y-4">

          {/* Mode toggle */}
          <div className="flex gap-2 bg-gray-100 p-1 rounded-xl w-fit">
            <button onClick={() => setReturnMode("scan")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                returnMode === "scan" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}>
              <Barcode className="w-4 h-4" /> {t("scanBookBarcode")}
            </button>
            <button onClick={() => setReturnMode("member")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                returnMode === "member" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}>
              <User className="w-4 h-4" /> {t("findByMember")}
            </button>
          </div>

          {/* ── Mode: Scan Book ── */}
          {returnMode === "scan" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">

              {/* Input panel */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{t("scanEnterBarcode")}</p>

                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    <input
                      type="text"
                      value={scanBarcode}
                      onChange={(e) => { setScanBarcode(e.target.value); setScannedLoan(null); setScanError(null); }}
                      onKeyDown={(e) => e.key === "Enter" && lookupByBarcode(scanBarcode)}
                      placeholder="PVD-000001 or 978-XXXXXXXXX…"
                      className="w-full pl-9 pr-8 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                    {scanBarcode && (
                      <button type="button"
                        onClick={() => { setScanBarcode(""); setScannedLoan(null); setScanError(null); }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <button type="button" onClick={() => lookupByBarcode(scanBarcode)}
                    disabled={!scanBarcode.trim() || scanLookupBusy}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors">
                    {scanLookupBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : t("lookUp")}
                  </button>
                  <button type="button" onClick={startBookScan} title={t("scanWithCamera")}
                    className="flex items-center px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
                    <ScanLine className="w-4 h-4" />
                  </button>
                </div>

                <p className="text-xs text-gray-400">
                  {t("barcodeDesc")}
                </p>

                {/* Camera */}
                {scanTarget === ("book-return" as never) && (
                  <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
                    <video ref={bookScanVideoRef} className="w-full h-full object-cover" />
                    <button type="button" onClick={() => setScanTarget(null)}
                      className="absolute top-2 right-2 bg-black/50 text-white p-1 rounded-full"><X className="w-3 h-3" /></button>
                  </div>
                )}

                {/* Error */}
                {scanError && (
                  <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 text-sm px-4 py-3 rounded-lg">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {scanError}
                  </div>
                )}
              </div>

              {/* Found loan card */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                {!scannedLoan && !scanLookupBusy ? (
                  <div className="p-8 text-center text-gray-300">
                    <Barcode className="w-10 h-10 mx-auto mb-2" />
                    <p className="text-sm">{t("scanBarcodeHint")}</p>
                  </div>
                ) : scanLookupBusy ? (
                  <div className="p-8 text-center text-gray-400 flex items-center justify-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" /> {t("lookingUpLoan")}
                  </div>
                ) : scannedLoan && (
                  <div className="p-6 space-y-4">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{t("loanFound")}</p>

                    {/* Book info */}
                    <div className={`flex items-start gap-4 p-4 rounded-xl border ${
                      scannedLoan.status === "OVERDUE" ? "bg-red-50 border-red-200" : "bg-blue-50 border-blue-100"
                    }`}>
                      <div className={`w-12 h-16 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        scannedLoan.status === "OVERDUE" ? "bg-red-100" : "bg-blue-100"
                      }`}>
                        <BookOpen className={`w-6 h-6 ${scannedLoan.status === "OVERDUE" ? "text-red-400" : "text-blue-400"}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900">{scannedLoan.book.title}</p>
                        {scannedLoan.book.author && <p className="text-xs text-gray-500">{scannedLoan.book.author.name}</p>}
                        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                          {scannedLoan.copy?.barcode && (
                            <p className="text-xs font-mono text-indigo-600">{scannedLoan.copy.barcode}</p>
                          )}
                          {!scannedLoan.copy && scannedLoan.book.barcode && (
                            <p className="text-xs font-mono text-indigo-600">{scannedLoan.book.barcode}</p>
                          )}
                          {scannedLoan.copy && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded font-bold uppercase tracking-wide">
                              Copy #{scannedLoan.copy.copyNumber}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          {scannedLoan.status === "OVERDUE" ? (
                            <span className="text-xs text-red-600 font-semibold flex items-center gap-0.5 bg-red-100 px-2 py-0.5 rounded-full">
                              <AlertTriangle className="w-3 h-3" /> {t("daysOverdueBadge", { count: daysOverdue(scannedLoan.dueDate) })}
                            </span>
                          ) : (
                            <span className="text-xs text-blue-600 flex items-center gap-0.5 bg-blue-100 px-2 py-0.5 rounded-full">
                              <Calendar className="w-3 h-3" /> {t("dueBadge", { date: new Date(scannedLoan.dueDate).toLocaleDateString() })}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Borrower info */}
                    <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                        <User className="w-4 h-4 text-blue-500" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{scannedLoan.member.name}</p>
                        <p className="text-xs font-mono text-blue-600">{scannedLoan.member.memberId}</p>
                      </div>
                    </div>

                    {/* Inline feedback */}
                    {returnMsg?.id === scannedLoan.id && (
                      <p className={`text-sm font-medium flex items-center gap-1 ${returnMsg.ok ? "text-green-600" : "text-red-600"}`}>
                        {returnMsg.ok ? <CheckCheck className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                        {returnMsg.text}
                      </p>
                    )}

                    {/* Return button */}
                    {returnBusy === scannedLoan.id ? (
                      <div className="flex items-center justify-center gap-2 py-3 text-green-600 text-sm">
                        <Loader2 className="w-4 h-4 animate-spin" /> {t("returning")}
                      </div>
                    ) : (
                      <button onClick={handleScannedReturn}
                        disabled={!!returnBusy}
                        className="w-full flex items-center justify-center gap-2 py-3 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 transition-colors disabled:opacity-50">
                        <CheckCheck className="w-4 h-4" /> {t("confirmReturn")}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Mode: Find by Member ── */}
          {returnMode === "member" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">

              {/* Left: member search */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{t("selectBorrower")}</p>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <MemberSearch
                      value={returnQuery}
                      onChange={(v) => { setReturnQuery(v); if (returnMember) clearReturnMember(); }}
                      onSelect={selectReturnMember}
                      onClear={clearReturnMember}
                      maxLoans={maxLoans}
                      placeholder={t("memberSearchPlaceholder")}
                    />
                  </div>
                  <button type="button" onClick={() => startScan("member-r")} title={t("scanMemberCard")}
                    className="flex items-center px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
                    <ScanLine className="w-4 h-4" />
                  </button>
                </div>
                {scanTarget === "member-r" && (
                  <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
                    <video ref={memberRVideoRef} className="w-full h-full object-cover" />
                    <button type="button" onClick={() => setScanTarget(null)}
                      className="absolute top-2 right-2 bg-black/50 text-white p-1 rounded-full"><X className="w-3 h-3" /></button>
                  </div>
                )}

                {returnMember && (
                  <div className={`rounded-lg px-3 py-3 border ${returnMember.hasOverdue ? "bg-red-50 border-red-200" : "bg-blue-50 border-blue-100"}`}>
                    <div className="flex items-center gap-2">
                      <User className={`w-4 h-4 ${returnMember.hasOverdue ? "text-red-400" : "text-blue-400"}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-800">{returnMember.name}</p>
                        <p className="text-xs font-mono text-blue-600">{returnMember.memberId}</p>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
                      <span>{t("activeLoansCount", { count: returnMember._count?.loans ?? 0 })}</span>
                      {returnMember.hasOverdue && (
                        <span className="text-red-600 font-medium flex items-center gap-0.5">
                          <AlertTriangle className="w-3 h-3" /> {t("hasOverdue")}
                        </span>
                      )}
                    </div>
                  </div>
                )}
                {!returnMember && (
                  <div className="text-center py-8 text-gray-300">
                    <User className="w-10 h-10 mx-auto mb-2" />
                    <p className="text-sm">{t("searchForBorrower")}</p>
                  </div>
                )}
              </div>

              {/* Right: their active loans */}
              <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-gray-400" />
                  <h2 className="font-semibold text-gray-800">{t("activeLoans")}</h2>
                  {memberLoans.length > 0 && (
                    <span className="ml-auto text-xs bg-gray-100 text-gray-600 font-medium px-2 py-0.5 rounded-full">
                      {memberLoans.length} {t("booksLabel")}
                    </span>
                  )}
                </div>

                {memberLoansBusy ? (
                  <div className="p-8 text-center text-gray-400 flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> {tc("loading")}
                  </div>
                ) : !returnMember ? (
                  <div className="p-8 text-center text-gray-300">
                    <BookOpen className="w-10 h-10 mx-auto mb-2" />
                    <p className="text-sm">{t("selectBorrowerFirst")}</p>
                  </div>
                ) : memberLoans.length === 0 ? (
                  <div className="p-8 text-center">
                    <CheckCheck className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-400 text-sm">{t("noActiveLoansForMember")}</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {memberLoans.map((loan) => {
                      const overdueDays = loan.status === "OVERDUE" ? daysOverdue(loan.dueDate) : 0;
                      return (
                        <div key={loan.id} className={`flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors ${loan.status === "OVERDUE" ? "bg-red-50/40" : ""}`}>
                          <div className={`w-10 h-14 rounded-lg flex items-center justify-center flex-shrink-0 ${loan.status === "OVERDUE" ? "bg-red-100" : "bg-blue-50"}`}>
                            <BookOpen className={`w-5 h-5 ${loan.status === "OVERDUE" ? "text-red-400" : "text-blue-400"}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 text-sm truncate">{loan.book.title}</p>
                            {loan.book.author && <p className="text-xs text-gray-400">{loan.book.author.name}</p>}
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              {loan.book.barcode && (
                                <span className="text-xs font-mono text-indigo-500 flex items-center gap-0.5">
                                  <Barcode className="w-3 h-3" />{loan.book.barcode}
                                </span>
                              )}
                              {loan.status === "OVERDUE" ? (
                                <span className="text-xs text-red-600 font-semibold flex items-center gap-0.5">
                                  <AlertTriangle className="w-3 h-3" /> {t("daysOverdueBadge", { count: overdueDays })}
                                </span>
                              ) : (
                                <span className="text-xs text-gray-400 flex items-center gap-0.5">
                                  <Calendar className="w-3 h-3" /> {t("dueBadge", { date: new Date(loan.dueDate).toLocaleDateString() })}
                                </span>
                              )}
                              {loan.renewalCount > 0 && <span className="text-xs text-gray-400">{t("renewedTimes", { count: loan.renewalCount })}</span>}
                            </div>
                            {returnMsg?.id === loan.id && (
                              <p className={`text-xs mt-1 font-medium ${returnMsg.ok ? "text-green-600" : "text-red-600"}`}>{returnMsg.text}</p>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                            {returnBusy === loan.id ? (
                              <span className="flex items-center gap-1.5 text-xs text-green-600 px-3 py-1.5">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t("returning")}
                              </span>
                            ) : (
                              <button onClick={() => handleReturnBook(loan.id)} disabled={!!returnBusy}
                                className="flex items-center gap-1.5 text-xs bg-green-600 text-white hover:bg-green-700 px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-40">
                                <CheckCheck className="w-3.5 h-3.5" /> {t("return")}
                              </button>
                            )}
                            {loan.loanType !== "IN_LIBRARY" && (
                              <button onClick={() => handleRenew(loan.id)} disabled={!!returnBusy || !!renewBusy}
                                className="flex items-center gap-1.5 text-xs bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-40">
                                {renewBusy === loan.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                                {t("renew")}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          ACTIVE LOANS TAB
          ════════════════════════════════════════════════════════ */}
      {tab === "active" && (
        <div className="space-y-4">

          {/* ── Filter bar ── */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-wrap gap-3 items-center">

            {/* Search */}
            <div className="relative flex-1 min-w-48">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                placeholder={t("filterSearchPlaceholder")}
                className="w-full pl-9 pr-8 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {filterSearch && (
                <button onClick={() => setFilterSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Status filter */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
              {([
                ["ALL",     t("filterAllStatus", { count: loans.length })],
                ["ACTIVE",  t("filterActive",    { count: activeCount })],
                ["OVERDUE", t("filterOverdue",   { count: overdueCount })],
              ] as [typeof filterStatus, string][]).map(([val, label]) => (
                <button key={val} onClick={() => setFilterStatus(val)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    filterStatus === val
                      ? val === "OVERDUE" ? "bg-red-500 text-white shadow-sm"
                        : "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}>
                  {label}
                </button>
              ))}
            </div>

            {/* Loan type filter */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
              {([
                ["ALL",        t("filterAllTypes")],
                ["HOME",       t("filterTakeHome")],
                ["IN_LIBRARY", t("filterInLibrary")],
              ] as [typeof filterType, string][]).map(([val, label]) => (
                <button key={val} onClick={() => setFilterType(val)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    filterType === val ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  }`}>
                  {label}
                </button>
              ))}
            </div>

            {/* Sort */}
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="dueDate">{t("sortDueDate")}</option>
              <option value="borrowDate">{t("sortNewest")}</option>
              <option value="member">{t("sortMember")}</option>
              <option value="book">{t("sortBook")}</option>
            </select>
          </div>

          {/* ── Table ── */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">

            {/* Result count header */}
            {!loading && loans.length > 0 && (
              <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-3 bg-gray-50/50">
                <span className="text-xs text-gray-500">
                  {filteredLoans.length !== loans.length
                    ? t("showingLoansOf", { shown: filteredLoans.length, total: loans.length })
                    : t("showingLoans", { shown: filteredLoans.length })}
                </span>
                {overdueCount > 0 && (
                  <span className="flex items-center gap-1 text-xs text-red-600 font-medium bg-red-50 px-2 py-0.5 rounded-full">
                    <AlertTriangle className="w-3 h-3" /> {t("filterOverdue", { count: overdueCount })}
                  </span>
                )}
                {(filterSearch || filterStatus !== "ALL" || filterType !== "ALL") && (
                  <button onClick={() => { setFilterSearch(""); setFilterStatus("ALL"); setFilterType("ALL"); }}
                    className="ml-auto text-xs text-indigo-600 hover:underline flex items-center gap-1">
                    <X className="w-3 h-3" /> {t("clearFilters")}
                  </button>
                )}
              </div>
            )}

            {loading ? (
              <div className="p-8 text-center text-gray-400">{tc("loading")}</div>
            ) : loans.length === 0 ? (
              <div className="p-8 text-center">
                <CheckCheck className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-400">{tc("noData")}</p>
              </div>
            ) : filteredLoans.length === 0 ? (
              <div className="p-8 text-center">
                <Clock className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500 font-medium">{t("noMatchFilters")}</p>
                <button onClick={() => { setFilterSearch(""); setFilterStatus("ALL"); setFilterType("ALL"); }}
                  className="mt-2 text-sm text-indigo-600 hover:underline">{t("clearFilters")}</button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-3 text-left">{t("memberIdLabel")}</th>
                      <th className="px-6 py-3 text-left">{t("colBook")}</th>
                      <th className="px-6 py-3 text-left">{t("borrowDate")}</th>
                      <th className="px-6 py-3 text-left">{t("dueDate")}</th>
                      <th className="px-6 py-3 text-left">{tc("status")}</th>
                      <th className="px-6 py-3 text-left">{tc("actions")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredLoans.map((loan) => (
                      <tr key={loan.id} className={`hover:bg-gray-50 transition-colors ${loan.status === "OVERDUE" ? "bg-red-50/30" : ""}`}>
                        <td className="px-6 py-4">
                          <p className="text-sm font-medium text-gray-900">{loan.member.name}</p>
                          <p className="text-xs text-gray-400 font-mono">{loan.member.memberId}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm font-medium text-gray-900">{loan.book.title}</p>
                          <p className="text-xs text-gray-400">{loan.book.author?.name}</p>
                          {(loan.book.barcode || loan.book.isbn) && (
                            <p className="text-xs font-mono mt-0.5 text-indigo-500">{loan.book.barcode ?? loan.book.isbn}</p>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">{formatDate(loan.borrowDate)}</td>
                        <td className="px-6 py-4">
                          <p className={`text-sm font-medium ${loan.status === "OVERDUE" ? "text-red-600" : "text-gray-600"}`}>
                            {formatDate(loan.dueDate)}
                          </p>
                          {loan.status === "OVERDUE" && (
                            <p className="text-xs text-red-500 font-semibold">{t("daysOverdueBadge", { count: daysOverdue(loan.dueDate) })}</p>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
                            <span className={`flex items-center gap-1 text-xs font-medium ${loan.status === "OVERDUE" ? "text-red-600" : "text-blue-600"}`}>
                              {loan.status === "OVERDUE" ? <AlertTriangle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                              {loan.status === "OVERDUE" ? t("overdue") : tc("active")}
                            </span>
                            {loan.loanType === "IN_LIBRARY" && (
                              <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded w-fit">
                                <BookMarked className="w-3 h-3" /> {t("inLibraryBadge")}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            {loan.loanType !== "IN_LIBRARY" && (
                              renewBusy === loan.id ? (
                                <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                              ) : (
                                <button onClick={() => handleRenew(loan.id)} disabled={!!returnBusy}
                                  className="flex items-center gap-1.5 text-xs bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-40">
                                  <RefreshCw className="w-3.5 h-3.5" />
                                  {t("renew")}{loan.renewalCount > 0 ? ` (${loan.renewalCount})` : ""}
                                </button>
                              )
                            )}
                            {returnBusy === loan.id ? (
                              <span className="flex items-center gap-1.5 text-xs text-green-600 px-3 py-1.5">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t("returning")}
                              </span>
                            ) : (
                              <button onClick={() => handleReturn(loan.id)} disabled={!!returnBusy || !!renewBusy}
                                className="flex items-center gap-1.5 text-xs bg-green-50 text-green-700 hover:bg-green-100 px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-40">
                                <CheckCheck className="w-3.5 h-3.5" />{t("return")}
                              </button>
                            )}
                            <button onClick={() => openLostDialog(loan)}
                              disabled={!!returnBusy || !!renewBusy || lostBusy}
                              title={t("markAsLostTitle")}
                              className="flex items-center gap-1.5 text-xs bg-red-50 text-red-600 hover:bg-red-100 px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-40">
                              <PackageX className="w-3.5 h-3.5" /> {t("lostBtn")}
                            </button>
                          </div>
                          {renewMsg?.id === loan.id && (
                            <p className={`text-xs mt-1 ${renewMsg.ok ? "text-indigo-600" : "text-red-600"}`}>{renewMsg.text}</p>
                          )}
                          {returnMsg?.id === loan.id && (
                            <p className={`text-xs mt-1 ${returnMsg.ok ? "text-green-600" : "text-red-600"}`}>{returnMsg.text}</p>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ LOST BOOK DIALOG ══ */}
      {lostDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            {/* Header */}
            <div className="flex items-start gap-3 mb-5">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <PackageX className="w-5 h-5 text-red-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-bold text-gray-900">{t("markBookAsLost")}</h2>
                <p className="text-sm text-gray-500 mt-0.5 truncate">{lostDialog.loan.book.title}</p>
                <p className="text-xs text-gray-400">{lostDialog.loan.member.name} · {lostDialog.loan.member.memberId}</p>
              </div>
              <button onClick={() => setLostDialog(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            {/* What will happen */}
            <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-5 space-y-1.5">
              <p className="text-xs font-semibold text-red-700 mb-2">{t("lostActionWill")}</p>
              <p className="text-xs text-red-600 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />{t("lostActionStatus")}</p>
              <p className="text-xs text-red-600 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />{t("lostActionCopies")}</p>
              <p className="text-xs text-red-600 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />{t("lostActionFee")}</p>
            </div>
            {/* Replacement fee input */}
            <div className="mb-5">
              <label htmlFor="circ-replacement-fee" className="block text-sm font-medium text-gray-700 mb-1.5">{t("replacementFee")}</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  id="circ-replacement-fee"
                  type="number"
                  min={0}
                  step={0.01}
                  value={lostDialog.amount}
                  onChange={(e) => setLostDialog((d) => d ? { ...d, amount: e.target.value } : d)}
                  className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                  disabled={lostBusy}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">{t("feePrefilledHint")}</p>
            </div>
            {lostMsg && (
              <p className={`text-xs mb-4 px-3 py-2 rounded-lg ${lostMsg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
                {lostMsg.text}
              </p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setLostDialog(null)}
                disabled={lostBusy}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50">
                {tc("cancel")}
              </button>
              <button
                onClick={confirmLost}
                disabled={lostBusy || !lostDialog.amount || parseFloat(lostDialog.amount) < 0}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {lostBusy
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> {t("processing")}</>
                  : <><PackageX className="w-4 h-4" /> {t("confirmLost")}</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
