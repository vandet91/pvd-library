"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import {
  ShoppingCart, TrendingUp, Loader2, RefreshCw,
  BookOpen, Inbox, AlertCircle, ChevronRight, Star,
} from "lucide-react";

/* ── Types ──────────────────────────────────────────────────────────────── */
interface AcqBook {
  id: string; title: string; isbn: string | null;
  availableCopies: number; totalCopies: number; price: number | null;
  author:   { name: string } | null;
  category: { name: string } | null;
  pendingReservations?: number;
  recentLoans?: number;
}

interface BookRequest {
  id: string; title: string; author: string | null; isbn: string | null;
  notes: string | null; createdAt: string;
  member: { name: string; memberType: string };
}

interface AcquisitionData {
  highDemand:      AcqBook[];
  understocked:    AcqBook[];
  pendingRequests: BookRequest[];
}

type Tab = "demand" | "understocked" | "requests";

export default function AcquisitionPage() {
  const locale = useLocale();

  const [data,    setData]    = useState<AcquisitionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState<Tab>("demand");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch("/api/books/acquisition");
      setData(await res.json());
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const highDemand      = data?.highDemand      ?? [];
  const understocked    = data?.understocked    ?? [];
  const pendingRequests = data?.pendingRequests ?? [];

  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ShoppingCart className="w-6 h-6 text-green-600" />
            Acquisition Intelligence
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Data-driven suggestions on what to acquire or order more copies of
          </p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* ── Summary cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        {([
          { key: "demand",       label: "High Demand",      count: highDemand.length,      color: "rose",   icon: AlertCircle },
          { key: "understocked", label: "Understocked",     count: understocked.length,    color: "amber",  icon: TrendingUp  },
          { key: "requests",     label: "Member Requests",  count: pendingRequests.length, color: "blue",   icon: Inbox       },
        ] as const).map(({ key, label, count, color, icon: Icon }) => (
          <div
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-xl border p-4 cursor-pointer transition-colors ${
              tab === key
                ? `border-${color}-400 bg-${color}-50`
                : "border-gray-100 bg-white hover:border-gray-200"
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl bg-${color}-100 flex items-center justify-center`}>
                <Icon className={`w-5 h-5 text-${color}-600`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{loading ? "—" : count}</p>
                <p className="text-xs text-gray-500 font-medium">{label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────── */}
      <div className="flex gap-1 border-b border-gray-200">
        {([
          { key: "demand",       label: `High Demand (${highDemand.length})`,           icon: AlertCircle },
          { key: "understocked", label: `Understocked (${understocked.length})`,         icon: TrendingUp  },
          { key: "requests",     label: `Member Requests (${pendingRequests.length})`,   icon: Inbox       },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === key
                ? "border-green-600 text-green-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Content ────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-gray-400 flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin" /> Loading…
          </div>
        ) : (

          /* ── High Demand Tab ── */
          tab === "demand" && (
            highDemand.length === 0 ? (
              <div className="p-12 text-center">
                <AlertCircle className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-gray-500">No high-demand titles right now.</p>
              </div>
            ) : (
              <>
                <div className="px-4 py-3 bg-rose-50 border-b border-rose-100 text-sm text-rose-800">
                  Books with active reservations but <strong>zero available copies</strong> — these are the most urgent acquisitions.
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 uppercase tracking-wide bg-gray-50">
                      <th className="px-4 py-2.5 text-left">Title / Author</th>
                      <th className="px-4 py-2.5 text-center w-28">Waiting</th>
                      <th className="px-4 py-2.5 text-center w-28">Copies</th>
                      <th className="px-4 py-2.5 text-center w-24">Price</th>
                      <th className="px-4 py-2.5 text-right w-20">View</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {highDemand.map((b) => (
                      <tr key={b.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-800">{b.title}</p>
                          {b.author && <p className="text-xs text-gray-400">{b.author.name}</p>}
                          {b.isbn && <p className="text-xs font-mono text-gray-300">ISBN {b.isbn}</p>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-rose-100 text-rose-700 rounded-full font-bold">
                            {b.pendingReservations} waiting
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-sm">
                          <span className={b.availableCopies === 0 ? "text-red-600 font-bold" : "text-gray-700"}>
                            {b.availableCopies}
                          </span>
                          <span className="text-gray-300"> / {b.totalCopies}</span>
                        </td>
                        <td className="px-4 py-3 text-center text-sm text-gray-600">
                          {b.price ? `$${b.price.toFixed(2)}` : "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link href={`/${locale}/admin/books/${b.id}`}
                            className="inline-flex items-center gap-1 text-xs px-2.5 py-1 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                            View <ChevronRight className="w-3 h-3" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )
          )
        )}

        {/* ── Understocked Tab ── */}
        {!loading && tab === "understocked" && (
          understocked.length === 0 ? (
            <div className="p-12 text-center">
              <BookOpen className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-500">No understocked titles detected.</p>
            </div>
          ) : (
            <>
              <div className="px-4 py-3 bg-amber-50 border-b border-amber-100 text-sm text-amber-800">
                Books borrowed <strong>2+ times in the last 30 days</strong> but with fewer than 3 total copies — worth ordering more.
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 uppercase tracking-wide bg-gray-50">
                    <th className="px-4 py-2.5 text-left">Title / Author</th>
                    <th className="px-4 py-2.5 text-center w-32">Recent Loans</th>
                    <th className="px-4 py-2.5 text-center w-28">Copies</th>
                    <th className="px-4 py-2.5 text-center w-24">Price</th>
                    <th className="px-4 py-2.5 text-right w-20">View</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {understocked.map((b) => (
                    <tr key={b.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800">{b.title}</p>
                        {b.author && <p className="text-xs text-gray-400">{b.author.name}</p>}
                        {b.category && <p className="text-xs text-gray-300">{b.category.name}</p>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded-full font-bold">
                          <Star className="w-3 h-3" /> {b.recentLoans} loans
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-sm">
                        <span className="text-gray-700">{b.availableCopies}</span>
                        <span className="text-gray-300"> / {b.totalCopies}</span>
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-gray-600">
                        {b.price ? `$${b.price.toFixed(2)}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/${locale}/admin/books/${b.id}`}
                          className="inline-flex items-center gap-1 text-xs px-2.5 py-1 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                          View <ChevronRight className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )
        )}

        {/* ── Member Requests Tab ── */}
        {!loading && tab === "requests" && (
          pendingRequests.length === 0 ? (
            <div className="p-12 text-center">
              <Inbox className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-500">No pending purchase requests from members.</p>
            </div>
          ) : (
            <>
              <div className="px-4 py-3 bg-blue-50 border-b border-blue-100 text-sm text-blue-800">
                Books members have formally requested for the library to acquire.
                <Link href={`/${locale}/admin/book-requests`} className="ml-2 underline font-medium">
                  Manage all requests →
                </Link>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 uppercase tracking-wide bg-gray-50">
                    <th className="px-4 py-2.5 text-left">Requested Title</th>
                    <th className="px-4 py-2.5 text-left w-32">Requested by</th>
                    <th className="px-4 py-2.5 text-left w-32">ISBN</th>
                    <th className="px-4 py-2.5 text-left w-28">Date</th>
                    <th className="px-4 py-2.5 text-right w-20">View</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {pendingRequests.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800">{r.title}</p>
                        {r.author && <p className="text-xs text-gray-400">by {r.author}</p>}
                        {r.notes && <p className="text-xs text-gray-300 truncate max-w-xs">{r.notes}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-gray-700">{r.member.name}</p>
                        <p className="text-xs text-gray-400 capitalize">{r.member.memberType.toLowerCase()}</p>
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-gray-500">
                        {r.isbn ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {new Date(r.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/${locale}/admin/book-requests`}
                          className="inline-flex items-center gap-1 text-xs px-2.5 py-1 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                          View <ChevronRight className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )
        )}
      </div>
    </div>
  );
}
