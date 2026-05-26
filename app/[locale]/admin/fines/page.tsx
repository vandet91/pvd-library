"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, CheckCircle } from "lucide-react";
import { formatDate } from "@/lib/utils";

interface Fine {
  id: string; amount: number; daysLate: number; status: string; paidAt?: string; createdAt: string;
  member: { name: string; memberId: string };
  loan: { book: { title: string }; dueDate: string; returnDate?: string };
}

export default function FinesPage() {
  const t = useTranslations("fines");
  const tc = useTranslations("common");
  const [fines, setFines] = useState<Fine[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"ALL" | "UNPAID" | "PAID">("ALL");

  const fetchFines = useCallback(async () => {
    setLoading(true);
    const url = filter === "ALL" ? "/api/fines" : `/api/fines?status=${filter}`;
    const data = await fetch(url).then((r) => r.json());
    setFines(data);
    setLoading(false);
  }, [filter]);

  useEffect(() => { fetchFines(); }, [fetchFines]);

  async function markPaid(id: string) {
    await fetch(`/api/fines/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "pay" }),
    });
    fetchFines();
    window.dispatchEvent(new CustomEvent("alertsChanged"));
  }

  const totalUnpaid = fines.filter((f) => f.status === "UNPAID").reduce((s, f) => s + f.amount, 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm">
          <span className="text-red-600 font-medium">{t("unpaid")}: </span>
          <span className="text-red-700 font-bold">${totalUnpaid.toFixed(2)}</span>
        </div>
      </div>

      <div className="flex gap-2">
        {(["ALL", "UNPAID", "PAID"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${filter === f ? "bg-blue-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
            {f === "ALL" ? tc("filter") + " All" : f === "UNPAID" ? t("unpaid") : t("paid")}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">{tc("loading")}</div>
        ) : fines.length === 0 ? (
          <div className="p-8 text-center"><AlertCircle className="w-10 h-10 text-gray-300 mx-auto mb-2" /><p className="text-gray-400">{t("noFines")}</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3 text-left">{t("member")}</th>
                  <th className="px-6 py-3 text-left">{t("book")}</th>
                  <th className="px-6 py-3 text-left">{t("dueDate")}</th>
                  <th className="px-6 py-3 text-left">{t("daysOverdue")}</th>
                  <th className="px-6 py-3 text-left">{t("fineAmount")}</th>
                  <th className="px-6 py-3 text-left">{tc("status")}</th>
                  <th className="px-6 py-3 text-left">{tc("actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {fines.map((fine) => (
                  <tr key={fine.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-gray-900">{fine.member.name}</p>
                      <p className="text-xs text-gray-400 font-mono">{fine.member.memberId}</p>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">{fine.loan.book.title}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{formatDate(fine.loan.dueDate)}</td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-semibold text-red-600">{fine.daysLate}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-bold text-gray-900">${fine.amount.toFixed(2)}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`flex items-center gap-1 text-xs font-medium ${fine.status === "PAID" ? "text-green-600" : "text-red-500"}`}>
                        {fine.status === "PAID" ? <CheckCircle className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                        {fine.status === "PAID" ? t("paid") : t("unpaid")}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {fine.status === "UNPAID" && (
                        <button onClick={() => markPaid(fine.id)}
                          className="text-xs bg-green-50 text-green-700 hover:bg-green-100 px-3 py-1.5 rounded-lg font-medium transition-colors">
                          {t("markAsPaid")}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
