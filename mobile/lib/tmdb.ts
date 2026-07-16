import { getSetting } from "./db";

/**
 * Optional TMDB enrichment: nicer artwork for followed shows and exact
 * TVDB-episode-id resolution for classic TV Time imports. Configure a v3
 * API key or v4 read token in Settings.
 */

const BASE = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p";

function getKey(): string | null {
  return getSetting("tmdb_api_key");
}

export function tmdbConfigured(): boolean {
  return Boolean(getKey());
}

/** Low-level GET against the configured TMDB account; null when unconfigured. */
export async function tmdbGet(pathname: string): Promise<unknown | null> {
  if (!getKey()) return null;
  return tmdbFetch(pathname);
}

async function tmdbFetch(pathname: string): Promise<unknown | null> {
  const key = getKey();
  if (!key) return null;
  const isV4Token = key.startsWith("ey");
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

export async function findShowArtwork(
  imdbId: string | null,
  tvdbId: number | null
): Promise<TmdbArtwork | null> {
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
    return null;
  }
}

export async function findEpisodeByTvdbId(
  tvdbEpisodeId: number
): Promise<{ season: number; number: number } | null> {
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
