"use client";

import { useState, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import {
  Inbox, BookMarked,
  Clock, CheckCircle2, XCircle, PackageCheck,
  AlertCircle, Plus, Send, Loader2, BookOpen,
} from "lucide-react";
import MemberHeader from "@/components/shared/MemberHeader";
import RestrictionBanner from "@/components/shared/RestrictionBanner";
import { useLibraryName } from "@/context/library-name";

interface BookRequest {
  id:        string;
  title:     string;
  author:    string | null;
  isbn:      string | null;
  notes:     string | null;
  status:    "PENDING" | "APPROVED" | "REJECTED" | "FULFILLED";
  adminNote: string | null;
  createdAt: string;
}

const EMPTY_FORM = { title: "", author: "", isbn: "", notes: "" };

export default function RequestsPage() {
  const locale = useLocale();
  const t  = useTranslations("requests");
  const to = useTranslations("opac");
  const tc = useTranslations("common");
  const libraryName = useLibraryName();

  const [requests,   setRequests]   = useState<BookRequest[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [showForm,   setShowForm]   = useState(false);
  const [form,       setForm]       = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [toast,      setToast]      = useState<{ msg: string; ok: boolean } | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/book-requests");
    if (res.status === 401) { setError(t("logInPrompt")); setLoading(false); return; }
    if (!res.ok)            { setError(t("failedToLoad")); setLoading(false); return; }
    const data = await res.json().catch(() => []);
    setRequests(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSubmitting(true);
    const res = await fetch("/api/book-requests", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(form),
    });
    setSubmitting(false);
    if (res.ok) {
      showToast(t("successToast"));
      setForm(EMPTY_FORM);
      setShowForm(false);
      load();
    } else {
      const data = await res.json().catch(() => ({}));
      showToast(data.error ?? t("errorToast"), false);
    }
  }

  /* Status metadata — uses translation keys */
  const STATUS_META: Record<string, { label: string; icon: React.ReactNode; cls: string; desc: string }> = {
    PENDING:   {
      label: t("statusPending"),
      icon:  <Clock className="w-3.5 h-3.5" />,
      cls:   "bg-amber-50 text-amber-700 border border-amber-200",
      desc:  t("statusPendingDesc"),
    },
    APPROVED:  {
      label: t("statusApproved"),
      icon:  <CheckCircle2 className="w-3.5 h-3.5" />,
      cls:   "bg-blue-50 text-blue-700 border border-blue-200",
      desc:  t("statusApprovedDesc"),
    },
    FULFILLED: {
      label: t("statusFulfilled"),
      icon:  <PackageCheck className="w-3.5 h-3.5" />,
      cls:   "bg-green-50 text-green-700 border border-green-200",
      desc:  t("statusFulfilledDesc"),
    },
    REJECTED:  {
      label: t("statusRejected"),
      icon:  <XCircle className="w-3.5 h-3.5" />,
      cls:   "bg-red-50 text-red-600 border border-red-200",
      desc:  t("statusRejectedDesc"),
    },
  };

  const active = requests.filter((r) => r.status === "PENDING" || r.status === "APPROVED");
  const done   = requests.filter((r) => r.status === "FULFILLED" || r.status === "REJECTED");

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Sticky top nav ── */}
      <nav className="sticky top-0 z-30 bg-[#0f1e4a]/95 backdrop-blur border-b border-white/10">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-1">
            <Link href={`/${locale}/discover`} className="flex items-center gap-2 pr-3 mr-2 border-r border-white/20">
              <div className="w-7 h-7 bg-blue-500/30 rounded-lg flex items-center justify-center flex-shrink-0">
                <BookOpen className="w-4 h-4 text-blue-300" />
              </div>
              <span className="text-sm font-bold text-white hidden sm:block leading-none">{libraryName}</span>
            </Link>
            <Link href={`/${locale}/discover`} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white/60 hover:text-white hover:bg-white/10 transition-colors">
              <BookOpen className="w-3.5 h-3.5" /><span className="hidden sm:inline">{to("discover")}</span>
            </Link>
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-blue-500/25 ring-1 ring-blue-400/30 cursor-default">
              <Inbox className="w-3.5 h-3.5 text-blue-300" /><span className="hidden sm:inline">{t("title")}</span>
            </span>
            <Link href={`/${locale}/ebooks`} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white/60 hover:text-white hover:bg-white/10 transition-colors">
              <BookMarked className="w-3.5 h-3.5" /><span className="hidden sm:inline">{to("eLibrary")}</span>
            </Link>
          </div>
          <MemberHeader theme="dark" />
        </div>
      </nav>

      <RestrictionBanner />

      {/* ── Page header ── */}
      <header className="bg-gradient-to-br from-blue-900 via-blue-900 to-indigo-900 text-white px-4 py-4">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/15 rounded-xl flex items-center justify-center flex-shrink-0">
                <Inbox className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-lg font-bold leading-tight">{t("title")}</h1>
                <p className="text-white/60 text-sm">{t("subtitle")}</p>
              </div>
            </div>
            <button
              onClick={() => setShowForm((v) => !v)}
              className="flex items-center gap-2 bg-white/20 hover:bg-white/30 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
            >
              <Plus className="w-4 h-4" />
              {t("newRequest")}
            </button>
          </div>
          {/* Summary chips */}
          {!loading && !error && requests.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {active.length > 0 && (
                <span className="bg-white/15 text-white text-xs px-3 py-1 rounded-full font-medium">
                  {active.length} {t("inProgressChip")}
                </span>
              )}
              {done.filter((r) => r.status === "FULFILLED").length > 0 && (
                <span className="bg-green-500/70 text-white text-xs px-3 py-1 rounded-full font-medium">
                  {done.filter((r) => r.status === "FULFILLED").length} {t("fulfilledChip")}
                </span>
              )}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">

        {/* ── New Request Form ── */}
        {showForm && (
          <div className="bg-white rounded-xl border border-blue-100 shadow-sm p-5">
            <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Send className="w-4 h-4 text-blue-600" />
              {t("requestBook")}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label htmlFor="member-req-title" className="block text-xs font-medium text-gray-600 mb-1">
                  {t("bookTitleRequired")}
                </label>
                <input
                  id="member-req-title"
                  type="text"
                  required
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder={t("bookTitlePlaceholder")}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="member-req-author" className="block text-xs font-medium text-gray-600 mb-1">{t("author")}</label>
                  <input
                    id="member-req-author"
                    type="text"
                    value={form.author}
                    onChange={(e) => setForm((f) => ({ ...f, author: e.target.value }))}
                    placeholder={t("authorPlaceholder")}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label htmlFor="member-req-isbn" className="block text-xs font-medium text-gray-600 mb-1">{t("isbn")}</label>
                  <input
                    id="member-req-isbn"
                    type="text"
                    value={form.isbn}
                    onChange={(e) => setForm((f) => ({ ...f, isbn: e.target.value }))}
                    placeholder={t("isbnPlaceholder")}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="member-req-notes" className="block text-xs font-medium text-gray-600 mb-1">{t("notes")}</label>
                <textarea
                  id="member-req-notes"
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder={t("notesPlaceholder")}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={submitting || !form.title.trim()}
                  className="flex items-center gap-2 bg-blue-900 text-white text-sm font-medium px-5 py-2 rounded-xl hover:bg-blue-800 disabled:opacity-50 transition-colors"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {submitting ? t("submitting") : t("submitBtn")}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setForm(EMPTY_FORM); }}
                  className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2 rounded-xl hover:bg-gray-100 transition-colors"
                >
                  {t("cancel")}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── Content ── */}
        {loading ? (
          <div className="text-center text-gray-400 py-16">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
          </div>
        ) : error ? (
          <div className="text-center py-16">
            <Inbox className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 mb-4">{error}</p>
            <Link href={`/${locale}/member/login`}
              className="inline-flex items-center gap-2 bg-blue-900 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-800 transition-colors">
              {t("logIn")}
            </Link>
          </div>
        ) : requests.length === 0 ? (
          <div className="text-center py-16">
            <Inbox className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 mb-1">{t("noRequestsYet")}</p>
            <p className="text-gray-400 text-sm mb-5">{t("noRequestsDesc")}</p>
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 bg-blue-900 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-800 transition-colors"
            >
              <Plus className="w-4 h-4" /> {t("submitFirst")}
            </button>
          </div>
        ) : (
          <div className="space-y-6">

            {active.length > 0 && (
              <div>
                <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2 text-sm">
                  <Clock className="w-4 h-4 text-amber-500" />
                  {t("inProgress")}
                  <span className="ml-auto font-normal text-gray-400">{active.length}</span>
                </h2>
                <div className="space-y-3">
                  {active.map((req) => (
                    <RequestCard key={req.id} req={req} t={t} statusMeta={STATUS_META} />
                  ))}
                </div>
              </div>
            )}

            {done.length > 0 && (
              <div>
                <h2 className="font-semibold text-gray-700 mb-3 flex items-center gap-2 text-sm">
                  <BookOpen className="w-4 h-4 text-gray-400" />
                  {t("completed")}
                  <span className="ml-auto font-normal text-gray-400">{done.length}</span>
                </h2>
                <div className="space-y-2">
                  {done.map((req) => (
                    <RequestCard key={req.id} req={req} t={t} statusMeta={STATUS_META} dimmed />
                  ))}
                </div>
              </div>
            )}

          </div>
        )}
      </main>

      {/* ── Toast ── */}
      {toast && (
        <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-xl shadow-lg text-sm font-medium z-50 max-w-sm
          ${toast.ok ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

type TFn = ReturnType<typeof useTranslations>;
type StatusMeta = Record<string, { label: string; icon: React.ReactNode; cls: string; desc: string }>;

function RequestCard({
  req, dimmed = false, t, statusMeta,
}: {
  req: BookRequest;
  dimmed?: boolean;
  t: TFn;
  statusMeta: StatusMeta;
}) {
  const meta = statusMeta[req.status];
  return (
    <div className={`bg-white rounded-xl border shadow-sm p-4 ${
      req.status === "FULFILLED" ? "border-green-100" :
      req.status === "REJECTED"  ? "border-red-100"   :
      req.status === "APPROVED"  ? "border-blue-100"  : "border-gray-100"
    } ${dimmed ? "opacity-70" : ""}`}>
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
          req.status === "FULFILLED" ? "bg-green-50" :
          req.status === "REJECTED"  ? "bg-red-50"   :
          req.status === "APPROVED"  ? "bg-blue-50"  : "bg-amber-50"
        }`}>
          {meta.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-gray-900 text-sm leading-snug">{req.title}</p>
            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${meta.cls}`}>
              {meta.icon} {meta.label}
            </span>
          </div>
          {req.author && <p className="text-xs text-gray-500 mt-0.5">{req.author}</p>}
          {req.isbn   && <p className="text-xs text-gray-400 font-mono mt-0.5">{req.isbn}</p>}

          <p className="text-xs text-gray-400 mt-1.5">{meta.desc}</p>

          {/* Librarian note */}
          {req.adminNote && (
            <div className={`mt-2 flex items-start gap-1.5 text-xs px-2.5 py-2 rounded-lg ${
              req.status === "REJECTED"
                ? "bg-red-50 text-red-700 border border-red-100"
                : "bg-blue-50 text-blue-700 border border-blue-100"
            }`}>
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span><strong>{t("librarianNote")}:</strong> {req.adminNote}</span>
            </div>
          )}

          {/* Member's original notes */}
          {req.notes && (
            <p className="text-xs text-gray-400 italic mt-1.5 line-clamp-2">
              {t("yourNote", { note: req.notes })}
            </p>
          )}

          <p className="text-xs text-gray-300 mt-2">
            {t("submittedOn", { date: new Date(req.createdAt).toLocaleDateString() })}
          </p>
        </div>
      </div>
    </div>
  );
}
