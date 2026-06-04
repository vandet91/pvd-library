"use client";

import { useState, useEffect } from "react";
import QRCode from "react-qr-code";
import { Send, CheckCircle2, Link2, Unlink, Loader2, Copy, Check } from "lucide-react";

interface LinkStatus {
  linked:      boolean;
  linkedAt:    string | null;
  botUsername: string;
  enabled:     boolean;
}

interface LinkCode {
  code:        string;
  expiresAt:   string;
  botUsername: string;
  deepLink:    string | null;
}

export default function TelegramLinkWidget() {
  const [status,   setStatus]   = useState<LinkStatus | null>(null);
  const [code,     setCode]     = useState<LinkCode | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [working,  setWorking]  = useState(false);
  const [copied,   setCopied]   = useState(false);
  const [error,    setError]    = useState("");

  useEffect(() => { fetchStatus(); }, []);

  async function fetchStatus() {
    setLoading(true);
    setError("");
    try {
      const res  = await fetch("/api/telegram/link");
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        if (res.status === 404) { setLoading(false); return; }
        setError(body.error ?? "Failed to load Telegram status.");
        setLoading(false);
        return;
      }
      const data = await res.json() as LinkStatus;
      setStatus(data);
    } catch {
      setError("Could not reach the server. Please refresh the page.");
    } finally {
      setLoading(false);
    }
  }

  async function generateCode() {
    setWorking(true);
    setError("");
    try {
      const res  = await fetch("/api/telegram/link", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to generate code. Please try again.");
        return;
      }
      setCode(data as LinkCode);
    } catch {
      setError("Failed to generate code. Please try again.");
    } finally {
      setWorking(false);
    }
  }

  async function unlink() {
    if (!confirm("Unlink your Telegram account? You will stop receiving Telegram notifications.")) return;
    setWorking(true);
    setError("");
    try {
      await fetch("/api/telegram/link", { method: "DELETE" });
      setStatus((s) => s ? { ...s, linked: false, linkedAt: null } : s);
      setCode(null);
    } catch {
      setError("Failed to unlink. Please try again.");
    } finally {
      setWorking(false);
    }
  }

  function copyCode() {
    if (!code?.code) return;
    navigator.clipboard.writeText(code.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const minutesLeft = code
    ? Math.max(0, Math.round((new Date(code.expiresAt).getTime() - Date.now()) / 60000))
    : 0;

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading Telegram status...
      </div>
    );
  }

  /* ── Disabled by admin ── */
  if (status && !status.enabled && !status.linked) {
    return (
      <p className="text-xs text-gray-400 py-2">
        Telegram linking is not available at this time.
      </p>
    );
  }

  /* ── Already linked ── */
  if (status?.linked) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-800">Telegram linked</p>
              {status.linkedAt && (
                <p className="text-xs text-emerald-600 mt-0.5">
                  Linked on {new Date(status.linkedAt).toLocaleDateString()}
                </p>
              )}
              <p className="text-xs text-emerald-600 mt-0.5">
                You&apos;ll receive loan reminders, overdue notices, and reservation alerts via Telegram.
              </p>
            </div>
          </div>
          <button
            onClick={unlink}
            disabled={working}
            className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 border border-red-200 hover:border-red-300 rounded-lg px-2.5 py-1.5 transition-colors flex-shrink-0 disabled:opacity-50"
          >
            <Unlink className="w-3.5 h-3.5" />
            Unlink
          </button>
        </div>
      </div>
    );
  }

  /* ── Code generated — show QR + manual code ── */
  if (code) {
    return (
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Send className="w-4 h-4 text-blue-600 flex-shrink-0" />
          <p className="text-sm font-semibold text-blue-800">Scan to link your Telegram</p>
        </div>

        {/* QR code — only shown when bot username is configured */}
        {code.deepLink && (
          <div className="flex flex-col items-center gap-2">
            <div className="bg-white p-3 rounded-xl border border-blue-200 inline-block">
              <QRCode
                value={code.deepLink}
                size={180}
                bgColor="#ffffff"
                fgColor="#1e3a8a"
                level="M"
              />
            </div>
            <p className="text-xs text-blue-600 text-center">
              Point your phone camera at the QR code — Telegram opens automatically
            </p>
            <a
              href={code.deepLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-700 underline font-medium"
            >
              Or tap here to open @{code.botUsername}
            </a>
          </div>
        )}

        {/* Divider */}
        {code.deepLink && (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-blue-200" />
            <span className="text-[11px] text-blue-400 uppercase tracking-wide">or enter code manually</span>
            <div className="flex-1 h-px bg-blue-200" />
          </div>
        )}

        {/* Manual code */}
        <div className="space-y-2">
          {!code.deepLink && (
            <p className="text-xs text-blue-700">
              Open Telegram, search <strong>@{code.botUsername || "the library bot"}</strong>, and send:
            </p>
          )}
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-white border border-blue-200 rounded-lg px-4 py-2.5 text-center">
              <span className="text-2xl font-mono font-bold tracking-widest text-blue-900">
                {code.code}
              </span>
            </div>
            <button
              onClick={copyCode}
              title="Copy code"
              className="p-2.5 rounded-lg border border-blue-200 bg-white hover:bg-blue-50 transition-colors text-blue-600"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          {!code.deepLink && (
            <p className="text-xs text-blue-600">
              Send the code above to the bot (you can also just type the 6 digits directly).
            </p>
          )}
        </div>

        <p className="text-[11px] text-blue-500">
          Code expires in {minutesLeft} minute{minutesLeft !== 1 ? "s" : ""}.{" "}
          <button onClick={generateCode} className="underline">Generate new code</button>
        </p>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <button
          onClick={fetchStatus}
          className="w-full text-xs text-blue-700 border border-blue-200 rounded-lg py-2 hover:bg-blue-100 transition-colors"
        >
          ↻ Check if linked
        </button>
      </div>
    );
  }

  /* ── Not linked ── */
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Send className="w-4 h-4 text-gray-500" />
        <p className="text-sm font-semibold text-gray-700">Connect Telegram</p>
      </div>
      <p className="text-xs text-gray-500">
        Link your Telegram account to receive instant notifications for loan due dates,
        overdue notices, reservation alerts, and membership reminders.
      </p>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        onClick={generateCode}
        disabled={working}
        className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
        style={{ background: "var(--accent)" }}
      >
        {working
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
          : <><Link2 className="w-4 h-4" /> Link Telegram Account</>
        }
      </button>
    </div>
  );
}
