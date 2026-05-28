"use client";

import { useState, useRef, useEffect } from "react";
import {
  Send, BookOpen, Loader2, Bot, X,
  ChevronDown, BookMarked, CheckCircle2, XCircle,
} from "lucide-react";

interface BookResult {
  id:              string;
  title:           string;
  author:          string;
  category:        string;
  language:        string;
  availableCopies: number;
  totalCopies:     number;
  isbn:            string | null;
}

interface Message {
  role:    "user" | "assistant";
  content: string;
  books?:  BookResult[];
}

interface Props {
  locale?: string;
  mode?:   "book" | "ebook";
  /** Optional: called when user clicks a book result */
  onBookClick?: (bookId: string) => void;
}

const BOOK_SUGGESTED = [
  "What are the trending books this month?",
  "Show me new arrivals this week",
  "Find available Khmer language books",
  "Find PDF books about history",
  "Any free ebooks or video resources?",
];

const EBOOK_SUGGESTED = [
  "Find PDF books about history",
  "Show me Khmer ebooks",
  "Any free video resources?",
  "Science ebooks available",
];

export default function BookSearchChat({ locale = "en", mode = "book", onBookClick }: Props) {
  const SUGGESTED = mode === "ebook" ? EBOOK_SUGGESTED : BOOK_SUGGESTED;
  const [open,     setOpen]     = useState(false);
  const [input,    setInput]    = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const bottomRef  = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLInputElement>(null);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Focus input when chat opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;

    setInput("");
    setError("");
    const newMessages: Message[] = [...messages, { role: "user", content }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const res = await fetch("/api/search/chat", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          mode,
          messages: newMessages.map(({ role, content }) => ({ role, content })),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");

      setMessages([
        ...newMessages,
        { role: "assistant", content: data.reply, books: data.books ?? [] },
      ]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  function clear() {
    setMessages([]);
    setError("");
    setInput("");
  }

  /* ── Floating button ── */
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white transition-transform hover:scale-110 active:scale-95"
        style={{ background: "var(--accent)" }}
        aria-label="Open AI book search"
      >
        <Bot className="w-6 h-6" />
      </button>
    );
  }

  /* ── Chat panel ── */
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col w-[360px] max-h-[600px] rounded-2xl shadow-2xl border border-gray-200 bg-white overflow-hidden"
      style={{ maxHeight: "min(600px, calc(100vh - 80px))" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 text-white flex-shrink-0"
        style={{ background: "var(--accent)" }}
      >
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4" />
          <span className="font-semibold text-sm">
            {mode === "ebook"
              ? (locale === "km" ? "ស្វែងរក E-Library AI" : "AI E-Library Search")
              : (locale === "km" ? "ស្វែងរកសៀវភៅ AI"     : "AI Book Search")}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button onClick={clear} title="Clear chat"
              className="p-1 rounded-lg hover:bg-white/20 transition-colors text-white/80 hover:text-white text-xs px-2">
              Clear
            </button>
          )}
          <button onClick={() => setOpen(false)}
            className="p-1 rounded-lg hover:bg-white/20 transition-colors">
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">

        {/* Welcome state */}
        {messages.length === 0 && !loading && (
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs"
                style={{ background: "var(--accent)" }}>
                <Bot className="w-3.5 h-3.5" />
              </div>
              <div className="bg-gray-50 rounded-2xl rounded-tl-sm px-3 py-2.5 text-sm text-gray-700 flex-1">
                {mode === "ebook"
                  ? (locale === "km"
                    ? "សួស្ដី! ខ្ញុំអាចជួយអ្នករក E-Library (PDF, EPUB, វីដេអូ, អូឌីយូ)។ សូមសួរខ្ញុំ!"
                    : "Hi! I can help you find digital resources — PDFs, EPUBs, videos, audio & more. What are you looking for?")
                  : (locale === "km"
                    ? "សួស្ដី! ខ្ញុំអាចជួយអ្នករកសៀវភៅ និង E-Library បាន។ សូមសួរខ្ញុំ!"
                    : "Hi! I can help you find physical books and digital resources (E-Library). What are you looking for?")}
              </div>
            </div>
            {/* Suggested queries */}
            <div className="pl-9 space-y-1.5">
              {SUGGESTED.map((s) => (
                <button key={s} onClick={() => send(s)}
                  className="block w-full text-left text-xs px-3 py-2 rounded-xl border border-gray-200 text-gray-600 hover:border-opacity-60 hover:bg-gray-50 transition-colors"
                  style={{ borderColor: "var(--accent)22" }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Message history */}
        {messages.map((msg, i) => (
          <div key={i}>
            {msg.role === "user" ? (
              /* User bubble */
              <div className="flex justify-end">
                <div className="max-w-[80%] px-3 py-2 rounded-2xl rounded-tr-sm text-sm text-white"
                  style={{ background: "var(--accent)" }}>
                  {msg.content}
                </div>
              </div>
            ) : (
              /* Assistant bubble */
              <div className="flex items-start gap-2">
                <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs flex-shrink-0"
                  style={{ background: "var(--accent)" }}>
                  <Bot className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="bg-gray-50 rounded-2xl rounded-tl-sm px-3 py-2.5 text-sm text-gray-700 whitespace-pre-wrap">
                    {msg.content}
                  </div>

                  {/* Book result cards */}
                  {msg.books && msg.books.length > 0 && (
                    <div className="space-y-1.5">
                      {msg.books.map((book) => (
                        <button
                          key={book.id}
                          onClick={() => onBookClick?.(book.id)}
                          disabled={!onBookClick}
                          className={`w-full text-left border rounded-xl p-2.5 transition-colors ${
                            onBookClick
                              ? "hover:bg-gray-50 cursor-pointer border-gray-200"
                              : "cursor-default border-gray-100"
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                              <BookMarked className="w-4 h-4 text-gray-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-gray-800 truncate">{book.title}</p>
                              <p className="text-[11px] text-gray-500">{book.author} · {book.category}</p>
                            </div>
                            {book.availableCopies > 0 ? (
                              <span className="flex items-center gap-0.5 text-[10px] font-semibold text-emerald-600 flex-shrink-0">
                                <CheckCircle2 className="w-3 h-3" />
                                {book.availableCopies}
                              </span>
                            ) : (
                              <span className="flex items-center gap-0.5 text-[10px] font-semibold text-red-400 flex-shrink-0">
                                <XCircle className="w-3 h-3" />
                                Out
                              </span>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Loading */}
        {loading && (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-white"
              style={{ background: "var(--accent)" }}>
              <Bot className="w-3.5 h-3.5" />
            </div>
            <div className="bg-gray-50 rounded-2xl rounded-tl-sm px-3 py-2.5 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />
              <span className="text-xs text-gray-400">
                {locale === "km" ? "កំពុងស្វែងរក..." : "Searching..."}
              </span>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">
            <X className="w-3.5 h-3.5 flex-shrink-0" />
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 border-t border-gray-100 px-3 py-2.5">
        <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
          <BookOpen className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={mode === "ebook"
              ? (locale === "km" ? "ស្វែងរក E-Library..." : "Search digital resources...")
              : (locale === "km" ? "ស្វែងរកសៀវភៅ ឬ E-Library..." : "Search books or digital resources...")}
            className="flex-1 bg-transparent text-sm outline-none text-gray-700 placeholder-gray-400"
            maxLength={500}
            disabled={loading}
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || loading}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white transition-opacity disabled:opacity-40 flex-shrink-0"
            style={{ background: "var(--accent)" }}
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className="text-[10px] text-gray-300 text-center mt-1">
          {locale === "km" ? "ដំណើរការដោយ AI" : "Powered by AI · Gemini / DeepSeek / Claude"}
        </p>
      </div>
    </div>
  );
}
