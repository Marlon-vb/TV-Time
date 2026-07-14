import type { WatchNextItem } from "./types";
import { sectionForItem } from "./watchNextSections";

/**
 * "What should I watch tonight?" — pick one episode from the backlog with
 * a human reason. Pure: pass Math.random (or a seeded rand in tests).
 */
export interface TonightPick {
  item: WatchNextItem;
  reason: string;
}

export function pickTonight(
  items: WatchNextItem[],
  rand: () => number,
  now: Date = new Date(),
  excludeEpisodeId?: number
): TonightPick | null {
  let pool = items;
  if (excludeEpisodeId != null && items.length > 1) {
    pool = items.filter((i) => i.episode.id !== excludeEpisodeId);
  }
  if (pool.length === 0) return null;

  const item = pool[Math.floor(rand() * pool.length) % pool.length];
  return { item, reason: reasonFor(item, now) };
}

function reasonFor(item: WatchNextItem, now: Date): string {
  const section = sectionForItem(item, now);
  if (section === "not_started") {
    return "You followed this but never started it — tonight's the night";
  }
  if (section === "idle" && item.last_watched_at) {
    const weeks = Math.max(
      1,
      Math.round(
        (now.getTime() - Date.parse(item.last_watched_at)) / (7 * 86_400_000)
      )
    );
    return `It's been ${weeks === 1 ? "a week" : `${weeks} weeks`} since you watched ${item.show.name}`;
  }
  if (item.aired_unwatched === 1) {
    return "Just one episode and you're fully caught up";
  }
  if (item.aired_unwatched <= 3) {
    return `Only ${item.aired_unwatched} episodes to catch up`;
  }
  const runtime = item.episode.runtime ?? item.show.runtime;
  if (runtime != null && runtime <= 30) {
    return `A quick one — just ${runtime} minutes`;
  }
  return `Continue ${item.show.name} where you left off`;
}
