"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import {
  AlertCircle, CheckCircle, XCircle, Search, Printer,
  CreditCard, Banknote, Smartphone, HelpCircle, ChevronDown,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

interface Fine {
  id: string;
  amount: number;
  daysLate: number;
  type: "LATE_FEE" | "REPLACEMENT" | "DAMAGED";
  status: "UNPAID" | "PAID" | "WAIVED";
  paidAt?: string | null;
  paymentMethod?: string | null;
  notes?: string | null;
  createdAt: string;
  member: { id: string; name: string; memberId: string };
  loan: { book: { title: string }; dueDate: string; returnDate?: string | null };
}

type FilterStatus = "ALL" | "UNPAID" | "PAID" | "WAIVED";

const PAYMENT_METHODS = [
  { value: "cash",          label: "Cash",          icon: <Banknote className="w-4 h-4" /> },
  { value: "bank_transfer", label: "Bank Transfer",  icon: <CreditCard className="w-4 h-4" /> },
  { value: "online",        label: "Online",         icon: <Smartphone className="w-4 h-4" /> },
  { value: "other",         label: "Other",          icon: <HelpCircle className="w-4 h-4" /> },
];

function methodLabel(m?: string | null) {
  return PAYMENT_METHODS.find((x) => x.value === m)?.label ?? m ?? "—";
}

function TypeBadge({ type }: { type: string }) {
  if (type === "LATE_FEE")    return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-700 font-medium border border-orange-200">Late Fee</span>;
  if (type === "REPLACEMENT") return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-700 font-medium border border-red-200">Replacement</span>;
  if (type === "DAMAGED")     return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium border border-amber-200">Damaged</span>;
  return null;
}

export default function FinesPage() {
  const t  = useTranslations("fines");
  const tc = useTranslations("common");

  const [fines,   setFines]   = useState<Fine[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState<FilterStatus>("ALL");
  const [search,  setSearch]  = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // ── Pay modal ──
  const [payTarget,   setPayTarget]   = useState<Fine | null>(null);
  const [payMethod,   setPayMethod]   = useState("cash");
  const [payNotes,    setPayNotes]    = useState("");
  const [payLoading,  setPayLoading]  = useState(false);

  // ── Waive modal ──
  const [waiveTarget,  setWaiveTarget]  = useState<Fine | null>(null);
  const [waiveNotes,   setWaiveNotes]   = useState("");
  const [waiveLoading, setWaiveLoading] = useState(false);

  // ── Receipt modal ──
  const [receiptFine, setReceiptFine] = useState<Fine | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  // ── Multi-select for combined receipt ──
  const [selectedFineIds, setSelectedFineIds] = useState<Set<string>>(new Set());

  // ── Inline error banner ──
  const [actionError, setActionError] = useState<string | null>(null);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const fetchFines = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter !== "ALL")     params.set("status", filter);
    if (debouncedSearch)      params.set("search", debouncedSearch);
    const data = await fetch(`/api/fines?${params}`).then((r) => r.json());
    setFines(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [filter, debouncedSearch]);

  useEffect(() => { fetchFines(); setSelectedFineIds(new Set()); }, [fetchFines]);

  // ── Mark paid ──
  async function handlePay() {
    if (!payTarget) return;
    setPayLoading(true);
    setActionError(null);
    const res = await fetch(`/api/fines/${payTarget.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ action: "pay", paymentMethod: payMethod, notes: payNotes || undefined }),
    });
    setPayLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setActionError(data.error ?? `Server error ${res.status}. Try refreshing the page.`);
      return;
    }
    setPayTarget(null); setPayMethod("cash"); setPayNotes("");
    fetchFines();
    window.dispatchEvent(new CustomEvent("alertsChanged"));
  }

  // ── Waive ──
  async function handleWaive() {
    if (!waiveTarget) return;
    setWaiveLoading(true);
    setActionError(null);
    const res = await fetch(`/api/fines/${waiveTarget.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ action: "waive", notes: waiveNotes || undefined }),
    });
    setWaiveLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setActionError(data.error ?? `Server error ${res.status}. Try refreshing the page.`);
      return;
    }
    setWaiveTarget(null); setWaiveNotes("");
    fetchFines();
    window.dispatchEvent(new CustomEvent("alertsChanged"));
  }

  // ── Toggle fine selection (PAID / WAIVED only; lock to first-selected member) ──
  function toggleFineSelection(fine: Fine) {
    if (fine.status === "UNPAID") return;
    setSelectedFineIds((prev) => {
      const next = new Set(prev);
      if (next.has(fine.id)) {
        next.delete(fine.id);
      } else {
        next.add(fine.id);
      }
      return next;
    });
  }

  // ── Print full A4 receipt ──
  function handlePrint() {
    const el = printRef.current;
    if (!el) return;
    const w = window.open("", "_blank", "width=600,height=700");
    if (!w) return;
    w.document.write(`
      <html><head><title>Fine Receipt</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 32px; font-size: 13px; color: #111; }
        h1 { font-size: 18px; margin-bottom: 4px; }
        .sub { color: #666; font-size: 12px; margin-bottom: 24px; }
        table { width: 100%; border-collapse: collapse; }
        td { padding: 6px 0; vertical-align: top; }
        td:first-child { width: 140px; color: #555; }
        .amount { font-size: 22px; font-weight: bold; margin: 16px 0; }
        .badge { display: inline-block; padding: 2px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; background: #dcfce7; color: #166534; }
        .footer { margin-top: 32px; border-top: 1px solid #e5e7eb; padding-top: 16px; font-size: 11px; color: #9ca3af; text-align: center; }
        @media print { button { display: none; } }
      </style></head><body>
      ${el.innerHTML}
      <div class="footer">This is an official receipt. Please keep it for your records.</div>
      <br/><button onclick="window.print()">🖨 Print</button>
      </body></html>
    `);
    w.document.close();
  }

  // ── Print POS receipt (58mm or 80mm thermal printer) ──
  async function handlePOSPrint(fine: Fine, mm: 58 | 80) {
    // Fetch library info from settings
    let libName = "PVD Library";
    let libPhone = "";
    let libAddress = "";
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const s = await res.json();
        libName    = s.LIBRARY_NAME    || libName;
        libPhone   = s.LIBRARY_PHONE   || "";
        libAddress = s.LIBRARY_ADDRESS || "";
      }
    } catch { /* use defaults */ }

    // Preview width (screen only — @page controls actual print size)
    const previewPx   = mm === 58 ? 260 : 320;
    const fontSize    = mm === 58 ? "11px" : "12px";
    const charWidth   = mm === 58 ? 32 : 42;

    const sep   = "-".repeat(charWidth);
    const thick = "=".repeat(charWidth);

    const fineTypeLabel: Record<string, string> = {
      LATE_FEE:    "Late Return Fee",
      REPLACEMENT: "Replacement",
      DAMAGED:     "Damaged Book",
    };

    const statusLabel = fine.status === "PAID" ? "✓ PAID" : "◎ WAIVED";
    const now = new Date().toLocaleString();
    const receiptNo = `RCP-${fine.id.slice(-8).toUpperCase()}`;

    const row = (label: string, value: string) =>
      `<tr>
        <td style="color:#555;font-size:10px;padding:1px 0;width:45%;">${label}</td>
        <td style="font-weight:600;text-align:right;font-size:10px;padding:1px 0;">${value}</td>
      </tr>`;

    const receiptBody = `
      <!-- Header -->
      <div style="text-align:center;padding:6px 0 4px;">
        <div style="font-size:${mm === 58 ? "14px" : "16px"};font-weight:bold;">${libName}</div>
        ${libAddress ? `<div style="font-size:9px;color:#444;">${libAddress}</div>` : ""}
        ${libPhone   ? `<div style="font-size:9px;color:#444;">Tel: ${libPhone}</div>` : ""}
      </div>
      <div style="white-space:pre;font-size:10px;">${thick}</div>
      <div style="text-align:center;font-weight:bold;padding:3px 0;font-size:11px;">FINE PAYMENT RECEIPT</div>
      <div style="white-space:pre;font-size:10px;">${sep}</div>

      <!-- Meta -->
      <table style="width:100%;border-collapse:collapse;">
        ${row("Date",      new Date().toLocaleDateString())}
        ${row("Time",      new Date().toLocaleTimeString())}
        ${row("Receipt#",  receiptNo)}
      </table>
      <div style="white-space:pre;font-size:10px;">${sep}</div>

      <!-- Member -->
      <div style="font-size:9px;color:#777;padding-top:2px;">MEMBER</div>
      <div style="font-weight:bold;word-break:break-word;">${fine.member.name}</div>
      <div style="font-size:9px;">ID: ${fine.member.memberId}</div>
      <div style="white-space:pre;font-size:10px;">${sep}</div>

      <!-- Book -->
      <div style="font-size:9px;color:#777;padding-top:2px;">BOOK</div>
      <div style="word-break:break-word;font-size:${fontSize};">${fine.loan.book.title}</div>
      <div style="white-space:pre;font-size:10px;">${sep}</div>

      <!-- Fine details -->
      <table style="width:100%;border-collapse:collapse;">
        ${row("Type", fineTypeLabel[fine.type] ?? fine.type)}
        ${fine.daysLate > 0 ? row("Days Late", `${fine.daysLate} day${fine.daysLate !== 1 ? "s" : ""}`) : ""}
        ${row("Due Date", new Date(fine.loan.dueDate).toLocaleDateString())}
        ${fine.loan.returnDate ? row("Returned", new Date(fine.loan.returnDate).toLocaleDateString()) : ""}
      </table>
      <div style="white-space:pre;font-size:10px;">${sep}</div>

      <!-- Amount -->
      <div style="text-align:center;font-size:${mm === 58 ? "20px" : "22px"};font-weight:bold;padding:6px 0 2px;">
        $${fine.amount.toFixed(2)}
      </div>
      <div style="text-align:center;font-size:${mm === 58 ? "13px" : "14px"};font-weight:bold;padding:2px 0 4px;letter-spacing:1px;">
        ${statusLabel}
      </div>
      <div style="white-space:pre;font-size:10px;">${sep}</div>

      <!-- Payment info -->
      <table style="width:100%;border-collapse:collapse;">
        ${fine.paymentMethod && fine.paymentMethod !== "waived"
          ? row("Method", fine.paymentMethod.replace("_", " ").toUpperCase())
          : ""}
        ${fine.paidAt ? row("Paid On", new Date(fine.paidAt).toLocaleDateString()) : ""}
      </table>
      ${fine.notes ? `<div style="font-size:9px;font-style:italic;padding:2px 0;word-break:break-word;">Note: ${fine.notes}</div>` : ""}

      <div style="white-space:pre;font-size:10px;">${thick}</div>
      <div style="text-align:center;font-size:9px;padding:3px 0;">Thank you. Please keep this receipt.</div>
      <div style="text-align:center;font-size:9px;">Printed: ${now}</div>
      <div style="white-space:pre;font-size:10px;">${thick}</div>
    `;

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>POS Receipt — ${receiptNo}</title>
<style>
  /* ── Actual print output: exact paper size ── */
  @page { size: ${mm}mm auto; margin: 2mm 3mm; }

  /* ── Screen: comfortable preview on gray background ── */
  body {
    margin: 0;
    padding: 0;
    background: #e5e7eb;
    font-family: 'Courier New', Courier, monospace;
    font-size: ${fontSize};
    color: #000;
  }

  /* Toolbar (hidden on print) */
  #toolbar {
    position: sticky;
    top: 0;
    z-index: 10;
    background: #1e3a8a;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    font-family: system-ui, sans-serif;
    font-size: 13px;
  }
  #toolbar span { opacity: 0.8; font-size: 12px; }
  #printBtn {
    background: #fff;
    color: #1e3a8a;
    border: none;
    border-radius: 8px;
    padding: 7px 20px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  #printBtn:hover { background: #dbeafe; }

  /* Receipt card */
  #preview {
    display: flex;
    justify-content: center;
    padding: 24px 16px 40px;
  }
  #receipt {
    background: #fff;
    width: ${previewPx}px;
    padding: 12px 14px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.18);
    border-radius: 2px;
  }

  /* ── On print: no toolbar, no gray bg, receipt fills page ── */
  @media print {
    body { background: #fff; }
    #toolbar { display: none; }
    #preview { padding: 0; }
    #receipt {
      width: 100%;
      box-shadow: none;
      border-radius: 0;
      padding: 0;
    }
  }
</style>
</head>
<body>

  <!-- Toolbar -->
  <div id="toolbar">
    <span>🖨 POS Receipt Preview &nbsp;·&nbsp; ${mm}mm paper</span>
    <button id="printBtn" onclick="window.print();">
      Print ${mm}mm
    </button>
  </div>

  <!-- Receipt preview -->
  <div id="preview">
    <div id="receipt">
      ${receiptBody}
    </div>
  </div>

</body>
</html>`;

    // Open a comfortable-sized preview window — NOT auto-printing
    const w = window.open(
      "", "_blank",
      "width=520,height=700,resizable=yes,scrollbars=yes"
    );
    if (!w) return;
    w.document.write(html);
    w.document.close();
  }

  // ── Print combined POS receipt for multiple fines (same member) ──
  async function handleCombinedPOSPrint(combinedFines: Fine[], mm: 58 | 80) {
    let libName    = "PVD Library";
    let libPhone   = "";
    let libAddress = "";
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const s = await res.json();
        libName    = s.LIBRARY_NAME    || libName;
        libPhone   = s.LIBRARY_PHONE   || "";
        libAddress = s.LIBRARY_ADDRESS || "";
      }
    } catch { /* use defaults */ }

    const previewPx  = mm === 58 ? 260 : 320;
    const fontSize   = mm === 58 ? "11px" : "12px";
    const charWidth  = mm === 58 ? 32 : 42;
    const sep        = "-".repeat(charWidth);
    const thick      = "=".repeat(charWidth);

    const fineTypeLabel: Record<string, string> = {
      LATE_FEE:    "Late Return Fee",
      REPLACEMENT: "Replacement",
      DAMAGED:     "Damaged Book",
    };

    const member      = combinedFines[0].member;
    const grandTotal  = combinedFines.reduce((s, f) => s + f.amount, 0);
    const allPaid     = combinedFines.every((f) => f.status === "PAID");
    const allWaived   = combinedFines.every((f) => f.status === "WAIVED");
    const statusLine  = allPaid ? "✓ ALL PAID" : allWaived ? "◎ ALL WAIVED" : "✓ PAID / ◎ WAIVED";
    const receiptNo   = `COMB-${Date.now().toString().slice(-8)}`;
    const now         = new Date().toLocaleString();

    const lineItemRows = combinedFines.map((f, i) => {
      const typeStr = fineTypeLabel[f.type] ?? f.type;
      const daysStr = f.daysLate > 0 ? ` | ${f.daysLate}d late` : "";
      // Truncate title to fit column
      const maxTitle = mm === 58 ? 18 : 24;
      const title = f.loan.book.title.length > maxTitle
        ? f.loan.book.title.slice(0, maxTitle - 1) + "…"
        : f.loan.book.title;
      return `
        <tr>
          <td style="font-size:10px;padding:2px 0;vertical-align:top;width:14px;color:#888;">${i + 1}.</td>
          <td style="font-size:10px;padding:2px 4px;vertical-align:top;word-break:break-word;">
            <div style="font-weight:600;">${title}</div>
            <div style="color:#666;font-size:9px;">${typeStr}${daysStr}</div>
          </td>
          <td style="font-size:10px;padding:2px 0;font-weight:700;text-align:right;vertical-align:top;white-space:nowrap;">$${f.amount.toFixed(2)}</td>
        </tr>`;
    }).join("");

    const receiptBody = `
      <!-- Header -->
      <div style="text-align:center;padding:6px 0 4px;">
        <div style="font-size:${mm === 58 ? "14px" : "16px"};font-weight:bold;">${libName}</div>
        ${libAddress ? `<div style="font-size:9px;color:#444;">${libAddress}</div>` : ""}
        ${libPhone   ? `<div style="font-size:9px;color:#444;">Tel: ${libPhone}</div>` : ""}
      </div>
      <div style="white-space:pre;font-size:10px;">${thick}</div>
      <div style="text-align:center;font-weight:bold;padding:3px 0;font-size:11px;">COMBINED FINE RECEIPT</div>
      <div style="white-space:pre;font-size:10px;">${sep}</div>

      <!-- Meta -->
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="color:#555;font-size:10px;padding:1px 0;width:45%;">Date</td>
          <td style="font-weight:600;text-align:right;font-size:10px;">${new Date().toLocaleDateString()}</td>
        </tr>
        <tr>
          <td style="color:#555;font-size:10px;padding:1px 0;">Time</td>
          <td style="font-weight:600;text-align:right;font-size:10px;">${new Date().toLocaleTimeString()}</td>
        </tr>
        <tr>
          <td style="color:#555;font-size:10px;padding:1px 0;">Receipt#</td>
          <td style="font-weight:600;text-align:right;font-size:10px;">${receiptNo}</td>
        </tr>
      </table>
      <div style="white-space:pre;font-size:10px;">${sep}</div>

      <!-- Member -->
      <div style="font-size:9px;color:#777;padding-top:2px;">MEMBER</div>
      <div style="font-weight:bold;word-break:break-word;">${member.name}</div>
      <div style="font-size:9px;">ID: ${member.memberId}</div>
      <div style="white-space:pre;font-size:10px;">${sep}</div>

      <!-- Line items -->
      <div style="font-size:9px;color:#777;padding:2px 0 3px;">ITEMS (${combinedFines.length})</div>
      <table style="width:100%;border-collapse:collapse;">
        ${lineItemRows}
      </table>
      <div style="white-space:pre;font-size:10px;">${sep}</div>

      <!-- Grand total -->
      <div style="text-align:center;font-size:${mm === 58 ? "20px" : "22px"};font-weight:bold;padding:6px 0 2px;">
        $${grandTotal.toFixed(2)}
      </div>
      <div style="text-align:center;font-size:${mm === 58 ? "13px" : "14px"};font-weight:bold;padding:2px 0 4px;letter-spacing:1px;">
        ${statusLine}
      </div>
      <div style="white-space:pre;font-size:10px;">${thick}</div>
      <div style="text-align:center;font-size:9px;padding:3px 0;">Thank you. Please keep this receipt.</div>
      <div style="text-align:center;font-size:9px;">Printed: ${now}</div>
      <div style="white-space:pre;font-size:10px;">${thick}</div>
    `;

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Combined Receipt — ${receiptNo}</title>
<style>
  @page { size: ${mm}mm auto; margin: 2mm 3mm; }
  body {
    margin: 0; padding: 0;
    background: #e5e7eb;
    font-family: 'Courier New', Courier, monospace;
    font-size: ${fontSize};
    color: #000;
  }
  #toolbar {
    position: sticky; top: 0; z-index: 10;
    background: #1e3a8a; color: #fff;
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 16px;
    font-family: system-ui, sans-serif; font-size: 13px;
  }
  #toolbar span { opacity: 0.8; font-size: 12px; }
  #printBtn {
    background: #fff; color: #1e3a8a;
    border: none; border-radius: 8px;
    padding: 7px 20px; font-size: 13px; font-weight: 700;
    cursor: pointer;
  }
  #printBtn:hover { background: #dbeafe; }
  #preview { display: flex; justify-content: center; padding: 24px 16px 40px; }
  #receipt {
    background: #fff; width: ${previewPx}px;
    padding: 12px 14px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.18); border-radius: 2px;
  }
  @media print {
    body { background: #fff; }
    #toolbar { display: none; }
    #preview { padding: 0; }
    #receipt { width: 100%; box-shadow: none; border-radius: 0; padding: 0; }
  }
</style>
</head>
<body>
  <div id="toolbar">
    <span>🖨 Combined Receipt &nbsp;·&nbsp; ${mm}mm &nbsp;·&nbsp; ${combinedFines.length} items</span>
    <button id="printBtn" onclick="window.print();">Print ${mm}mm</button>
  </div>
  <div id="preview">
    <div id="receipt">${receiptBody}</div>
  </div>
</body>
</html>`;

    const w = window.open("", "_blank", "width=520,height=700,resizable=yes,scrollbars=yes");
    if (!w) return;
    w.document.write(html);
    w.document.close();
  }

  // Summaries
  const totalUnpaid = fines.filter((f) => f.status === "UNPAID").reduce((s, f) => s + f.amount, 0);
  const totalPaid   = fines.filter((f) => f.status === "PAID").reduce((s, f) => s + f.amount, 0);
  const countWaived      = fines.filter((f) => f.status === "WAIVED").length;
  const selectedFines    = fines.filter((f) => selectedFineIds.has(f.id));
  const selectedMemberId = selectedFines.length > 0 ? selectedFines[0].member.id : null;
  const selectedTotal    = selectedFines.reduce((s, f) => s + f.amount, 0);
  // True only when every selected fine belongs to the same member
  const selectionIsUniform = selectedFines.length > 0 &&
    selectedFines.every((f) => f.member.id === selectedMemberId);

  const TABS: { value: FilterStatus; label: string; count?: number }[] = [
    { value: "ALL",    label: tc("filter") + " All" },
    { value: "UNPAID", label: t("unpaid"),  count: fines.filter((f) => f.status === "UNPAID").length },
    { value: "PAID",   label: t("paid"),    count: fines.filter((f) => f.status === "PAID").length },
    { value: "WAIVED", label: t("waived"),  count: fines.filter((f) => f.status === "WAIVED").length },
  ];

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
        <div className="flex items-center gap-2 flex-wrap">
          {totalUnpaid > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm">
              <span className="text-red-600 font-medium">{t("unpaid")}: </span>
              <span className="text-red-700 font-bold">${totalUnpaid.toFixed(2)}</span>
            </div>
          )}
          {totalPaid > 0 && filter !== "UNPAID" && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-sm">
              <span className="text-green-700 font-medium">{t("paid")}: </span>
              <span className="text-green-800 font-bold">${totalPaid.toFixed(2)}</span>
            </div>
          )}
          {countWaived > 0 && filter !== "UNPAID" && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-sm">
              <span className="text-gray-600 font-medium">{t("waived")}: </span>
              <span className="text-gray-700 font-bold">{countWaived}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Filters row ── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Tabs */}
        <div className="flex gap-1.5 flex-wrap">
          {TABS.map((tab) => (
            <button key={tab.value} onClick={() => setFilter(tab.value)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                filter === tab.value
                  ? "bg-blue-900 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}>
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-semibold ${
                  filter === tab.value ? "bg-white/25 text-white" : "bg-gray-200 text-gray-700"
                }`}>{tab.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[180px] max-w-sm ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* ── Action error banner ── */}
      {actionError && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{actionError}</span>
          <button onClick={() => setActionError(null)} className="text-red-400 hover:text-red-600 ml-2">✕</button>
        </div>
      )}

      {/* ── Table ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">{tc("loading")}</div>
        ) : fines.length === 0 ? (
          <div className="p-8 text-center">
            <AlertCircle className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-400">{t("noFines")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="px-3 py-3 w-10"></th>
                  <th className="px-5 py-3 text-left">{t("member")}</th>
                  <th className="px-5 py-3 text-left">{t("book")}</th>
                  <th className="px-5 py-3 text-left">{t("dueDate")}</th>
                  <th className="px-5 py-3 text-left">{t("daysOverdue")}</th>
                  <th className="px-5 py-3 text-left">{t("fineAmount")}</th>
                  <th className="px-5 py-3 text-left">{tc("status")}</th>
                  <th className="px-5 py-3 text-left">{t("paymentMethod")}</th>
                  <th className="px-5 py-3 text-left">{tc("actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {fines.map((fine) => (
                  <tr key={fine.id} className={`hover:bg-gray-50 transition-colors ${selectedFineIds.has(fine.id) ? "bg-blue-50 hover:bg-blue-50" : ""}`}>
                    <td className="px-3 py-4 text-center">
                      {(fine.status === "PAID" || fine.status === "WAIVED") && (
                        <input
                          type="checkbox"
                          checked={selectedFineIds.has(fine.id)}
                          onChange={() => toggleFineSelection(fine)}
                          disabled={
                            !selectedFineIds.has(fine.id) &&
                            selectedMemberId !== null &&
                            fine.member.id !== selectedMemberId
                          }
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 accent-blue-700 cursor-pointer disabled:cursor-not-allowed disabled:opacity-30"
                        />
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-sm font-medium text-gray-900">{fine.member.name}</p>
                      <p className="text-xs text-gray-400 font-mono">{fine.member.memberId}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-sm text-gray-700">{fine.loan.book.title}</p>
                      <TypeBadge type={fine.type} />
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-600">{formatDate(fine.loan.dueDate)}</td>
                    <td className="px-5 py-4">
                      <span className={`text-sm font-semibold ${fine.daysLate > 0 ? "text-red-600" : "text-gray-400"}`}>
                        {fine.daysLate > 0 ? fine.daysLate : "—"}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-sm font-bold text-gray-900">${fine.amount.toFixed(2)}</span>
                    </td>
                    <td className="px-5 py-4">
                      {fine.status === "PAID" && (
                        <span className="flex items-center gap-1 text-xs font-medium text-green-600">
                          <CheckCircle className="w-3.5 h-3.5" /> {t("paid")}
                          {fine.paidAt && <span className="text-gray-400 ml-1">{formatDate(fine.paidAt)}</span>}
                        </span>
                      )}
                      {fine.status === "WAIVED" && (
                        <span className="flex items-center gap-1 text-xs font-medium text-gray-500">
                          <XCircle className="w-3.5 h-3.5" /> {t("waived")}
                        </span>
                      )}
                      {fine.status === "UNPAID" && (
                        <span className="flex items-center gap-1 text-xs font-medium text-red-500">
                          <AlertCircle className="w-3.5 h-3.5" /> {t("unpaid")}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-500">
                      {fine.paymentMethod && fine.paymentMethod !== "waived"
                        ? methodLabel(fine.paymentMethod)
                        : fine.status === "WAIVED" ? <span className="text-gray-400 italic">waived</span>
                        : "—"}
                      {fine.notes && (
                        <p className="text-xs text-gray-400 mt-0.5 max-w-[140px] truncate" title={fine.notes}>
                          {fine.notes}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {fine.status === "UNPAID" && (
                          <>
                            <button
                              onClick={() => { setPayTarget(fine); setPayMethod("cash"); setPayNotes(""); }}
                              className="text-xs bg-green-50 text-green-700 hover:bg-green-100 px-3 py-1.5 rounded-lg font-medium transition-colors">
                              {t("markAsPaid")}
                            </button>
                            <button
                              onClick={() => { setWaiveTarget(fine); setWaiveNotes(""); }}
                              className="text-xs bg-gray-50 text-gray-600 hover:bg-gray-100 px-3 py-1.5 rounded-lg font-medium transition-colors">
                              {t("waive")}
                            </button>
                          </>
                        )}
                        {(fine.status === "PAID" || fine.status === "WAIVED") && (
                          <button
                            onClick={() => setReceiptFine(fine)}
                            className="text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 px-3 py-1.5 rounded-lg font-medium flex items-center gap-1 transition-colors">
                            <Printer className="w-3 h-3" /> {tc("print")}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Pay modal ── */}
      {payTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={() => setPayTarget(null)}>
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-bold text-gray-900 mb-1">{t("markAsPaid")}</h2>
            <p className="text-sm text-gray-500 mb-4">
              <span className="font-medium text-gray-800">{payTarget.member.name}</span> — {payTarget.loan.book.title}
              <span className="ml-2 font-bold text-gray-900">${payTarget.amount.toFixed(2)}</span>
            </p>

            {/* Payment method */}
            <p className="text-xs font-semibold text-gray-600 mb-2">{t("paymentMethod")}</p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {PAYMENT_METHODS.map((m) => (
                <button key={m.value} onClick={() => setPayMethod(m.value)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                    payMethod === m.value
                      ? "bg-blue-900 border-blue-900 text-white"
                      : "border-gray-200 text-gray-700 hover:border-blue-300"
                  }`}>
                  {m.icon} {m.label}
                </button>
              ))}
            </div>

            {/* Notes */}
            <p className="text-xs font-semibold text-gray-600 mb-1">{t("notesOptional")}</p>
            <textarea
              rows={2}
              value={payNotes}
              onChange={(e) => setPayNotes(e.target.value)}
              placeholder={t("notesPlaceholder")}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none mb-4"
            />

            <div className="flex gap-2">
              <button onClick={() => setPayTarget(null)}
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50">
                {tc("close")}
              </button>
              <button onClick={handlePay} disabled={payLoading}
                className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-60 transition-colors">
                {payLoading ? tc("loading") : t("confirmPayment")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Waive modal ── */}
      {waiveTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={() => setWaiveTarget(null)}>
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-bold text-gray-900 mb-1">{t("waiveFine")}</h2>
            <p className="text-sm text-gray-500 mb-4">
              <span className="font-medium text-gray-800">{waiveTarget.member.name}</span> — {waiveTarget.loan.book.title}
              <span className="ml-2 font-bold text-gray-900">${waiveTarget.amount.toFixed(2)}</span>
            </p>
            <p className="text-xs font-semibold text-gray-600 mb-1">{t("waiveReason")}</p>
            <textarea
              rows={3}
              value={waiveNotes}
              onChange={(e) => setWaiveNotes(e.target.value)}
              placeholder={t("waiveReasonPlaceholder")}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none mb-4"
            />
            <div className="flex gap-2">
              <button onClick={() => setWaiveTarget(null)}
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50">
                {tc("close")}
              </button>
              <button onClick={handleWaive} disabled={waiveLoading}
                className="flex-1 px-4 py-2.5 bg-gray-700 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 disabled:opacity-60 transition-colors">
                {waiveLoading ? tc("loading") : t("confirmWaive")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Floating combined-receipt bar ── */}
      {selectedFines.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 bg-gray-900 text-white px-5 py-3 rounded-2xl shadow-2xl border border-gray-700 text-sm">
          <span className="font-semibold">
            {selectedFines.length} fine{selectedFines.length > 1 ? "s" : ""} selected
          </span>
          <span className="text-gray-400">·</span>
          <span className="font-bold text-green-400">${selectedTotal.toFixed(2)}</span>

          {selectedFines.length >= 2 && selectionIsUniform ? (
            <>
              <span className="text-gray-500 text-xs">Combined receipt:</span>
              <button
                onClick={() => handleCombinedPOSPrint(selectedFines, 58)}
                className="flex items-center gap-1 bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                <Printer className="w-3 h-3" /> 58mm
              </button>
              <button
                onClick={() => handleCombinedPOSPrint(selectedFines, 80)}
                className="flex items-center gap-1 bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                <Printer className="w-3 h-3" /> 80mm
              </button>
            </>
          ) : selectedFines.length === 1 ? (
            <span className="text-gray-400 text-xs italic">Select more from same member for combined receipt</span>
          ) : (
            <span className="text-amber-400 text-xs italic">Select fines from one member only</span>
          )}

          <button
            onClick={() => setSelectedFineIds(new Set())}
            className="ml-1 text-gray-400 hover:text-white transition-colors text-xs">
            ✕ Clear
          </button>
        </div>
      )}

      {/* ── Receipt modal ── */}
      {receiptFine && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={() => setReceiptFine(null)}>
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>

            {/* Printable area */}
            <div ref={printRef}>
              <h1 style={{ fontSize: 18, fontWeight: "bold", marginBottom: 4 }}>{t("receipt")}</h1>
              <p className="sub" style={{ color: "#6b7280", fontSize: 12, marginBottom: 24 }}>{t("fineHistory")}</p>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  <tr><td style={{ width: 140, color: "#6b7280", paddingBottom: 6 }}>{t("member")}</td><td style={{ fontWeight: 600 }}>{receiptFine.member.name} ({receiptFine.member.memberId})</td></tr>
                  <tr><td style={{ color: "#6b7280", paddingBottom: 6 }}>{t("book")}</td><td>{receiptFine.loan.book.title}</td></tr>
                  <tr><td style={{ color: "#6b7280", paddingBottom: 6 }}>{t("dueDate")}</td><td>{formatDate(receiptFine.loan.dueDate)}</td></tr>
                  {receiptFine.daysLate > 0 && (
                    <tr><td style={{ color: "#6b7280", paddingBottom: 6 }}>{t("daysOverdue")}</td><td>{receiptFine.daysLate}</td></tr>
                  )}
                  <tr>
                    <td style={{ color: "#6b7280", paddingBottom: 6 }}>{t("fineAmount")}</td>
                    <td style={{ fontWeight: "bold", fontSize: 20 }}>${receiptFine.amount.toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td style={{ color: "#6b7280", paddingBottom: 6 }}>{tc("status")}</td>
                    <td>
                      <span style={{ background: receiptFine.status === "PAID" ? "#dcfce7" : "#f3f4f6", color: receiptFine.status === "PAID" ? "#166534" : "#374151", padding: "2px 10px", borderRadius: 20, fontWeight: 600, fontSize: 12 }}>
                        {receiptFine.status === "PAID" ? t("paid") : t("waived")}
                      </span>
                    </td>
                  </tr>
                  {receiptFine.paymentMethod && receiptFine.paymentMethod !== "waived" && (
                    <tr><td style={{ color: "#6b7280", paddingBottom: 6 }}>{t("paymentMethod")}</td><td>{methodLabel(receiptFine.paymentMethod)}</td></tr>
                  )}
                  {receiptFine.paidAt && (
                    <tr><td style={{ color: "#6b7280", paddingBottom: 6 }}>{t("paidAt")}</td><td>{formatDate(receiptFine.paidAt)}</td></tr>
                  )}
                  {receiptFine.notes && (
                    <tr><td style={{ color: "#6b7280", paddingBottom: 6 }}>{t("notes")}</td><td style={{ fontStyle: "italic" }}>{receiptFine.notes}</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-2 mt-5">
              {/* Row 1: Close + A4 print */}
              <div className="flex gap-2">
                <button onClick={() => setReceiptFine(null)}
                  className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50">
                  {tc("close")}
                </button>
                <button onClick={handlePrint}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-900 text-white rounded-xl text-sm font-semibold hover:bg-blue-800 transition-colors">
                  <Printer className="w-4 h-4" /> A4
                </button>
              </div>
              {/* Row 2: POS thermal sizes */}
              <div className="flex gap-2">
                <div className="flex-1 flex items-center justify-center gap-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                  <Printer className="w-3 h-3" /> POS Thermal
                </div>
                <button
                  onClick={() => receiptFine && handlePOSPrint(receiptFine, 58)}
                  className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-gray-800 text-white rounded-xl text-sm font-semibold hover:bg-gray-700 transition-colors">
                  58mm
                </button>
                <button
                  onClick={() => receiptFine && handlePOSPrint(receiptFine, 80)}
                  className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-gray-800 text-white rounded-xl text-sm font-semibold hover:bg-gray-700 transition-colors">
                  80mm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
