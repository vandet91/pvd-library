"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Inbox, ChevronLeft, Plus, X, Loader2,
  Clock, CheckCircle2, XCircle, PackageCheck,
  BookOpen, Send,
} from "lucide-react";
import MemberHeader from "@/components/shared/MemberHeader";
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

const statusStyle: Record<string, string> = {
  PENDING:   "bg-amber-100 text-amber-700",
  APPROVED:  "bg-blue-100  text-blue-700",
  REJECTED:  "bg-red-100   text-red-700",
  FULFILLED: "bg-green-100 text-green-700",
};

const statusIcon: Record<string, React.ReactNode> = {
  PENDING:   <Clock        className="w-3.5 h-3.5" />,
  APPROVED:  <CheckCircle2 className="w-3.5 h-3.5" />,
  REJECTED:  <XCircle      className="w-3.5 h-3.5" />,
  FULFILLED: <PackageCheck className="w-3.5 h-3.5" />,
};

const statusLabel: Record<string, string> = {
  PENDING:   "Pending",
  APPROVED:  "Approved",
  REJECTED:  "Declined",
  FULFILLED: "Acquired",
};

export default function MemberBookRequestsPage() {
  const { data: session, status: authStatus } = useSession();
  const locale      = useLocale();
  const router      = useRouter();
  const libraryName = useLibraryName();

  const [requests, setRequests] = useState<BookRequest[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);

  /* form state */
  const [title,   setTitle]   = useState("");
  const [author,  setAuthor]  = useState("");
  const [isbn,    setIsbn]    = useState("");
  const [notes,   setNotes]   = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (authStatus === "unauthenticated") router.push(`/${locale}/member/login`);
  }, [authStatus, locale, router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/book-requests");
      if (res.ok) setRequests(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/book-requests", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ title: title.trim(), author: author.trim() || null, isbn: isbn.trim() || null, notes: notes.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to submit request"); return; }
      setSuccess(true);
      setTitle(""); setAuthor(""); setIsbn(""); setNotes("");
      setTimeout(() => { setSuccess(false); setShowForm(false); }, 2000);
      load();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (authStatus === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Nav */}
      <nav className="sticky top-0 z-30 bg-[#0f1e4a]/95 backdrop-blur border-b border-white/10">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <Link href={`/${locale}/account`}
            className="flex items-center gap-1.5 text-white/60 hover:text-white text-xs transition-colors">
            <ChevronLeft className="w-4 h-4" />
            {libraryName}
          </Link>
          <MemberHeader theme="dark" />
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-pink-50 flex items-center justify-center">
              <Inbox className="w-5 h-5 text-pink-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Book Requests</h1>
              <p className="text-xs text-gray-500">Request books for the library to acquire</p>
            </div>
          </div>
          <button
            onClick={() => { setShowForm((v) => !v); setError(null); }}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showForm ? "Cancel" : "New Request"}
          </button>
        </div>

        {/* Submit form */}
        {showForm && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-sm font-semibold text-gray-800 mb-4">Request a new book</h2>
            {success ? (
              <div className="flex items-center gap-2 text-green-700 bg-green-50 rounded-xl px-4 py-3 text-sm">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                Request submitted! We&apos;ll review it and notify you of the outcome.
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Book title <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    placeholder="e.g. The Great Gatsby"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Author</label>
                    <input
                      type="text"
                      value={author}
                      onChange={(e) => setAuthor(e.target.value)}
                      placeholder="e.g. F. Scott Fitzgerald"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">ISBN</label>
                    <input
                      type="text"
                      value={isbn}
                      onChange={(e) => setIsbn(e.target.value)}
                      placeholder="optional"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    placeholder="Why would this book benefit the library?"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                  />
                </div>
                {error && (
                  <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
                )}
                <button
                  type="submit"
                  disabled={submitting || !title.trim()}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Submit Request
                </button>
              </form>
            )}
          </div>
        )}

        {/* Request list */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
              <Loader2 className="w-5 h-5 animate-spin" /> Loading…
            </div>
          ) : requests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-400">
              <BookOpen className="w-10 h-10 opacity-30" />
              <p className="text-sm">No requests yet.</p>
              <button
                onClick={() => setShowForm(true)}
                className="text-xs text-indigo-600 hover:underline"
              >
                Submit your first request →
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {requests.map((req) => (
                <li key={req.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 text-sm">{req.title}</p>
                      {req.author && <p className="text-xs text-gray-500 mt-0.5">by {req.author}</p>}
                      {req.isbn   && <p className="text-xs text-gray-400 font-mono mt-0.5">ISBN {req.isbn}</p>}
                      {req.notes  && <p className="text-xs text-gray-400 italic mt-1">{req.notes}</p>}
                      {req.adminNote && (
                        <p className="text-xs text-indigo-700 bg-indigo-50 rounded-lg px-2.5 py-1.5 mt-2">
                          <span className="font-medium">Library note:</span> {req.adminNote}
                        </p>
                      )}
                      <p className="text-xs text-gray-300 mt-2">{new Date(req.createdAt).toLocaleDateString()}</p>
                    </div>
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 ${statusStyle[req.status]}`}>
                      {statusIcon[req.status]}
                      {statusLabel[req.status]}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

      </main>
    </div>
  );
}
