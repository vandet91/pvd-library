"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  BookOpen, Eye, EyeOff, Loader2, UserPlus,
  CheckCircle2, AlertCircle, Info,
} from "lucide-react";
import { useLibraryName } from "@/context/library-name";
import LanguageToggle from "@/components/shared/LanguageToggle";

interface SuccessData {
  message:     string;
  autoApprove: boolean;
  phoneOnly:   boolean;
  memberId:    string;
}

export default function MemberRegisterPage() {
  const locale      = useLocale();
  const router      = useRouter();
  const libraryName = useLibraryName();
  const t           = useTranslations("memberPortal");

  const MEMBER_TYPES = [
    { value: "STUDENT", label: t("typeStudent") },
    { value: "TEACHER", label: t("typeTeacher") },
    { value: "STAFF",   label: t("typeStaff") },
    { value: "PUBLIC",  label: t("typePublic") },
  ];

  const [form, setForm] = useState({
    name:       "",
    email:      "",
    phone:      "",
    address:    "",
    memberType: "PUBLIC",
    password:   "",
    confirm:    "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState("");
  const [success,      setSuccess]      = useState<SuccessData | null>(null);

  const hasEmail = form.email.trim().length > 0;
  const hasPhone = form.phone.trim().length > 0;

  const set = (key: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!hasEmail && !hasPhone) {
      setError(t("atLeastOneRequired"));
      return;
    }
    if (form.password !== form.confirm) {
      setError(t("passwordMismatch"));
      return;
    }

    setLoading(true);
    try {
      const res  = await fetch("/api/members/register", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          name:       form.name,
          email:      form.email || undefined,
          phone:      form.phone || undefined,
          address:    form.address || undefined,
          memberType: form.memberType,
          password:   form.password,
        }),
      });
      const data = await res.json() as SuccessData & { error?: string };
      if (!res.ok) {
        setError(data.error ?? t("registrationFailed"));
        return;
      }
      setSuccess(data);
      if (data.autoApprove && !data.phoneOnly) {
        setTimeout(() => router.push(`/${locale}/member/login`), 3000);
      }
    } catch {
      setError(t("networkError"));
    } finally {
      setLoading(false);
    }
  }

  /* ── Success state ── */
  if (success) {
    return (
      <div className="min-h-screen bg-blue-950 flex items-center justify-center px-6">
        <div className="w-full max-w-[400px] text-center space-y-4">
          <div className="w-16 h-16 bg-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto ring-1 ring-emerald-400/30">
            <CheckCircle2 className="w-8 h-8 text-emerald-400" />
          </div>
          <h2 className="text-xl font-bold text-white">
            {success.autoApprove ? t("accountCreated") : t("registrationSubmitted")}
          </h2>
          <p className="text-blue-300 text-sm">{success.message}</p>

          {/* Phone-only: show member ID prominently */}
          {success.phoneOnly && success.autoApprove && (
            <div className="bg-white/10 border border-white/20 rounded-xl p-4 text-left space-y-1">
              <p className="text-xs text-blue-300 uppercase tracking-wider font-semibold">{t("yourMemberId")}</p>
              <p className="text-2xl font-mono font-bold text-white tracking-widest">{success.memberId}</p>
              <p className="text-xs text-blue-400">{t("saveMemberIdHint")}</p>
            </div>
          )}

          <Link
            href={`/${locale}/member/login`}
            className="inline-flex items-center gap-2 mt-2 px-6 py-2.5 rounded-xl bg-white text-blue-950 font-semibold text-sm hover:bg-blue-50 transition-colors"
          >
            {success.autoApprove ? t("signInNow") : t("backToSignIn")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-blue-950 flex flex-col">

      {/* Top bar */}
      <div className="flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-white/15 rounded-xl flex items-center justify-center">
            <BookOpen className="w-4 h-4 text-white" />
          </div>
          <span className="text-white font-semibold text-sm">{libraryName}</span>
        </div>
        <div className="flex items-center gap-3">
          <LanguageToggle variant="dark" />
          <Link href={`/${locale}/member/login`}
            className="text-blue-300 hover:text-white text-xs font-medium transition-colors">
            {t("alreadyHaveAccount")}
          </Link>
        </div>
      </div>

      {/* Form card */}
      <div className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-[420px]">

          {/* Heading */}
          <div className="mb-6 text-center">
            <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-5 ring-1 ring-white/20">
              <UserPlus className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">{t("registerTitle")}</h1>
            <p className="text-blue-300 text-sm mt-1.5">{t("registerSubtitle")}</p>
          </div>

          {/* At-least-one hint */}
          <div className="flex items-start gap-2 bg-blue-900/50 border border-blue-700/50 rounded-xl px-3 py-2.5 mb-5 text-xs text-blue-300">
            <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-blue-400" />
            <span>
              {t("atLeastOneHint1")}{" "}
              <strong className="text-white">{t("emailWord")}</strong>{" "}
              {t("atLeastOneHint2")}{" "}
              <strong className="text-white">{t("phoneWord")}</strong>.{" "}
              {t("atLeastOneHint3")}
            </span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Name */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-blue-300 uppercase tracking-wider">
                {t("fullName")} <span className="text-red-400">*</span>
              </label>
              <input type="text" value={form.name} onChange={(e) => set("name", e.target.value)}
                required placeholder={t("fullNamePlaceholder")}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-sm text-white placeholder-blue-400 focus:outline-none focus:ring-2 focus:ring-white/40 transition-all" />
            </div>

            {/* Email + Phone side by side on wider screens */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-blue-300 uppercase tracking-wider">
                  {t("email")}
                  {!hasPhone && <span className="text-red-400 ml-1">*</span>}
                  {hasPhone && !hasEmail && (
                    <span className="text-blue-500 font-normal normal-case ml-1">{t("optional")}</span>
                  )}
                </label>
                <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)}
                  placeholder={t("emailPlaceholder")}
                  className={`w-full px-4 py-3 bg-white/10 border rounded-xl text-sm text-white placeholder-blue-400 focus:outline-none focus:ring-2 focus:ring-white/40 transition-all ${
                    !hasEmail && !hasPhone ? "border-amber-500/50" : "border-white/20"
                  }`} />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-blue-300 uppercase tracking-wider">
                  {t("phone")}
                  {!hasEmail && <span className="text-red-400 ml-1">*</span>}
                  {hasEmail && !hasPhone && (
                    <span className="text-blue-500 font-normal normal-case ml-1">{t("optional")}</span>
                  )}
                </label>
                <input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)}
                  placeholder={t("phonePlaceholder")}
                  className={`w-full px-4 py-3 bg-white/10 border rounded-xl text-sm text-white placeholder-blue-400 focus:outline-none focus:ring-2 focus:ring-white/40 transition-all ${
                    !hasEmail && !hasPhone ? "border-amber-500/50" : "border-white/20"
                  }`} />
              </div>
            </div>

            {/* Phone-only notice */}
            {hasPhone && !hasEmail && (
              <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2.5 text-xs text-amber-300">
                <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                {t("phoneOnlyNotice")}
              </div>
            )}

            {/* Member type */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-blue-300 uppercase tracking-wider">
                {t("memberType")}
              </label>
              <select value={form.memberType} onChange={(e) => set("memberType", e.target.value)}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/40 transition-all">
                {MEMBER_TYPES.map((mt) => (
                  <option key={mt.value} value={mt.value} className="text-gray-900 bg-white">
                    {mt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-blue-300 uppercase tracking-wider">
                {t("passwordLabel")} <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <input type={showPassword ? "text" : "password"}
                  value={form.password} onChange={(e) => set("password", e.target.value)}
                  required placeholder={t("passwordHint")}
                  className="w-full px-4 py-3 pr-11 bg-white/10 border border-white/20 rounded-xl text-sm text-white placeholder-blue-400 focus:outline-none focus:ring-2 focus:ring-white/40 transition-all" />
                <button type="button" onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-blue-300 hover:text-white transition-colors">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Confirm password */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-blue-300 uppercase tracking-wider">
                {t("confirmPassword")} <span className="text-red-400">*</span>
              </label>
              <input type={showPassword ? "text" : "password"}
                value={form.confirm} onChange={(e) => set("confirm", e.target.value)}
                required placeholder={t("confirmPasswordPlaceholder")}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-sm text-white placeholder-blue-400 focus:outline-none focus:ring-2 focus:ring-white/40 transition-all" />
            </div>

            {/* No contact info warning */}
            {!hasEmail && !hasPhone && (
              <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2.5 text-xs text-amber-300">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                {t("noContactWarning")}
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 text-sm text-red-300 bg-red-500/20 border border-red-500/30 px-4 py-2.5 rounded-xl">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                {error}
              </div>
            )}

            <div className="pt-1">
              <button type="submit" disabled={loading || (!hasEmail && !hasPhone)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-white text-blue-950 font-semibold text-sm hover:bg-blue-50 transition-all active:scale-[0.99] disabled:opacity-50 shadow-lg">
                {loading
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> {t("submitting")}</>
                  : <><UserPlus className="w-4 h-4" /> {t("createAccountBtn")}</>}
              </button>
            </div>
          </form>

          <div className="mt-6 pt-5 border-t border-white/10 text-center">
            <p className="text-blue-500 text-xs">
              <Link href={`/${locale}/member/login`} className="text-white font-semibold hover:underline">
                {t("alreadyHaveAccount")}
              </Link>
            </p>
            <p className="text-blue-600 text-xs mt-2">
              {t("noEmailOrPhone")}{" "}
              <Link href={`/${locale}/discover`} className="hover:text-blue-400 transition-colors">
                {t("visitLibrary")}
              </Link>
            </p>
          </div>
        </div>
      </div>

      <div className="px-8 py-4 text-center">
        <p className="text-[11px] text-blue-500">
          © {new Date().getFullYear()} {libraryName} Management System
        </p>
      </div>
    </div>
  );
}
