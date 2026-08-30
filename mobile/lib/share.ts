import { epCode } from "./format";

/** Text for the native share sheet (pure, unit-tested). */

/** Where the website lives. Profile links resolve under it. */
export const SITE = "https://tvapp.montyinc.net";

/**
 * The link to somebody's profile, for sharing.
 *
 * https rather than the tvtime:// scheme the app registers. A custom scheme is
 * not a link anywhere it gets pasted — WhatsApp and iMessage render it as
 * plain text nobody can tap — and on a phone without the app it resolves to
 * nothing at all. This lands on a page that offers to open the app, and the
 * App Store to anyone who has not got it yet.
 */
export function profileUrl(username: string): string {
  return `${SITE}/u/${encodeURIComponent(username)}`;
}

/** The message that carries it. */
export function inviteMessage(username: string): string {
  return `Follow me on TV App — I'm @${username}. ${profileUrl(username)}`;
}

export function episodeShareMessage(input: {
  showName: string;
  season: number;
  number: number;
  episodeName?: string | null;
  rating?: number | null;
  watched: boolean;
}): string {
  const code = epCode(input.season, input.number);
  const title = input.episodeName ? ` — “${input.episodeName}”` : "";
  const stars =
    input.rating != null ? ` · rated ${starString(input.rating)}` : "";
  return input.watched
    ? `Just watched ${input.showName} ${code}${title}${stars}`
    : `Up next for me: ${input.showName} ${code}${title}`;
}

/** "★★★★½" for a 0.5–5 rating. */
export function starString(rating: number): string {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  return "★".repeat(full) + (half ? "½" : "");
}

export function showShareMessage(input: {
  showName: string;
  watched: number;
  total: number;
}): string {
  if (input.watched === 0) {
    return `Just started following ${input.showName} 📺`;
  }
  if (input.total > 0 && input.watched >= input.total) {
    return `Finished ${input.showName} — all ${input.total} episodes 🏁`;
  }
  return `I'm ${input.watched}/${input.total} episodes into ${input.showName} 📺`;
}
