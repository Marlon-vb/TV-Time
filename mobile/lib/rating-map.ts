import type { EpisodeRow } from "./types";

/**
 * The episode rating heat-map — the grid people screenshot when a show falls
 * off a cliff in season 6.
 *
 * TVmaze's crowd rating is already synced into every episode row and shown
 * nowhere but a number on one line. Laid out as a grid it stops being trivia
 * and becomes the shape of the show.
 */

export interface RatingCell {
  episodeId: number;
  season: number;
  number: number;
  name: string;
  rating: number | null;
  /** 0–1 across this show's own range, for colour. Null when unrated. */
  heat: number | null;
}

export interface RatingMap {
  seasons: { season: number; cells: RatingCell[] }[];
  /** Widest season, so every row can share one column width. */
  widest: number;
  low: number;
  high: number;
  best: RatingCell | null;
  worst: RatingCell | null;
  rated: number;
}

/**
 * Coverage below this is not a map, it is a scattering of dots — TVmaze rates
 * unevenly, and a grid that is mostly holes reads as a bug rather than a
 * show with few votes.
 */
export const MIN_COVERAGE = 0.6;
/** And a handful of rated episodes cannot describe a trend at all. */
export const MIN_RATED = 8;

export function hasEnoughRatings(episodes: EpisodeRow[]): boolean {
  if (episodes.length === 0) return false;
  const rated = episodes.filter((e) => e.community_rating != null).length;
  return rated >= MIN_RATED && rated / episodes.length >= MIN_COVERAGE;
}

/**
 * Heat is scaled to the show's own range, not to 0–10.
 *
 * Crowd ratings cluster: a well-liked show may run from 7.4 to 9.1 and never
 * touch either end of the absolute scale, so an absolute scale paints it one
 * flat colour and hides exactly the variation the map exists to show. The
 * floor on the range keeps a show whose episodes are nearly identical from
 * being stretched into fake drama.
 */
export const MIN_RANGE = 1.2;

export function buildRatingMap(episodes: EpisodeRow[]): RatingMap {
  const rated = episodes.filter((e) => e.community_rating != null);
  const values = rated.map((e) => e.community_rating as number);
  const low = values.length ? Math.min(...values) : 0;
  const high = values.length ? Math.max(...values) : 0;
  const span = Math.max(high - low, MIN_RANGE);

  const bySeason = new Map<number, RatingCell[]>();
  for (const ep of episodes) {
    const rating = ep.community_rating;
    const cell: RatingCell = {
      episodeId: ep.id,
      season: ep.season,
      number: ep.number,
      name: ep.name,
      rating,
      heat: rating == null ? null : clamp01((rating - low) / span),
    };
    if (!bySeason.has(ep.season)) bySeason.set(ep.season, []);
    bySeason.get(ep.season)!.push(cell);
  }

  const seasons = [...bySeason.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([season, cells]) => ({
      season,
      cells: cells.sort((a, b) => a.number - b.number),
    }));

  let best: RatingCell | null = null;
  let worst: RatingCell | null = null;
  for (const { cells } of seasons) {
    for (const c of cells) {
      if (c.rating == null) continue;
      if (!best || c.rating > best.rating!) best = c;
      if (!worst || c.rating < worst.rating!) worst = c;
    }
  }

  return {
    seasons,
    widest: seasons.reduce((n, s) => Math.max(n, s.cells.length), 0),
    low,
    high,
    best,
    worst,
    rated: rated.length,
  };
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
