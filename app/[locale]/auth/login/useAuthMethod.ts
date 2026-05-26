"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";

export type AuthMethod = "password" | "google" | "magic";

export function useAuthMethod() {
  const locale = useLocale();
  const t = useTranslations("auth");
  const callbackUrl = `/${locale}/auth/me`;

  /* ── Method selector ──────────────────────────────────────── */
  const [method, setMethod] = useState<AuthMethod>("password");

  /* ── Magic link state ─────────────────────────────────────── */
  const [magicEmail,   setMagicEmail]   = useState("");
  const [magicLoading, setMagicLoading] = useState(false);
  const [magicSent,    setMagicSent]    = useState(false);
  const [magicError,   setMagicError]   = useState("");

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!magicEmail.trim()) return;
    setMagicLoading(true);
    setMagicError("");

    const res = await signIn("nodemailer", {
      email:       magicEmail.trim(),
      callbackUrl,
      redirect:    false,
    });

    setMagicLoading(false);

    if (res?.error) {
      if (res.error === "MethodNotAllowed" || res.url?.includes("error=MethodNotAllowed")) {
        setMagicError(t("magicMethodNotAllowed"));
      } else if (res.error === "AccessDenied") {
        setMagicError(t("magicAccessDenied"));
      } else if (res.error === "Configuration" || res.url?.includes("error=Configuration")) {
        setMagicError(t("magicNotConfigured"));
      } else {
        setMagicError(t("magicFailed"));
      }
    } else {
      setMagicSent(true);
    }
  }

  /* ── Google ───────────────────────────────────────────────── */
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError,   setGoogleError]   = useState("");

  // Read the ?error= param once on mount, then immediately scrub it from the URL
  // so that subsequent login attempts in the same tab are not poisoned by it.
  const [urlError, setUrlError] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (err) {
      setUrlError(err);
      params.delete("error");
      const clean = [window.location.pathname, params.toString()].filter(Boolean).join("?");
      window.history.replaceState(null, "", clean);
    }
  }, []);

  async function startGoogle() {
    setGoogleLoading(true);
    setGoogleError("");
    // OAuth requires a full-page redirect — NextAuth handles everything from here.
    // If denied (wrong role / not configured) NextAuth redirects back with ?error=...
    await signIn("google", { callbackUrl });
    // Code below this line is only reached if signIn itself threw (very rare)
    setGoogleLoading(false);
  }

  return {
    method, setMethod,
    callbackUrl,
    // magic
    magicEmail, setMagicEmail,
    magicLoading, magicSent, magicError,
    sendMagicLink,
    resetMagic: () => { setMagicSent(false); setMagicEmail(""); setMagicError(""); },
    // google
    googleLoading, googleError, urlError, startGoogle,
  };
}
