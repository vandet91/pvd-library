"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  Calendar, Clock, Plus, Trash2, Check, X,
  Loader2, RefreshCw, Info, ChevronLeft, ChevronRight, RotateCcw,
} from "lucide-react";

/* ── Types ──────────────────────────────────────────────────────── */
interface HourRow {
  dayOfWeek: number;
  isOpen:    boolean;
  openTime:  string | null;
  closeTime: string | null;
}

interface ClosedDay {
  id:          string;
  date:        string;
  reason:      string | null;
  isRecurring: boolean;
}

// Day/month names are defined inside the component using t()


const KH_HOLIDAYS = [
  { date: "01-01", name: "International New Year" },
  { date: "01-07", name: "Victory Day" },
  { date: "03-08", name: "International Women's Day" },
  { date: "04-13", name: "Khmer New Year" },
  { date: "04-14", name: "Khmer New Year" },
  { date: "04-15", name: "Khmer New Year" },
  { date: "05-01", name: "International Labor Day" },
  { date: "05-13", name: "King's Birthday" },
  { date: "05-14", name: "King's Birthday" },
  { date: "05-15", name: "King's Birthday" },
  { date: "06-01", name: "International Children's Day" },
  { date: "06-18", name: "Queen Mother's Birthday" },
  { date: "09-24", name: "Constitution Day" },
  { date: "10-15", name: "Commemoration of King Father" },
  { date: "10-23", name: "Paris Peace Agreement Day" },
  { date: "10-29", name: "Coronation Day" },
  { date: "11-09", name: "Independence Day" },
  { date: "12-10", name: "Human Rights Day" },
];

export default function CalendarPage() {
  const t = useTranslations("calendar");

  const DAY_NAMES = [t("daySun"),t("dayMon"),t("dayTue"),t("dayWed"),t("dayThu"),t("dayFri"),t("daySat")];
  const DAY_SHORT = [t("dayShortSun"),t("dayShortMon"),t("dayShortTue"),t("dayShortWed"),t("dayShortThu"),t("dayShortFri"),t("dayShortSat")];
  const MONTH_NAMES = [t("monthJan"),t("monthFeb"),t("monthMar"),t("monthApr"),t("monthMay"),t("monthJun"),t("monthJul"),t("monthAug"),t("monthSep"),t("monthOct"),t("monthNov"),t("monthDec")];

  const [hours,      setHours]      = useState<HourRow[]>([]);
  const [closedDays, setClosedDays] = useState<ClosedDay[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [hoursSaving, setHoursSaving] = useState(false);
  const [hoursSaved,  setHoursSaved]  = useState(false);
  const [hoursErr,    setHoursErr]    = useState<string | null>(null);

  const [viewYear,  setViewYear]  = useState(new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());

  /* add closed day */
  const [addDate,        setAddDate]        = useState("");
  const [addReason,      setAddReason]      = useState("");
  const [addRecurring,   setAddRecurring]   = useState(false);
  const [addBusy,        setAddBusy]        = useState(false);
  const [addErr,         setAddErr]         = useState<string | null>(null);
  const [deleteBusy,     setDeleteBusy]     = useState<string | null>(null);

  /* ── fetch ───────────────────────────────────────────────────── */
  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [h, c] = await Promise.all([
      fetch("/api/calendar/hours").then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`/api/calendar/closed-days?year=${viewYear}`).then(r => r.ok ? r.json() : []).catch(() => []),
    ]);
    // Fill in any missing weekdays with defaults
    const filled: HourRow[] = [0,1,2,3,4,5,6].map(d => {
      const row = (Array.isArray(h) ? h : []).find((x: HourRow) => x.dayOfWeek === d);
      return row ?? { dayOfWeek: d, isOpen: d !== 0, openTime: "08:00", closeTime: "17:00" };
    });
    setHours(filled);
    setClosedDays(Array.isArray(c) ? c : []);
    setLoading(false);
  }, [viewYear]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  /* ── save hours ──────────────────────────────────────────────── */
  async function saveHours() {
    setHoursSaving(true); setHoursErr(null); setHoursSaved(false);
    const res = await fetch("/api/calendar/hours", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(hours),
    });
    setHoursSaving(false);
    if (res.ok) { setHoursSaved(true); setTimeout(() => setHoursSaved(false), 2500); }
    else { const d = await res.json().catch(() => ({})); setHoursErr(d.error ?? "Failed to save"); }
  }

  /* ── add closed day ──────────────────────────────────────────── */
  async function addClosedDay() {
    if (!addDate) { setAddErr(t("errSelectDate")); return; }
    setAddBusy(true); setAddErr(null);
    const res = await fetch("/api/calendar/closed-days", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: addDate, reason: addReason, isRecurring: addRecurring }),
    });
    setAddBusy(false);
    if (!res.ok) { const d = await res.json().catch(() => ({})); setAddErr(d.error ?? "Failed"); return; }
    setAddDate(""); setAddReason(""); setAddRecurring(false); fetchAll();
  }

  async function deleteClosedDay(id: string) {
    setDeleteBusy(id);
    await fetch(`/api/calendar/closed-days/${id}`, { method: "DELETE" });
    setDeleteBusy(null); fetchAll();
  }

  /* ── add Cambodia public holidays for current year ───────────── */
  async function addKhHolidays() {
    const existing = new Set(closedDays.map(d => d.date.slice(5, 10)));
    const toAdd = KH_HOLIDAYS.filter(h => !existing.has(h.date));
    for (const h of toAdd) {
      await fetch("/api/calendar/closed-days", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: `${viewYear}-${h.date}`, reason: h.name, isRecurring: true }),
      });
    }
    fetchAll();
  }

  /* ── calendar grid ───────────────────────────────────────────── */
  function buildCalendar() {
    const first   = new Date(viewYear, viewMonth, 1);
    const last    = new Date(viewYear, viewMonth + 1, 0);
    const startDow = first.getDay();
    const days: (number | null)[] = Array(startDow).fill(null);
    for (let d = 1; d <= last.getDate(); d++) days.push(d);
    while (days.length % 7 !== 0) days.push(null);
    return days;
  }

  const calDays = buildCalendar();

  const closedSet = new Set(
    closedDays.map(cd => {
      const d = new Date(cd.date);
      if (cd.isRecurring) return `${viewMonth + 1}-${d.getDate()}`;
      return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    })
  );

  function isDayClosed(day: number): boolean {
    const date = new Date(viewYear, viewMonth, day);
    const dow  = date.getDay();
    const openRow = hours.find(h => h.dayOfWeek === dow);
    if (openRow && !openRow.isOpen) return true;
    return closedSet.has(`${viewYear}-${viewMonth + 1}-${day}`) ||
           closedSet.has(`${viewMonth + 1}-${day}`);
  }

  const today = new Date();
  const isToday = (day: number) =>
    today.getFullYear() === viewYear && today.getMonth() === viewMonth && today.getDate() === day;

  /* ── filtered closed days for this month view ────────────────── */
  const monthClosedDays = closedDays.filter(cd => {
    const d = new Date(cd.date);
    if (cd.isRecurring) return true;
    return d.getFullYear() === viewYear && d.getMonth() === viewMonth;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t("subtitle")}</p>
        </div>
        <button onClick={fetchAll} className="p-2 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Info box */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-800">
        <Info className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-500" />
        <div>
          <strong>{t("infoTitle")}</strong> {t("infoText")}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-12 justify-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /> {t("loading")}</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* ── Left: opening hours + closed days ── */}
          <div className="space-y-5">

            {/* Opening hours */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <h2 className="font-bold text-gray-900 flex items-center gap-2"><Clock className="w-4 h-4 text-blue-500" /> {t("sectionHours")}</h2>
              </div>
              <div className="divide-y divide-gray-50">
                {hours.map((h, idx) => (
                  <div key={h.dayOfWeek} className="flex items-center gap-3 px-5 py-3">
                    <button
                      onClick={() => setHours(prev => prev.map((r, i) => i === idx ? { ...r, isOpen: !r.isOpen } : r))}
                      className={`w-16 text-xs font-semibold py-1 rounded-full transition-colors ${h.isOpen ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}>
                      {h.isOpen ? t("open") : t("closed")}
                    </button>
                    <span className="w-24 text-sm font-medium text-gray-700">{DAY_NAMES[h.dayOfWeek]}</span>
                    {h.isOpen ? (
                      <div className="flex items-center gap-2 flex-1">
                        <input type="time" value={h.openTime ?? "08:00"}
                          onChange={e => setHours(prev => prev.map((r, i) => i === idx ? { ...r, openTime: e.target.value } : r))}
                          className="px-2 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        <span className="text-gray-400 text-xs">{t("timeTo")}</span>
                        <input type="time" value={h.closeTime ?? "17:00"}
                          onChange={e => setHours(prev => prev.map((r, i) => i === idx ? { ...r, closeTime: e.target.value } : r))}
                          className="px-2 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                    ) : (
                      <span className="text-xs text-gray-300 flex-1">{t("notOpen")}</span>
                    )}
                  </div>
                ))}
              </div>
              <div className="px-5 py-4 border-t border-gray-100 flex items-center gap-3">
                {hoursErr && <p className="text-xs text-red-600 flex-1">{hoursErr}</p>}
                {hoursSaved && <p className="text-xs text-green-600 flex-1 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> {t("savedMsg")}</p>}
                <button onClick={saveHours} disabled={hoursSaving}
                  className="ml-auto flex items-center gap-2 px-4 py-2 bg-blue-900 text-white rounded-xl text-sm font-semibold hover:bg-blue-800 disabled:opacity-50 transition-colors">
                  {hoursSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} {t("saveHours")}
                </button>
              </div>
            </div>

            {/* Add closed day */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <h2 className="font-bold text-gray-900 flex items-center gap-2"><Calendar className="w-4 h-4 text-red-400" /> {t("sectionClosedDays")}</h2>
                <button onClick={addKhHolidays}
                  className="flex items-center gap-1.5 text-xs text-amber-700 font-semibold bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg hover:bg-amber-100 transition-colors">
                  <RotateCcw className="w-3.5 h-3.5" /> {t("addKhHolidays")}
                </button>
              </div>
              <div className="px-5 py-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t("fieldDate")}</label>
                    <input type="date" value={addDate} onChange={e => setAddDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t("fieldReason")}</label>
                    <input type="text" value={addReason} onChange={e => setAddReason(e.target.value)}
                      placeholder={t("reasonPlaceholder")}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={addRecurring} onChange={e => setAddRecurring(e.target.checked)} className="w-4 h-4 accent-blue-600" />
                  <span className="text-sm text-gray-700">{t("recurring")}</span>
                </label>
                {addErr && <p className="text-xs text-red-600">{addErr}</p>}
                <button onClick={addClosedDay} disabled={addBusy || !addDate}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors">
                  {addBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} {t("addClosedDay")}
                </button>
              </div>

              {/* Closed days list */}
              {monthClosedDays.length > 0 && (
                <div className="border-t border-gray-100">
                  <p className="px-5 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                    {monthClosedDays.length === 1
                      ? t("closedDaySummary_one", { month: MONTH_NAMES[viewMonth], year: viewYear, count: monthClosedDays.length })
                      : t("closedDaySummaryPlural", { month: MONTH_NAMES[viewMonth], year: viewYear, count: monthClosedDays.length })}
                  </p>
                  <div className="divide-y divide-gray-50">
                    {monthClosedDays.map(cd => {
                      const d = new Date(cd.date);
                      return (
                        <div key={cd.id} className="flex items-center gap-3 px-5 py-2.5">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-gray-800">
                                {DAY_SHORT[d.getDay()]} {d.getDate()} {cd.isRecurring ? `(${t("everyYear")})` : d.getFullYear()}
                              </span>
                              {cd.isRecurring && <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded font-bold">{t("annual")}</span>}
                            </div>
                            {cd.reason && <p className="text-xs text-gray-500">{cd.reason}</p>}
                          </div>
                          <button onClick={() => deleteClosedDay(cd.id)} disabled={deleteBusy === cd.id}
                            className="p-1.5 text-gray-300 hover:text-red-500 transition-colors">
                            {deleteBusy === cd.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Right: calendar view ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {/* Month nav */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <button onClick={() => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1); }}
                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <h2 className="font-bold text-gray-900">{MONTH_NAMES[viewMonth]} {viewYear}</h2>
              <button onClick={() => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1); }}
                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 border-b border-gray-100">
              {DAY_SHORT.map(d => (
                <div key={d} className="py-2 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wide">{d}</div>
              ))}
            </div>

            {/* Calendar cells */}
            <div className="grid grid-cols-7">
              {calDays.map((day, i) => {
                if (!day) return <div key={`e-${i}`} className="h-14 border-b border-r border-gray-50 last:border-r-0" />;
                const closed = isDayClosed(day);
                const date   = new Date(viewYear, viewMonth, day);
                const dow    = date.getDay();
                const closedEntry = closedDays.find(cd => {
                  const d = new Date(cd.date);
                  if (cd.isRecurring) return d.getMonth() === viewMonth && d.getDate() === day;
                  return d.getFullYear() === viewYear && d.getMonth() === viewMonth && d.getDate() === day;
                });
                const weekdayClosed = hours.find(h => h.dayOfWeek === dow && !h.isOpen);
                return (
                  <div key={day}
                    className={`h-14 border-b border-r border-gray-50 last:border-r-0 flex flex-col items-center justify-start pt-2 px-1 transition-colors ${
                      closed ? "bg-red-50" : "hover:bg-blue-50"
                    }`}>
                    <span className={`w-7 h-7 flex items-center justify-center rounded-full text-sm font-medium ${
                      isToday(day)  ? "bg-blue-600 text-white font-bold"
                      : closed      ? "text-red-400"
                      :               "text-gray-700"
                    }`}>{day}</span>
                    {closedEntry?.reason && (
                      <span className="text-[8px] text-red-500 leading-tight text-center line-clamp-2 mt-0.5">{closedEntry.reason}</span>
                    )}
                    {!closedEntry && weekdayClosed && (
                      <span className="text-[8px] text-gray-300 leading-tight mt-0.5">{t("closed")}</span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className="px-5 py-3 border-t border-gray-100 flex items-center gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-blue-600 inline-block" /> {t("legendToday")}</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-100 inline-block border border-red-200" /> {t("legendClosed")}</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-white inline-block border border-gray-200" /> {t("legendOpen")}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
