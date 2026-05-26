"use client";

import { BookOpen, Mail, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { useLibraryName } from "@/context/library-name";

export default function VerifyRequestPage() {
  const locale = useLocale();
  const libraryName = useLibraryName();

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "linear-gradient(135deg, var(--login-from) 0%, var(--login-mid) 50%, var(--login-to) 100%)" }}
    >
      <div
        className="w-full max-w-md rounded-3xl p-8 shadow-2xl border text-center"
        style={{
          background:          "rgba(255,255,255,0.10)",
          backdropFilter:      "blur(28px) saturate(180%)",
          WebkitBackdropFilter:"blur(28px) saturate(180%)",
          borderColor:         "rgba(255,255,255,0.25)",
        }}
      >
        {/* Brand */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center border border-white/30"
               style={{ background: "rgba(255,255,255,.20)" }}>
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <span className="text-white font-bold text-lg">{libraryName}</span>
        </div>

        {/* Icon */}
        <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 border border-white/20"
             style={{ background: "rgba(255,255,255,.15)" }}>
          <Mail className="w-10 h-10 text-white" />
        </div>

        <h1 className="text-2xl font-bold text-white mb-3">Check your inbox</h1>
        <p className="text-white/70 text-sm leading-relaxed mb-2">
          A sign-in link has been sent to your email address.
        </p>
        <p className="text-white/50 text-xs mb-8">
          The link will expire in <strong className="text-white/70">10 minutes</strong>. Check your spam folder if it doesn&apos;t arrive.
        </p>

        {/* Steps */}
        <div className="text-left space-y-3 mb-8">
          {[
            `Open the email from ${libraryName}`,
            `Click the "Sign in to ${libraryName}" button`,
            "You'll be signed in automatically",
          ].map((step, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5"
                    style={{ background: "rgba(255,255,255,.25)", color: "#fff" }}>
                {i + 1}
              </span>
              <p className="text-white/70 text-sm">{step}</p>
            </div>
          ))}
        </div>

        <Link
          href={`/${locale}/auth/login`}
          className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-white/90 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
