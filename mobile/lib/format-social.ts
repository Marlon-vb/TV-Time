import type { FeedItem } from "./social/types";

/** Human sentence for a feed activity. Pure so it's unit-testable. */
export function feedActivityText(item: FeedItem): string {
  const code =
    item.season != null && item.episode != null
      ? ` S${String(item.season).padStart(2, "0")}E${String(item.episode).padStart(2, "0")}`
      : "";
  switch (item.type) {
    case "rated":
      return `rated ${item.show_name ?? "a show"}${code}${
        item.rating != null ? ` ${item.rating}★` : ""
      }`;
    case "finished":
      return `finished ${item.show_name ?? "a show"}`;
    case "started":
      return `started ${item.show_name ?? "a show"}`;
    case "commented":
      return `commented on ${item.show_name ?? "a show"}${code}`;
    case "watched":
    default:
      return `watched ${item.show_name ?? "a show"}${code}`;
  }
}

/** Compact relative time: "now", "5m", "3h", "2d", "3w". */
export function shortAgo(iso: string, now: Date = new Date()): string {
  const secs = Math.max(0, (now.getTime() - Date.parse(iso)) / 1000);
  if (secs < 60) return "now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

/**
 * Comment ordering: most upvoted first, newest as the tiebreak.
 *
 * Sorted on the client because the vote count comes from an embedded join,
 * which PostgREST cannot order by. Pure so it's unit-testable.
 */
export function byTopThenNewest(
  a: { upvotes: number; created_at: string },
  b: { upvotes: number; created_at: string }
): number {
  return (
    b.upvotes - a.upvotes || Date.parse(b.created_at) - Date.parse(a.created_at)
  );
}
