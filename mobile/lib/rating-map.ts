import type { EpisodeRow } from "./types";

/**
 * A show's crowd ratings, one season at a time.
 *
 * TVmaze's rating is already synced into every episode row and shown nowhere
 * but a decimal on one line. Laid out as a season of coloured tiles it stops
 * being trivia and becomes the shape of the show — the season that collapses,
 * the finale that lands, the stretch nobody liked.
 */

export interface RatingTier {
  /** What people call this band out loud. */
  label: string;
  /** Inclusive floor. */
  min: number;
  color: string;
  /** Text on that colour. */
  ink: string;
}

/**
 * Absolute bands, not a scale fitted to each show.
 *
 * The tile carries its own number, so the colour has to agree with what is
 * printed on it — a 7.5 that renders dark green because this show never does
 * better makes the chart lie to the reader. A relative scale is the right
 * answer only when colour is the sole signal.
 */
export const RATING_TIERS: RatingTier[] = [
  { label: "Awesome", min: 9, color: "#177a45", ink: "#eafff2" },
  { label: "Great", min: 8, color: "#31c46b", ink: "#06240f" },
  { label: "Good", min: 7, color: "#f2ce3a", ink: "#2a2205" },
  { label: "Regular", min: 6, color: "#ef9a2a", ink: "#2a1a03" },
  { label: "Bad", min: 4, color: "#e8544f", ink: "#2b0605" },
  { label: "Garbage", min: 0, color: "#9b59d0", ink: "#f6ecff" },
];

/** Unrated is its own state, not a bad score. */
export const UNRATED = { color: "rgba(255,255,255,0.06)", ink: "#7a80a0" };

export function tierFor(rating: number | null): RatingTier | null {
  if (rating == null) return null;
  return RATING_TIERS.find((t) => rating >= t.min) ?? RATING_TIERS[RATING_TIERS.length - 1];
}

export interface RatingCell {
  episodeId: number;
  season: number;
  number: number;
  name: string;
  rating: number | null;
}

export interface SeasonRatings {
  season: number;
  cells: RatingCell[];
  /** Mean of the rated episodes, or null when none are. */
  average: number | null;
}

export interface RatingMap {
  seasons: SeasonRatings[];
  best: RatingCell | null;
  worst: RatingCell | null;
  rated: number;
}

/**
 * Coverage below this is not a chart, it is a scattering of dots — TVmaze
 * rates unevenly, and mostly-holes reads as a bug rather than as a show with
 * few votes.
 */
export const MIN_COVERAGE = 0.6;
/** And a handful of rated episodes cannot describe a trend at all. */
export const MIN_RATED = 8;

export function hasEnoughRatings(episodes: EpisodeRow[]): boolean {
  if (episodes.length === 0) return false;
  const rated = episodes.filter((e) => e.community_rating != null).length;
  return rated >= MIN_RATED && rated / episodes.length >= MIN_COVERAGE;
}

export function buildRatingMap(episodes: EpisodeRow[]): RatingMap {
  const bySeason = new Map<number, RatingCell[]>();
  for (const ep of episodes) {
    const cell: RatingCell = {
      episodeId: ep.id,
      season: ep.season,
      number: ep.number,
      name: ep.name,
      rating: ep.community_rating,
    };
    if (!bySeason.has(ep.season)) bySeason.set(ep.season, []);
    bySeason.get(ep.season)!.push(cell);
  }

  const seasons: SeasonRatings[] = [...bySeason.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([season, cells]) => {
      const ordered = cells.sort((a, b) => a.number - b.number);
      const rated = ordered.filter((c) => c.rating != null);
      return {
        season,
        cells: ordered,
        average: rated.length
          ? rated.reduce((n, c) => n + (c.rating as number), 0) / rated.length
          : null,
      };
    });

  let best: RatingCell | null = null;
  let worst: RatingCell | null = null;
  let rated = 0;
  for (const { cells } of seasons) {
    for (const c of cells) {
      if (c.rating == null) continue;
      rated++;
      if (!best || c.rating > best.rating!) best = c;
      if (!worst || c.rating < worst.rating!) worst = c;
    }
  }

  return { seasons, best, worst, rated };
}

/**
 * Which season to open on: the one you are watching, else the last that has
 * ratings. Opening on season 1 of a show you are eight seasons into shows you
 * the part you already know.
 */
export function initialSeasonIndex(
  map: RatingMap,
  episodes: EpisodeRow[]
): number {
  const watched = episodes.filter((e) => e.watched_at);
  if (watched.length > 0) {
    const latest = watched.reduce((a, b) =>
      (b.watched_at ?? "") > (a.watched_at ?? "") ? b : a
    );
    const i = map.seasons.findIndex((s) => s.season === latest.season);
    if (i >= 0) return i;
  }
  return Math.max(0, map.seasons.length - 1);
}
