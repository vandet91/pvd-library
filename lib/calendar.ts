import { prisma } from "@/lib/prisma";

/**
 * Fetch all data needed for open-day calculations in one round-trip.
 * Returns a set of closed date strings ("YYYY-MM-DD") and a set of
 * open day-of-week numbers (0=Sun … 6=Sat).
 */
async function getCalendarData(from: Date, to: Date): Promise<{
  closedDates: Set<string>;
  openWeekdays: Set<number>;
}> {
  const [hours, closed] = await Promise.all([
    prisma.libraryHours.findMany(),
    prisma.closedDay.findMany({
      where: {
        OR: [
          // Specific dates within range
          { date: { gte: startOfDay(from), lte: endOfDay(to) }, isRecurring: false },
          // Recurring holidays — fetch all, filter by month/day below
          { isRecurring: true },
        ],
      },
    }),
  ]);

  // Open weekdays — default all open if no rows configured yet
  const openWeekdays: Set<number> =
    hours.length === 0
      ? new Set([0, 1, 2, 3, 4, 5, 6])
      : new Set(hours.filter((h) => h.isOpen).map((h) => h.dayOfWeek));

  // Build closed date set
  const closedDates = new Set<string>();
  for (const cd of closed) {
    if (cd.isRecurring) {
      // Expand recurring holiday for every year in [from, to]
      const fromYear = from.getFullYear();
      const toYear   = to.getFullYear();
      for (let y = fromYear; y <= toYear; y++) {
        const d = new Date(y, cd.date.getMonth(), cd.date.getDate());
        closedDates.add(toDateStr(d));
      }
    } else {
      closedDates.add(toDateStr(cd.date));
    }
  }

  return { closedDates, openWeekdays };
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function startOfDay(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function endOfDay(d: Date):   Date { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59); }

function isOpenDay(d: Date, openWeekdays: Set<number>, closedDates: Set<string>): boolean {
  return openWeekdays.has(d.getDay()) && !closedDates.has(toDateStr(d));
}

/**
 * Advance `from` by `openDays` open days (skipping closed days & weekends).
 * Used when calculating loan due dates.
 */
export async function addOpenDays(from: Date, openDays: number): Promise<Date> {
  if (openDays <= 0) return new Date(from);

  // Pre-fetch calendar data for a window of 3× the days (generous buffer)
  const windowEnd = new Date(from);
  windowEnd.setDate(windowEnd.getDate() + openDays * 3 + 30);

  const { closedDates, openWeekdays } = await getCalendarData(from, windowEnd);

  let current = startOfDay(new Date(from));
  let counted = 0;
  while (counted < openDays) {
    current.setDate(current.getDate() + 1);
    if (isOpenDay(current, openWeekdays, closedDates)) counted++;
    // Safety: never loop more than 365 days
    if (counted > 365) break;
  }
  // Return with time set to end of day (23:59:59) to match existing due date logic
  return new Date(current.getFullYear(), current.getMonth(), current.getDate(), 23, 59, 59);
}

/**
 * Count open days between `dueDate` and `returnDate` (exclusive of dueDate itself).
 * Used to calculate fine days — only charges for days the library was actually open.
 */
export async function countOpenDaysLate(dueDate: Date, returnDate: Date): Promise<number> {
  const due    = startOfDay(dueDate);
  const ret    = startOfDay(returnDate);
  if (ret <= due) return 0;

  const { closedDates, openWeekdays } = await getCalendarData(due, ret);

  let count   = 0;
  const cursor = new Date(due);
  cursor.setDate(cursor.getDate() + 1); // start day after due date

  while (cursor <= ret) {
    if (isOpenDay(cursor, openWeekdays, closedDates)) count++;
    cursor.setDate(cursor.getDate() + 1);
    if (count > 3650) break; // safety
  }
  return count;
}

/**
 * Calendar-aware fine calculation.
 * Returns { daysLate, amount } where daysLate only counts open library days.
 */
export async function calculateFineWithCalendar(
  dueDate: Date,
  returnDate: Date,
  finePerDay: number,
): Promise<{ daysLate: number; amount: number }> {
  const daysLate = await countOpenDaysLate(dueDate, returnDate);
  return { daysLate, amount: Math.round(daysLate * finePerDay * 100) / 100 };
}
