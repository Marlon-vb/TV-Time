import type { TrendingEpisode, TrendingShow } from "./social/api";

/**
 * Pure gating for the trending rails — no native imports, so the "is this
 * actually a trend" decisions are testable without a database. The fetching
 * and artwork hydration live in trending.ts.
 */

/**
 * How many DIFFERENT people have to watch something before it counts.
 *
 * The RPC already counts distinct users rather than rows, so a binge cannot
 * inflate one show and an import cannot vote for a whole library. What this
 * guards is the other failure: with a young user base, one person watching one
 * obscure show is not a trend, and a rail full of those reads as an empty app
 * pretending otherwise.
 */
export const MIN_WATCHERS = 3;

/**
 * And how many entries have to clear that bar before the rail is worth
 * showing at all. Two posters under a "Trending this week" heading looks worse
 * than no heading.
 */
export const MIN_ROWS = 4;

/** Trending shows worth rendering, or an empty list meaning "hide the rail". */
export function trendingRows(
  rows: TrendingShow[],
  limit = 20
): TrendingShow[] {
  const worthy = rows.filter((r) => r.watchers >= MIN_WATCHERS);
  return worthy.length >= MIN_ROWS ? worthy.slice(0, limit) : [];
}

/**
 * The same bar for episodes, and one entry per show.
 *
 * A show mid-season puts its whole run in the window, so without this the list
 * is one series' episodes 1-8 and nothing else — true, and useless as a list
 * of what the week's biggest episodes were. Rows arrive watcher-desc, so the
 * first one kept per show is that show's biggest.
 */
export function trendingEpisodeRows(
  rows: TrendingEpisode[],
  limit = 6
): TrendingEpisode[] {
  const worthy = rows.filter((r) => r.watchers >= MIN_WATCHERS);
  if (worthy.length < MIN_ROWS) return [];
  const seen = new Set<number>();
  const out: TrendingEpisode[] = [];
  for (const r of worthy) {
    if (seen.has(r.show_id)) continue;
    seen.add(r.show_id);
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}

/** "412 watching" / "1 watching" — the only number these rails show. */
export function watchersLine(n: number): string {
  return `${n.toLocaleString()} watching`;
}
