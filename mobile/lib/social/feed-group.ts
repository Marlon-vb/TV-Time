import type { FeedItem } from "./types";

/**
 * Collapse a backfill burst into one feed row.
 *
 * Marking a whole show or season never publishes activities — those paths go
 * through the silent mirror. What still floods the feed is someone ticking
 * episodes one at a time to bring their library up to date after joining:
 * every tap is a genuine single action, and forty of them in a row bury
 * everyone else's activity for a day.
 *
 * So group rather than drop. "Watched 23 episodes of Breaking Bad" says the
 * same thing in one row, and nothing is hidden.
 */
export interface FeedGroup {
  /** Stable list key — the newest item's id, which is unique per activity. */
  key: string;
  /** The newest activity in the run; carries the author, show and time. */
  item: FeedItem;
  /** How many activities collapsed in. 1 means it renders as itself. */
  count: number;
  /** Oldest activity in the run, for chaining the next comparison onto. */
  oldest: string;
}

/**
 * A run is one sitting. Six hours apart is a different evening, and a show
 * watched an episode a night should read as a week of activity rather than
 * one lump.
 */
const SESSION_GAP_MS = 6 * 60 * 60 * 1000;

/**
 * Only plain watches collapse. A rating, a comment or a finished-show marker
 * each carry something the group line would have to throw away, and none of
 * them arrive forty at a time.
 */
function groupable(item: FeedItem): boolean {
  return item.type === "watched" && item.show_id != null;
}

/** Feed items are newest-first; runs are contiguous within that order. */
export function groupFeed(items: FeedItem[]): FeedGroup[] {
  const out: FeedGroup[] = [];
  for (const item of items) {
    const last = out[out.length - 1];
    if (
      last &&
      groupable(item) &&
      groupable(last.item) &&
      last.item.user_id === item.user_id &&
      last.item.show_id === item.show_id &&
      // Chained against the run's oldest, not its newest: a session extends
      // as long as each step follows the one before it closely enough.
      // Measuring from the newest would cut every run off at six hours no
      // matter how continuous it was.
      Date.parse(last.oldest) - Date.parse(item.created_at) <= SESSION_GAP_MS
    ) {
      last.count += 1;
      last.oldest = item.created_at;
      continue;
    }
    out.push({ key: item.id, item, count: 1, oldest: item.created_at });
  }
  return out;
}

/** "watched 23 episodes of Breaking Bad" — the collapsed row's wording. */
export function groupActivityText(group: FeedGroup): string {
  return `watched ${group.count} episodes of ${group.item.show_name ?? "a show"}`;
}
