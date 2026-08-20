import { epCode } from "./format";
import { starString } from "./share";

/**
 * The three moments worth turning into an image.
 *
 * Everything here is pure so the wording and the "does this deserve a card"
 * decisions are testable without a renderer. The card itself is drawn by
 * components/ShareCard.tsx from exactly this payload.
 */
export type CardData =
  | {
      kind: "finished";
      showName: string;
      posterUrl: string | null;
      episodes: number;
      minutes: number;
      rating: number | null;
    }
  | {
      kind: "fresh";
      showName: string;
      posterUrl: string | null;
      code: string;
      episodeName: string | null;
      /** "Aired 4 hours ago" — the whole point of this card. */
      airedLine: string;
    }
  | {
      kind: "year";
      year: number;
      episodes: number;
      minutes: number;
      shows: number;
      topGenre: string | null;
      posters: string[];
    };

/**
 * A finish is an ended show with nothing left unwatched. Catching up on a
 * running show is "up to date", which is not the same feeling and would fire
 * this card again every week when the next episode landed.
 */
export function isFinish(input: {
  status: string;
  watchedCount: number;
  unwatchedCount: number;
}): boolean {
  return (
    input.status === "Ended" &&
    input.watchedCount > 0 &&
    input.unwatchedCount === 0
  );
}

/**
 * How long a just-aired episode still counts as news. Beyond this the card
 * stops being "I'm watching along" and starts being "I got round to it",
 * which nobody posts.
 */
export const FRESH_WINDOW_HOURS = 48;

export function isFresh(
  airstamp: string | null,
  now: Date = new Date()
): boolean {
  if (!airstamp) return false;
  const aired = Date.parse(airstamp);
  if (Number.isNaN(aired)) return false;
  const hours = (now.getTime() - aired) / 3_600_000;
  return hours >= 0 && hours <= FRESH_WINDOW_HOURS;
}

/** "Aired 4 hours ago" / "Aired today" / "Aired yesterday". */
export function airedLine(
  airstamp: string,
  now: Date = new Date()
): string {
  const mins = Math.max(0, (now.getTime() - Date.parse(airstamp)) / 60_000);
  if (mins < 60) return "Aired minutes ago";
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Aired ${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "Aired yesterday" : `Aired ${days} days ago`;
}

/** "2 days 4 hours" from a minute count — the finish card's headline number. */
export function watchTimeLine(minutes: number): string {
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  const dayPart = `${days} day${days === 1 ? "" : "s"}`;
  return rest === 0 ? dayPart : `${dayPart} ${rest}h`;
}

/** The line under the share sheet's image, for apps that show text too. */
export function cardShareMessage(card: CardData): string {
  switch (card.kind) {
    case "finished": {
      const stars = card.rating != null ? ` — ${starString(card.rating)}` : "";
      return `Finished ${card.showName}${stars} 🏁`;
    }
    case "fresh":
      return `Just watched ${card.showName} ${card.code} — ${card.airedLine.toLowerCase()} 📺`;
    case "year":
      return `My ${card.year} in TV: ${card.episodes} episodes, ${watchTimeLine(card.minutes)} watched 📺`;
  }
}

/** Filename inside the share sheet; some targets show it. */
export function cardFileName(card: CardData): string {
  const slug = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "tv-app";
  switch (card.kind) {
    case "finished":
      return `finished-${slug(card.showName)}.png`;
    case "fresh":
      return `${slug(card.showName)}-${card.code.toLowerCase()}.png`;
    case "year":
      return `my-${card.year}-in-tv.png`;
  }
}

/** Build the fresh-episode card from a local episode row. */
export function freshCard(
  show: { name: string; poster_url: string | null },
  ep: { season: number; number: number; name: string; airstamp: string | null },
  now: Date = new Date()
): CardData | null {
  if (!ep.airstamp || !isFresh(ep.airstamp, now)) return null;
  return {
    kind: "fresh",
    showName: show.name,
    posterUrl: show.poster_url,
    code: epCode(ep.season, ep.number),
    episodeName: ep.name || null,
    airedLine: airedLine(ep.airstamp, now),
  };
}
