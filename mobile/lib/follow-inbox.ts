import type { FollowerRow } from "./social/api";

/** Settings key holding the marker. Local, like every other read state here. */
export const FOLLOWERS_SEEN_KEY = "followers_seen_at";

/**
 * Which new followers count as unseen — the pure half of the follower inbox,
 * so the "is there a dot on the bell" question is testable without a database.
 *
 * The marker is a timestamp rather than a set of ids. Someone who unfollows
 * and follows again is genuinely new news, and a read-id set would swallow it.
 */

/** Followers who arrived after the inbox was last opened. */
export function unseenFollowers(
  followers: FollowerRow[],
  seenAt: string | null
): FollowerRow[] {
  // Never opened: everything is new, but a library imported alongside a
  // hundred existing followers should not open on a hundred-strong badge —
  // the first open sets the marker and that is what the caller does.
  if (!seenAt) return followers;
  return followers.filter((f) => f.followed_at > seenAt);
}

export function hasUnseen(
  followers: FollowerRow[],
  seenAt: string | null
): boolean {
  return unseenFollowers(followers, seenAt).length > 0;
}

/**
 * The marker to store when the inbox is opened.
 *
 * The newest follower's own timestamp, not the clock: a follow that lands
 * between the fetch and the tap is still unread, and stamping "now" would
 * silently mark it read. Falls back to the clock for an empty inbox.
 */
export function seenMarker(
  followers: FollowerRow[],
  now: Date = new Date()
): string {
  return followers[0]?.followed_at ?? now.toISOString();
}
