"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  ShoppingCart, Clock, CheckCircle, XCircle, BookOpen,
  Search, Filter, MapPin, Package, PackageCheck, Loader2,
} from "lucide-react";

interface Reservation {
  id: string;
  status: string;
  createdAt: string;
  expiresAt?: string | null;
  note?: string | null;
  holdShelf?: string | null;
  member: { id: string; name: string; memberId: string };
  book: {
    id: string; title: string; isbn: string | null;
    availableCopies: number; location?: string | null;
    shelfLocation?: { name: string } | null;
  };
  copy?: { id: string; copyNumber: number; barcode: string | null } | null;
}

interface AvailableCopy {
  id: string;
  copyNumber: number;
  barcode: string | null;
  condition: string;
  status: string;
}

const STATUS_OPTIONS = ["ALL", "PENDING", "APPROVED", "READY", "CANCELLED", "FULFILLED", "EXPIRED"];

const STATUS_CLS: Record<string, string> = {
  PENDING:   "bg-yellow-50 text-yellow-700 border-yellow-200",
  APPROVED:  "bg-green-50  text-green-700  border-green-200",
  READY:     "bg-purple-50 text-purple-700 border-purple-200",
  CANCELLED: "bg-gray-100  text-gray-500   border-gray-200",
  FULFILLED: "bg-blue-50   text-blue-700   border-blue-200",
  EXPIRED:   "bg-red-50    text-red-500    border-red-200",
};

export default function AdminReservationsPage() {
  const t  = useTranslations("reservations");
  const tc = useTranslations("common");

  const STATUS_LABELS: Record<string, string> = {
    PENDING:   t("statusPending"),
    APPROVED:  t("statusApproved"),
    READY:     t("statusReady"),
    CANCELLED: t("statusCancelled"),
    FULFILLED: t("statusFulfilled"),
    EXPIRED:   t("statusExpired"),
  };

  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [query,        setQuery]        = useState("");
  const [updating,     setUpdating]     = useState<string | null>(null);

  // Hold shelf modal state
  const [holdModal,        setHoldModal]        = useState<Reservation | null>(null);
  const [holdLocation,     setHoldLocation]     = useState(t("defaultHoldShelf"));
  const [availableCopies,  setAvailableCopies]  = useState<AvailableCopy[]>([]);
  const [selectedCopyId,   setSelectedCopyId]   = useState<string>("");
  const [copiesLoading,    setCopiesLoading]    = useState(false);
  const [readyError,       setReadyError]       = useState<string | null>(null);

  const fetchReservations = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter !== "ALL") params.set("status", statusFilter);
    const r = await fetch(`/api/reservations?${params}`);
    if (r.ok) {
      const data = await r.json().catch(() => []);
      setReservations(Array.isArray(data) ? data : []);
    } else {
      setReservations([]);
    }
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { fetchReservations(); }, [fetchReservations]);

  async function updateStatus(id: string, status: string, extra?: Record<string, string>): Promise<{ ok: boolean; error?: string }> {
    setUpdating(id);
    const res = await fetch(`/api/reservations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, ...extra }),
    });
    setUpdating(null);
    fetchReservations();
    // Tell the sidebar to refresh its badge counts immediately
    window.dispatchEvent(new CustomEvent("alertsChanged"));
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: data.error ?? "Update failed" };
    }
    return { ok: true };
  }

  // Fetch available copies whenever the Mark-Ready modal opens
  useEffect(() => {
    if (!holdModal) return;
    setCopiesLoading(true);
    setReadyError(null);
    setSelectedCopyId("");
    fetch(`/api/books/${holdModal.book.id}/copies`)
      .then((r) => r.json())
      .then((all: AvailableCopy[]) => {
        // Only pickable: on the shelf AND in a usable physical condition
        const unusable = new Set(["LOST", "WITHDRAWN", "ARCHIVED"]);
        const avail = (Array.isArray(all) ? all : []).filter(
          (c) => c.status === "AVAILABLE" && !unusable.has(c.condition),
        );
        setAvailableCopies(avail);
        if (avail.length > 0) setSelectedCopyId(avail[0].id); // default = first available
      })
      .catch(() => setAvailableCopies([]))
      .finally(() => setCopiesLoading(false));
  }, [holdModal]);

  async function markReady() {
    if (!holdModal) return;
    if (!selectedCopyId) {
      setReadyError(t("pickCopyError"));
      return;
    }
    setReadyError(null);
    const r = await updateStatus(holdModal.id, "READY", {
      holdShelf: holdLocation,
      copyId:    selectedCopyId,
    });
    if (!r.ok) {
      setReadyError(r.error ?? t("updateFailed"));
      return;
    }
    setHoldModal(null);
  }

  const filtered = reservations.filter((r) =>
    !query ||
    r.member.name.toLowerCase().includes(query.toLowerCase()) ||
    r.book.title.toLowerCase().includes(query.toLowerCase()) ||
    r.member.memberId.toLowerCase().includes(query.toLowerCase())
  );

  const counts = {
    PENDING:  reservations.filter((r) => r.status === "PENDING").length,
    APPROVED: reservations.filter((r) => r.status === "APPROVED").length,
    READY:    reservations.filter((r) => r.status === "READY").length,
  };

  return (
    <div className="space-y-5">

      {/* ── Hold Shelf Modal ── */}
      {holdModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setHoldModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                <Package className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">{t("markReadyTitle")}</h2>
                <p className="text-xs text-gray-500">{t("markReadyDesc")}</p>
              </div>
            </div>

            {/* Book info */}
            <div className="bg-gray-50 rounded-xl p-4 mb-4 space-y-1.5 text-sm">
              <p className="font-medium text-gray-900">{holdModal.book.title}</p>
              <div className="flex items-center gap-1.5 text-gray-500">
                <MapPin className="w-3.5 h-3.5 text-blue-500" />
                <span>{t("currentShelf")} </span>
                <span className="font-mono font-semibold text-blue-700">
                  {holdModal.book.shelfLocation?.name ?? holdModal.book.location ?? t("notSpecified")}
                </span>
              </div>
              <p className="text-gray-500">{t("memberLabel")} <span className="font-medium text-gray-700">{holdModal.member.name}</span>
                <span className="ml-1 font-mono text-xs text-gray-400">({holdModal.member.memberId})</span>
              </p>
            </div>

            {/* Copy picker — librarian pulls a specific physical copy from the shelf */}
            <label htmlFor="res-copy-picker" className="block text-sm font-medium text-gray-700 mb-1.5">
              {t("whichCopy")}
            </label>
            {copiesLoading ? (
              <div className="flex items-center gap-2 text-xs text-gray-400 px-3 py-2 mb-4">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t("loadingCopies")}
              </div>
            ) : availableCopies.length === 0 ? (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-lg mb-4">
                {t("noCopiesAvailable")} {t("cannotMarkReady")}
              </div>
            ) : (
              <select
                id="res-copy-picker"
                value={selectedCopyId}
                onChange={(e) => setSelectedCopyId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 mb-4"
              >
                {availableCopies.map((c) => (
                  <option key={c.id} value={c.id}>
                    Copy #{c.copyNumber} · {c.barcode ?? t("noBarcode")} · {c.condition}
                  </option>
                ))}
              </select>
            )}

            {/* Hold shelf input */}
            <label htmlFor="res-hold-location" className="block text-sm font-medium text-gray-700 mb-1.5">
              {t("placeBookAt")}
            </label>
            <input
              id="res-hold-location"
              type="text"
              value={holdLocation}
              onChange={(e) => setHoldLocation(e.target.value)}
              placeholder={t("holdPlaceholder")}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 mb-4"
            />

            {readyError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-lg mb-4">
                ⚠ {readyError}
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={() => setHoldModal(null)}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                {tc("cancel")}
              </button>
              <button onClick={markReady}
                disabled={!holdLocation.trim() || !selectedCopyId || availableCopies.length === 0 || updating === holdModal.id}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50">
                <Package className="w-4 h-4" />
                {t("confirmMarkReady")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Page Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t("subtitle")}</p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          {counts.PENDING > 0 && (
            <span className="flex items-center gap-1.5 bg-yellow-50 text-yellow-700 border border-yellow-200 px-3 py-1.5 rounded-full text-sm font-medium">
              <Clock className="w-3.5 h-3.5" />{counts.PENDING} {t("pending")}
            </span>
          )}
          {counts.APPROVED > 0 && (
            <span className="flex items-center gap-1.5 bg-green-50 text-green-700 border border-green-200 px-3 py-1.5 rounded-full text-sm font-medium">
              <CheckCircle className="w-3.5 h-3.5" />{counts.APPROVED} {t("toPull")}
            </span>
          )}
          {counts.READY > 0 && (
            <span className="flex items-center gap-1.5 bg-purple-50 text-purple-700 border border-purple-200 px-3 py-1.5 rounded-full text-sm font-medium">
              <Package className="w-3.5 h-3.5" />{counts.READY} {t("awaitingPickup")}
            </span>
          )}
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="flex items-center gap-1.5">
          <Filter className="w-4 h-4 text-gray-400" />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s === "ALL" ? t("allStatus") : STATUS_LABELS[s] ?? s}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">{tc("loading")}</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center">
            <ShoppingCart className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-400">{t("noReservationsFound")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3 text-left">{t("colMember")}</th>
                  <th className="px-6 py-3 text-left">{t("colBookShelf")}</th>
                  <th className="px-6 py-3 text-left">{t("colStatusHold")}</th>
                  <th className="px-6 py-3 text-left">{t("colRequested")}</th>
                  <th className="px-6 py-3 text-left">{tc("actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((r) => {
                  const statusCls = STATUS_CLS[r.status] ?? "bg-gray-100 text-gray-500 border-gray-200";
                  const statusLabel = STATUS_LABELS[r.status] ?? r.status;
                  return (
                    <tr key={r.id} className="hover:bg-gray-50 transition-colors">

                      {/* Member */}
                      <td className="px-6 py-4">
                        <p className="font-medium text-gray-900 text-sm">{r.member.name}</p>
                        <p className="text-xs text-gray-400 font-mono">{r.member.memberId}</p>
                      </td>

                      {/* Book + shelf location */}
                      <td className="px-6 py-4">
                        <div className="flex items-start gap-2">
                          <div className="w-8 h-10 bg-blue-50 rounded flex items-center justify-center flex-shrink-0 mt-0.5">
                            <BookOpen className="w-4 h-4 text-blue-400" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900 max-w-[180px] truncate">{r.book.title}</p>
                            {r.book.isbn && (
                              <p className="text-xs text-gray-400 font-mono">{r.book.isbn}</p>
                            )}
                            {/* Shelf location — highlighted when APPROVED (needs to be pulled) */}
                            {(r.book.shelfLocation?.name ?? r.book.location) && (
                              <div className={`flex items-center gap-1 mt-0.5 text-xs font-mono font-semibold px-1.5 py-0.5 rounded w-fit ${
                                r.status === "APPROVED"
                                  ? "bg-orange-100 text-orange-700"
                                  : "bg-gray-100 text-gray-500"
                              }`}>
                                <MapPin className="w-3 h-3" />
                                {r.book.shelfLocation?.name ?? r.book.location}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Status + hold shelf */}
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center text-xs px-2 py-1 rounded-full border font-medium ${statusCls}`}>
                          {statusLabel}
                        </span>
                        {/* Show hold shelf + which copy when READY */}
                        {r.status === "READY" && r.holdShelf && (
                          <div className="flex items-center gap-1 mt-1.5 text-xs text-purple-700 bg-purple-50 border border-purple-200 px-2 py-1 rounded-lg w-fit font-medium">
                            <Package className="w-3 h-3" />
                            {r.holdShelf}
                          </div>
                        )}
                        {r.status === "READY" && r.copy && (
                          <div className="mt-1 text-[11px] text-purple-700 font-mono flex items-center gap-1 flex-wrap">
                            <span className="px-1.5 py-0.5 bg-purple-100 rounded font-bold uppercase tracking-wide text-[9px]">
                              Copy #{r.copy.copyNumber}
                            </span>
                            {r.copy.barcode && <span>{r.copy.barcode}</span>}
                          </div>
                        )}
                        {r.note && (
                          <p className="text-xs text-gray-400 mt-1 max-w-[140px] truncate" title={r.note}>
                            {t("notePrefix")} {r.note}
                          </p>
                        )}
                      </td>

                      {/* Date / expiry */}
                      <td className="px-6 py-4 text-xs text-gray-400">
                        <div>{new Date(r.createdAt).toLocaleDateString()}</div>
                        {r.expiresAt && r.status === "PENDING" && (() => {
                          const daysLeft = Math.ceil((new Date(r.expiresAt).getTime() - Date.now()) / 86400000);
                          return (
                            <div className={`mt-0.5 ${daysLeft <= 2 ? "text-red-400 font-medium" : "text-gray-400"}`}>
                              {t("expPrefix")} {daysLeft > 0 ? `${daysLeft}d` : t("today")}
                            </div>
                          );
                        })()}
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4">
                        {r.status === "PENDING" && (
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => updateStatus(r.id, "APPROVED")} disabled={updating === r.id}
                              className="flex items-center gap-1 text-xs px-2.5 py-1 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50 border border-green-200">
                              <CheckCircle className="w-3.5 h-3.5" />{t("approve")}
                            </button>
                            <button onClick={() => updateStatus(r.id, "CANCELLED")} disabled={updating === r.id}
                              className="flex items-center gap-1 text-xs px-2.5 py-1 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50">
                              <XCircle className="w-3.5 h-3.5" />{tc("cancel")}
                            </button>
                          </div>
                        )}

                        {/* APPROVED → pull book from shelf */}
                        {r.status === "APPROVED" && (
                          <button
                            onClick={() => { setHoldLocation(t("defaultHoldShelf")); setHoldModal(r); }}
                            disabled={updating === r.id}
                            className="flex items-center gap-1 text-xs px-2.5 py-1 bg-orange-50 text-orange-700 rounded-lg hover:bg-orange-100 transition-colors disabled:opacity-50 border border-orange-200">
                            <Package className="w-3.5 h-3.5" />{t("pullHold")}
                          </button>
                        )}

                        {/* READY → member arrived, check out */}
                        {r.status === "READY" && (
                          <button
                            onClick={() => updateStatus(r.id, "FULFILLED")}
                            disabled={updating === r.id}
                            className="flex items-center gap-1 text-xs px-2.5 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
                            <PackageCheck className="w-3.5 h-3.5" />{t("checkOut")}
                          </button>
                        )}

                        {(r.status === "CANCELLED" || r.status === "FULFILLED" || r.status === "EXPIRED") && (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
