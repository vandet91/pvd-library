"use client";

import { useState, useRef, useEffect } from "react";
import {
  Send, Loader2, Bot, User,
  Tag, Trash2, ShoppingCart, Users, TrendingUp,
  BookOpen, X, ChevronDown, AlertCircle,
} from "lucide-react";

/* ── Types ──────────────────────────────────────────────────────────────── */
interface Message {
  role:    "user" | "assistant";
  content: string;
}

/* ── Quick suggestion chips ─────────────────────────────────────────────── */
const SUGGESTIONS = [
  { icon: Tag,          text: "Show me books that need labels",                  color: "amber"  },
  { icon: Trash2,       text: "Which books should we consider weeding?",         color: "rose"   },
  { icon: ShoppingCart, text: "What books should we acquire more copies of?",    color: "green"  },
  { icon: Users,        text: "Show me at-risk members",                         color: "purple" },
  { icon: TrendingUp,   text: "What are the trending books this month?",         color: "blue"   },
  { icon: BookOpen,     text: "Books in poor condition that haven't been withdrawn", color: "orange"},
  { icon: TrendingUp,   text: "New arrivals this week",                          color: "teal"   },
  { icon: AlertCircle,  text: "Members with overdue books",                      color: "red"    },
] as const;

const COLOR_MAP: Record<string, { chip: string; icon: string }> = {
  amber:  { chip: "bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100",  icon: "text-amber-600"  },
  rose:   { chip: "bg-rose-50 border-rose-200 text-rose-800 hover:bg-rose-100",      icon: "text-rose-600"   },
  green:  { chip: "bg-green-50 border-green-200 text-green-800 hover:bg-green-100",  icon: "text-green-600"  },
  purple: { chip: "bg-purple-50 border-purple-200 text-purple-800 hover:bg-purple-100", icon: "text-purple-600"},
  blue:   { chip: "bg-blue-50 border-blue-200 text-blue-800 hover:bg-blue-100",      icon: "text-blue-600"   },
  orange: { chip: "bg-orange-50 border-orange-200 text-orange-800 hover:bg-orange-100",icon: "text-orange-600"},
  teal:   { chip: "bg-teal-50 border-teal-200 text-teal-800 hover:bg-teal-100",      icon: "text-teal-600"   },
  red:    { chip: "bg-red-50 border-red-200 text-red-800 hover:bg-red-100",          icon: "text-red-600"    },
};

export default function AdminAIAssistantPage() {
  const [messages,  setMessages]  = useState<Message[]>([]);
  const [input,     setInput]     = useState("");
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [pageState, setPageState] = useState<"loading" | "ok" | "disabled" | "unconfigured">("loading");

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  /* Check AI availability + settings on mount */
  useEffect(() => {
    fetch("/api/admin/assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "ping" }] }),
    }).then((res) => {
      if (res.status === 503) setPageState("unconfigured");
      else if (res.status === 403) setPageState("disabled");
      else setPageState("ok");
    }).catch(() => setPageState("unconfigured"));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;

    setInput("");
    setError(null);
    const newMessages: Message[] = [...messages, { role: "user", content }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const res = await fetch("/api/admin/assistant", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          messages: newMessages.slice(-20), // last 20 for context window
        }),
      });

      const data = await res.json() as { reply?: string; error?: string };

      if (!res.ok || data.error) {
        setError(data.error ?? `Server error ${res.status}`);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: data.reply ?? "" }]);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Request failed — please try again.");
    } finally {
      setLoading(false);
    }
  }

  function clearChat() {
    setMessages([]);
    setError(null);
    inputRef.current?.focus();
  }

  /* ── Loading ──────────────────────────────────────────────────────────── */
  if (pageState === "loading") {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Checking AI status…</span>
      </div>
    );
  }

  /* ── Disabled by admin settings ───────────────────────────────────────── */
  if (pageState === "disabled") {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Bot className="w-7 h-7 text-gray-400" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">AI Library Assistant</h1>
            <p className="text-sm text-gray-500">Ask anything about your collection, members, or operations</p>
          </div>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-8 text-center space-y-3">
          <AlertCircle className="w-12 h-12 text-gray-400 mx-auto" />
          <p className="text-lg font-semibold text-gray-700">AI assistant is currently disabled</p>
          <p className="text-sm text-gray-500 max-w-sm mx-auto">
            An administrator has turned off AI access for staff. Go to{" "}
            <strong>Settings → AI Book Search</strong> to re-enable it.
          </p>
        </div>
      </div>
    );
  }

  /* ── Not configured (no API key) ──────────────────────────────────────── */
  if (pageState === "unconfigured") {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Bot className="w-7 h-7 text-indigo-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">AI Library Assistant</h1>
            <p className="text-sm text-gray-500">Ask anything about your collection, members, or operations</p>
          </div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-amber-500 mx-auto" />
          <div>
            <p className="text-lg font-semibold text-amber-900">AI assistant is not configured</p>
            <p className="text-sm text-amber-700 mt-2 max-w-md mx-auto">
              Add your AI API key to the <code className="bg-amber-100 px-1 rounded">.env</code> file to enable this feature.
            </p>
          </div>
          <div className="bg-white border border-amber-200 rounded-xl p-4 text-left max-w-md mx-auto space-y-2">
            <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">Option 1 — Free (Google Gemini)</p>
            <pre className="text-xs text-gray-600 bg-gray-50 p-3 rounded-lg overflow-x-auto">{`AI_PROVIDER=gemini
AI_API_KEY=AIza...
AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
AI_MODEL=gemini-2.5-flash`}</pre>
            <p className="text-xs font-bold text-gray-700 uppercase tracking-wide mt-3">Option 2 — DeepSeek (Paid)</p>
            <pre className="text-xs text-gray-600 bg-gray-50 p-3 rounded-lg overflow-x-auto">{`AI_PROVIDER=deepseek
AI_API_KEY=sk-...
AI_BASE_URL=https://api.deepseek.com
AI_MODEL=deepseek-chat`}</pre>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
            <Bot className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">AI Library Assistant</h1>
            <p className="text-xs text-gray-400">Powered by your configured AI provider</p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearChat}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="w-4 h-4" /> Clear chat
          </button>
        )}
      </div>

      {/* ── Chat area ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto bg-gray-50 rounded-2xl border border-gray-100 p-4 space-y-4 min-h-0">

        {/* Welcome state */}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full py-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-indigo-100 flex items-center justify-center mb-4">
              <Bot className="w-8 h-8 text-indigo-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-800 mb-1">Hello, Librarian!</h2>
            <p className="text-sm text-gray-500 mb-6 max-w-xs">
              Ask me anything about your collection, operations, or staff tasks. I have access to all library data.
            </p>

            {/* Suggestion chips */}
            <div className="flex flex-wrap justify-center gap-2 max-w-2xl">
              {SUGGESTIONS.map(({ icon: Icon, text, color }) => {
                const cls = COLOR_MAP[color as string] ?? COLOR_MAP.blue;
                return (
                  <button
                    key={text}
                    onClick={() => send(text)}
                    className={`flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-full border transition-colors ${cls.chip}`}
                  >
                    <Icon className={`w-3.5 h-3.5 ${cls.icon}`} />
                    {text}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Messages */}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {m.role === "assistant" && (
              <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Bot className="w-4 h-4 text-indigo-600" />
              </div>
            )}
            <div
              className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed ${
                m.role === "user"
                  ? "bg-indigo-600 text-white rounded-br-sm"
                  : "bg-white border border-gray-200 text-gray-800 rounded-bl-sm shadow-sm"
              }`}
            >
              {m.content}
            </div>
            {m.role === "user" && (
              <div className="w-8 h-8 rounded-xl bg-gray-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                <User className="w-4 h-4 text-gray-600" />
              </div>
            )}
          </div>
        ))}

        {/* Typing indicator */}
        {loading && (
          <div className="flex gap-3 justify-start">
            <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Bot className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="bg-white border border-gray-200 px-4 py-3 rounded-2xl rounded-bl-sm shadow-sm">
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
            <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Show suggestions in-chat after messages */}
        {messages.length > 0 && !loading && (
          <div className="flex flex-wrap gap-2 pt-2">
            {SUGGESTIONS.slice(0, 4).map(({ icon: Icon, text, color }) => {
              const cls = COLOR_MAP[color as string] ?? COLOR_MAP.blue;
              return (
                <button
                  key={text}
                  onClick={() => send(text)}
                  className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${cls.chip}`}
                >
                  <Icon className={`w-3 h-3 ${cls.icon}`} />
                  {text}
                </button>
              );
            })}
            <details className="inline">
              <summary className="text-xs text-gray-400 hover:text-gray-600 cursor-pointer list-none flex items-center gap-1 px-3 py-1.5 rounded-full border border-gray-200 hover:bg-gray-50 transition-colors">
                More <ChevronDown className="w-3 h-3" />
              </summary>
              <div className="mt-1 flex flex-wrap gap-2">
                {SUGGESTIONS.slice(4).map(({ icon: Icon, text, color }) => {
                  const cls = COLOR_MAP[color as string] ?? COLOR_MAP.blue;
                  return (
                    <button
                      key={text}
                      onClick={() => send(text)}
                      className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${cls.chip}`}
                    >
                      <Icon className={`w-3 h-3 ${cls.icon}`} />
                      {text}
                    </button>
                  );
                })}
              </div>
            </details>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Input area ───────────────────────────────────────────────────── */}
      <div className="mt-3 flex items-center gap-2">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
          }}
          placeholder="Ask about your collection, members, operations… (Enter to send, Shift+Enter for newline)"
          rows={2}
          disabled={loading}
          className="flex-1 px-4 py-3 border border-gray-200 rounded-2xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-gray-50 disabled:text-gray-400 transition-colors"
        />
        <button
          onClick={() => send()}
          disabled={!input.trim() || loading}
          className="flex-shrink-0 w-11 h-11 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 text-white rounded-2xl flex items-center justify-center transition-colors"
        >
          {loading
            ? <Loader2 className="w-5 h-5 animate-spin" />
            : <Send className="w-5 h-5" />}
        </button>
      </div>
      <p className="text-xs text-gray-400 mt-1.5 text-center">
        AI can make mistakes. Verify important data in the respective admin sections.
      </p>
    </div>
  );
}
