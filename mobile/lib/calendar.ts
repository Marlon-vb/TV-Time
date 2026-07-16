/**
 * Pure month-grid math for the Upcoming calendar view. Sunday-start weeks,
 * padded with the adjacent months' days so every row is exactly 7 cells.
 * No React Native imports — unit-tested in lib/__tests__/calendar.test.ts.
 */

export interface CalendarDay {
  iso: string; // YYYY-MM-DD, local time
  day: number; // 1..31
  inMonth: boolean; // false for the padding days of adjacent months
}

export interface CalendarMonth {
  year: number;
  month: number; // 0-based, matching Date#getMonth
  title: string; // "July 2026"
  weeks: CalendarDay[][]; // rows of exactly 7 days
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** YYYY-MM-DD in *local* time — toISOString would shift the date near midnight. */
export function localDateIso(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** The full grid for a month: leading/trailing pad days included. */
export function monthGrid(year: number, month: number): CalendarMonth {
  const first = new Date(year, month, 1);
  // Rewind to the Sunday on or before the 1st.
  const cursor = new Date(year, month, 1 - first.getDay());
  const weeks: CalendarDay[][] = [];
  do {
    const week: CalendarDay[] = [];
    for (let i = 0; i < 7; i++) {
      week.push({
        iso: localDateIso(cursor),
        day: cursor.getDate(),
        inMonth: cursor.getMonth() === month,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  } while (cursor.getMonth() === month);
  return { year, month, title: `${MONTH_NAMES[month]} ${year}`, weeks };
}

/** Month arithmetic that carries across year boundaries. */
export function shiftMonth(
  year: number,
  month: number,
  delta: number
): { year: number; month: number } {
  const d = new Date(year, month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}
