import { getSetting } from "./db";
import * as mock from "./mock";

/**
 * Optional TMDB enrichment (https://developer.themoviedb.org).
 * When an API key is configured in Settings, followed shows get nicer
 * posters/backdrops, and the importer can resolve TVDB episode ids exactly.
 * Supports both v3 API keys and v4 read-access tokens.
 */

const BASE = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p";
const MOCK = process.env.TV_API_MOCK === "1";

function getKey(): string | null {
  return getSetting("tmdb_api_key");
}

export function tmdbConfigured(): boolean {
  return MOCK ? true : Boolean(getKey());
}

async function tmdbFetch(pathname: string): Promise<unknown | null> {
  const key = getKey();
  if (!key) return null;
  const isV4Token = key.startsWith("ey"); // v4 tokens are JWTs
  const sep = pathname.includes("?") ? "&" : "?";
  const url = isV4Token
    ? `${BASE}${pathname}`
    : `${BASE}${pathname}${sep}api_key=${encodeURIComponent(key)}`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        ...(isV4Token ? { Authorization: `Bearer ${key}` } : {}),
      },
    });
    if (res.status === 404) return null;
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new Error(`TMDB HTTP ${res.status}`);
    return res.json();
  }
}

export async function testKey(key: string): Promise<boolean> {
  if (MOCK) return key.length > 0;
  const isV4Token = key.startsWith("ey");
  const url = isV4Token
    ? `${BASE}/configuration`
    : `${BASE}/configuration?api_key=${encodeURIComponent(key)}`;
  try {
    const res = await fetch(url, {
      headers: isV4Token ? { Authorization: `Bearer ${key}` } : {},
    });
    return res.ok;
  } catch {
    return false;
  }
}

export interface TmdbArtwork {
  tmdbId: number;
  posterUrl: string | null;
  backdropUrl: string | null;
}

/**
 * Find a show on TMDB by IMDb or TVDB id and return richer artwork.
 * Returns null when TMDB isn't configured or the show isn't found.
 */
export async function findShowArtwork(
  imdbId: string | null,
  tvdbId: number | null
): Promise<TmdbArtwork | null> {
  if (MOCK) return null; // mock universe uses local poster art
  if (!tmdbConfigured()) return null;
  try {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    let tv: any = null;
    if (imdbId) {
      const data = (await tmdbFetch(
        `/find/${imdbId}?external_source=imdb_id`
      )) as any;
      tv = data?.tv_results?.[0] ?? null;
    }
    if (!tv && tvdbId) {
      const data = (await tmdbFetch(
        `/find/${tvdbId}?external_source=tvdb_id`
      )) as any;
      tv = data?.tv_results?.[0] ?? null;
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */
    if (!tv) return null;
    return {
      tmdbId: tv.id,
      posterUrl: tv.poster_path ? `${IMG}/w500${tv.poster_path}` : null,
      backdropUrl: tv.backdrop_path ? `${IMG}/w1280${tv.backdrop_path}` : null,
    };
  } catch {
    return null; // enrichment is best-effort
  }
}

export interface TvdbEpisodePosition {
  season: number;
  number: number;
}

/**
 * Resolve a TVDB *episode* id (what TV Time exports use) to its
 * season/episode position, via TMDB's external-id find endpoint.
 */
export async function findEpisodeByTvdbId(
  tvdbEpisodeId: number
): Promise<TvdbEpisodePosition | null> {
  if (MOCK) {
    const hit = mock.findEpisodeByTvdbId(tvdbEpisodeId);
    return hit ? { season: hit.season, number: hit.number } : null;
  }
  if (!tmdbConfigured()) return null;
  try {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const data = (await tmdbFetch(
      `/find/${tvdbEpisodeId}?external_source=tvdb_id`
    )) as any;
    const ep = data?.tv_episode_results?.[0];
    if (!ep || ep.season_number == null || ep.episode_number == null)
      return null;
    return { season: ep.season_number, number: ep.episode_number };
  } catch {
    return null;
  }
}
