"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";

interface MemberFormProps {
  initial?: {
    id: string; name: string; email?: string; phone?: string;
    address?: string; memberType: string; gender?: string; isActive: boolean; expireDate?: string;
    studentId?: string; school?: string; className?: string;
  };
}

export default function MemberForm({ initial }: MemberFormProps) {
  const t = useTranslations("members");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();

  const [form, setForm] = useState({
    name: initial?.name ?? "",
    email: initial?.email ?? "",
    phone: initial?.phone ?? "",
    address: initial?.address ?? "",
    memberType: initial?.memberType ?? "STUDENT",
    gender: initial?.gender ?? "UNSPECIFIED",
    isActive: initial?.isActive ?? true,
    expireDate: initial?.expireDate ? initial.expireDate.slice(0, 10) : "",
    studentId: initial?.studentId ?? "",
    school: initial?.school ?? "",
    className: initial?.className ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const url = initial ? `/api/members/${initial.id}` : "/api/members";
    const method = initial ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, expireDate: form.expireDate || undefined }),
    });

    setSaving(false);
    if (res.ok) {
      router.push(`/${locale}/admin/members`);
      router.refresh();
    } else {
      const data = await res.json();
      setError(data.error?.message ?? "Error saving member");
    }
  }

  const memberTypes = [
    { value: "STUDENT", label: t("student") },
    { value: "TEACHER", label: t("teacher") },
    { value: "STAFF", label: t("staff") },
    { value: "PUBLIC", label: t("public") },
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-xl">
      <div>
        <label htmlFor="member-name" className="block text-sm font-medium text-gray-700 mb-1.5">{t("memberName")}</label>
        <input id="member-name" type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="member-email" className="block text-sm font-medium text-gray-700 mb-1.5">{t("email")}</label>
          <input id="member-email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label htmlFor="member-phone" className="block text-sm font-medium text-gray-700 mb-1.5">{t("phone")}</label>
          <input id="member-phone" type="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      <div>
        <label htmlFor="member-address" className="block text-sm font-medium text-gray-700 mb-1.5">{t("address")}</label>
        <textarea id="member-address" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} rows={2}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label htmlFor="member-type" className="block text-sm font-medium text-gray-700 mb-1.5">{t("memberType")}</label>
          <select id="member-type" value={form.memberType} onChange={(e) => setForm((f) => ({ ...f, memberType: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            {memberTypes.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="member-gender" className="block text-sm font-medium text-gray-700 mb-1.5">{t("gender")}</label>
          <select id="member-gender" value={form.gender} onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="UNSPECIFIED">{t("genderUnspecified")}</option>
            <option value="MALE">{t("genderMale")}</option>
            <option value="FEMALE">{t("genderFemale")}</option>
          </select>
        </div>
        <div>
          <label htmlFor="member-expire" className="block text-sm font-medium text-gray-700 mb-1.5">{t("expireDate")}</label>
          <input id="member-expire" type="date" value={form.expireDate} onChange={(e) => setForm((f) => ({ ...f, expireDate: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      {form.memberType === "STUDENT" && (
        <div className="border border-blue-100 bg-blue-50 rounded-lg p-4 space-y-4">
          <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">{t("schoolInfo")}</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="member-student-id" className="block text-sm font-medium text-gray-700 mb-1.5">{t("studentId")}</label>
              <input id="member-student-id" type="text" value={form.studentId} onChange={(e) => setForm((f) => ({ ...f, studentId: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label htmlFor="member-school" className="block text-sm font-medium text-gray-700 mb-1.5">{t("school")}</label>
              <input id="member-school" type="text" value={form.school} onChange={(e) => setForm((f) => ({ ...f, school: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label htmlFor="member-class" className="block text-sm font-medium text-gray-700 mb-1.5">{t("className")}</label>
              <input id="member-class" type="text" value={form.className} onChange={(e) => setForm((f) => ({ ...f, className: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        </div>
      )}

      {initial && (
        <div className="flex items-center gap-3">
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} className="sr-only peer" />
            <div className="w-11 h-6 bg-gray-200 peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
          </label>
          <span className="text-sm text-gray-700">{form.isActive ? tc("active") : tc("inactive")}</span>
        </div>
      )}

      {error && <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg border border-red-200">{error}</div>}

      <div className="flex items-center gap-3 pt-2">
        <button type="submit" disabled={saving} className="bg-blue-900 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 transition-colors disabled:opacity-60">
          {saving ? tc("loading") : tc("save")}
        </button>
        <button type="button" onClick={() => router.back()} className="px-6 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
          {tc("cancel")}
        </button>
      </div>
    </form>
  );
}
