import type { WatchNextItem } from "./types";

/**
 * TV Time's Watch Next buckets:
 *  - up_next:      shows you're actively watching with new episodes waiting
 *  - idle:         shows you've started but haven't touched in a while
 *  - not_started:  shows you followed but never began
 */
export type WatchNextSectionKey = "up_next" | "idle" | "not_started";

export const IDLE_AFTER_DAYS = 30;

export const SECTION_TITLES: Record<WatchNextSectionKey, string> = {
  up_next: "Up next",
  idle: "Haven't watched in a while",
  not_started: "Haven't started",
};

export function sectionForItem(
  item: Pick<WatchNextItem, "watched_count" | "last_watched_at">,
  now: Date,
  idleAfterDays = IDLE_AFTER_DAYS
): WatchNextSectionKey {
  if (item.watched_count === 0) return "not_started";
  if (
    item.last_watched_at &&
    now.getTime() - Date.parse(item.last_watched_at) >
      idleAfterDays * 86_400_000
  ) {
    return "idle";
  }
  return "up_next";
}

export interface WatchNextSection {
  key: WatchNextSectionKey;
  title: string;
  data: WatchNextItem[];
}

/**
 * Group and order items: Up next keeps freshest-aired-first order, idle
 * shows surface the most-neglected first, not-started keeps input order.
 * Empty sections are dropped.
 */
export function groupWatchNext(
  items: WatchNextItem[],
  now: Date,
  idleAfterDays = IDLE_AFTER_DAYS
): WatchNextSection[] {
  const buckets: Record<WatchNextSectionKey, WatchNextItem[]> = {
    up_next: [],
    idle: [],
    not_started: [],
  };
  for (const item of items) {
    buckets[sectionForItem(item, now, idleAfterDays)].push(item);
  }
  buckets.idle.sort((a, b) =>
    (a.last_watched_at ?? "").localeCompare(b.last_watched_at ?? "")
  );
  return (["up_next", "idle", "not_started"] as const)
    .filter((key) => buckets[key].length > 0)
    .map((key) => ({ key, title: SECTION_TITLES[key], data: buckets[key] }));
}
