import { epCode } from "./format";
import type { WatchNextItem } from "./types";

/**
 * The shape written to the shared App Group and read by the iOS widget.
 * Kept tiny and self-contained (no images) so the widget renders instantly.
 */
export interface WidgetItem {
  id: number;
  show: string;
  code: string; // "S02E05"
  detail: string; // "Aired 2 days ago"
}

export interface WidgetPayload {
  updatedAt: string;
  count: number; // total aired-unwatched episodes across the backlog
  items: WidgetItem[]; // the first few shows to catch up on
}

/** Deterministic "Aired …" label (own impl so it takes an injectable now). */
export function airedLabel(iso: string | null, now: Date): string {
  if (!iso) return "";
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round(
    (startOfDay(now) - startOfDay(new Date(iso))) / 86_400_000
  );
  if (days <= 0) return "Aired today";
  if (days === 1) return "Aired yesterday";
  if (days < 8) return `Aired ${days} days ago`;
  if (days < 14) return "Aired 1 week ago";
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `Aired ${weeks} weeks ago`;
  return "Aired a while ago";
}

/** Build the widget payload from the Up Next backlog. Pure and testable. */
export function buildWidgetPayload(
  items: WatchNextItem[],
  now: Date = new Date(),
  max = 4
): WidgetPayload {
  const count = items.reduce((n, i) => n + i.aired_unwatched, 0);
  return {
    updatedAt: now.toISOString(),
    count,
    items: items.slice(0, max).map((i) => ({
      id: i.episode.id,
      show: i.show.name,
      code: epCode(i.episode.season, i.episode.number),
      detail: airedLabel(i.episode.airstamp, now),
    })),
  };
}
