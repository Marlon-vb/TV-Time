import { getSetting, setSetting } from "./db";
import * as repo from "./repo";
import * as social from "./social/api";
import { getShow } from "./tvmaze";
import { trendingEpisodeRows, trendingRows } from "./trending-core";
import type { TrendingEpisode, TrendingShow } from "./social/api";

export type { TrendingEpisode, TrendingShow } from "./social/api";

/**
 * "Trending this week" on Discover — what TV App's own users actually watched
 * in the last seven days, rolling.
 *
 * Ranked by distinct watchers rather than episode count, so the list is a
 * measure of how many people a show reached rather than how hard one person
 * binged it. The window reads the episode's own watch date, not when the row
 * reached the server, so importing a decade of history does not register as a
 * decade watched this week.
 *
 * Cached for six hours. A seven-day window barely moves in six hours, and the
 * alternative is two RPCs plus artwork hydration every time Discover opens.
 */

const CACHE_KEY = "trending_cache_v1";
const TTL_MS = 6 * 60 * 60 * 1000;
export const WINDOW_DAYS = 7;

/** Artwork the RPC could not borrow from an activity, filled in per open. */
const MAX_HYDRATIONS = 6;

export interface Trending {
  shows: TrendingShow[];
  episodes: TrendingEpisode[];
}

const EMPTY: Trending = { shows: [], episodes: [] };

/**
 * Names and posters for rows the server had none for.
 *
 * Local first — a show already in the library needs no request at all — then
 * TVmaze for the rest, capped, because a Discover rail must not cost twenty
 * round trips. Rows still missing artwork after this are dropped rather than
 * rendered as grey rectangles.
 */
async function hydrate<T extends { show_id: number; show_name: string | null; poster_url: string | null }>(
  rows: T[]
): Promise<T[]> {
  let spent = 0;
  const out: T[] = [];
  for (const r of rows) {
    if (r.poster_url && r.show_name) {
      out.push(r);
      continue;
    }
    const local = repo.getShowRow(r.show_id);
    if (local) {
      out.push({ ...r, show_name: local.name, poster_url: local.poster_url });
      continue;
    }
    if (spent >= MAX_HYDRATIONS) continue;
    spent++;
    const remote = await getShow(r.show_id).catch(() => null);
    if (remote?.posterUrl) {
      out.push({ ...r, show_name: remote.name, poster_url: remote.posterUrl });
    }
  }
  return out;
}

export async function trending(force = false): Promise<Trending> {
  if (!force) {
    try {
      const raw = getSetting(CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as { at: string; data: Trending };
        if (Date.now() - Date.parse(cached.at) < TTL_MS) return cached.data;
      }
    } catch {
      /* stale/corrupt cache — refetch */
    }
  }

  try {
    const [rawShows, rawEpisodes] = await Promise.all([
      social.trendingShows(WINDOW_DAYS),
      social.trendingEpisodes(WINDOW_DAYS),
    ]);
    // Gate before hydrating: a rail that will not be shown should not spend
    // requests on artwork for it.
    const shows = trendingRows(rawShows);
    const episodes = trendingEpisodeRows(rawEpisodes);
    if (shows.length === 0 && episodes.length === 0) return EMPTY;

    const data: Trending = {
      shows: await hydrate(shows),
      episodes: await hydrate(episodes),
    };
    try {
      setSetting(
        CACHE_KEY,
        JSON.stringify({ at: new Date().toISOString(), data })
      );
    } catch {
      /* cache is best-effort */
    }
    return data;
  } catch {
    return EMPTY;
  }
}
