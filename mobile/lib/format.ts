/** Pure date/format helpers, safe in both server and client components. */

export function epCode(season: number, number: number): string {
  return `S${String(season).padStart(2, "0")}E${String(number).padStart(2, "0")}`;
}

export function fmtDate(iso: string | null): string {
  if (!iso) return "TBA";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(d.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}),
  });
}

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "Today" / "Tomorrow" / "In 5 days" / "3 days ago" / formatted date. */
export function relativeDay(iso: string | null): string {
  if (!iso) return "TBA";
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round(
    (startOfDay(new Date(iso)) - startOfDay(new Date())) / 86_400_000
  );
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  if (days > 1 && days < 8) return `In ${days} days`;
  if (days < -1 && days > -8) return `${-days} days ago`;
  return fmtDate(iso);
}

/** 4321 minutes → "3 days, 0 hrs" style breakdown. */
export function minutesHuman(totalMinutes: number): {
  months: number;
  days: number;
  hours: number;
} {
  const hoursTotal = Math.floor(totalMinutes / 60);
  const daysTotal = Math.floor(hoursTotal / 24);
  return {
    months: Math.floor(daysTotal / 30),
    days: daysTotal % 30,
    hours: hoursTotal % 24,
  };
}

/**
 * A watch total in one unit, for a stat sitting in a third of a card.
 *
 * The profile's own headline splits into months, days and hours because it has
 * a whole card to do it in. Three of those side by side would wrap, and nobody
 * reads the third unit anyway — the question a profile answers is roughly how
 * deep someone is, not to the hour.
 */
export function watchTimeCompact(totalMinutes: number): string {
  const hours = Math.round(totalMinutes / 60);
  if (hours < 72) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 60) return `${days}d`;
  return `${Math.round(days / 30)}mo`;
}

export function monthLabel(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
    month: "short",
  });
}
