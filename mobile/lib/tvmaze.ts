import type { RemoteEpisode, RemoteShow } from "./types";

/** TVmaze client (https://www.tvmaze.com/api). Free, no API key. */

const BASE = "https://api.tvmaze.com";

async function tvFetch(pathname: string): Promise<unknown | null> {
  const url = `${BASE}${pathname}`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (res.status === 404) return null;
    // TVmaze rate limit is ~20 requests / 10 s per IP; back off and retry.
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new Error(`TVmaze HTTP ${res.status}`);
    return res.json();
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapShow(s: any): RemoteShow {
  return {
    id: s.id,
    name: s.name,
    tvdbId: s.externals?.thetvdb ?? null,
    imdbId: s.externals?.imdb ?? null,
    posterUrl: s.image?.original ?? s.image?.medium ?? null,
    backdropUrl: null,
    status: s.status ?? "",
    network: s.network?.name ?? s.webChannel?.name ?? null,
    runtime: s.averageRuntime ?? s.runtime ?? null,
    premiered: s.premiered ?? null,
    genres: Array.isArray(s.genres) ? s.genres : [],
    summary: stripHtml(s.summary),
  };
}

function mapEpisode(e: any): RemoteEpisode | null {
  if (e.number == null) return null; // skip specials
  return {
    id: e.id,
    season: e.season,
    number: e.number,
    name: e.name ?? "",
    airdate: e.airdate || null,
    airstamp: e.airstamp || null,
    runtime: e.runtime ?? null,
    summary: stripHtml(e.summary),
    imageUrl: e.image?.medium ?? e.image?.original ?? null,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function stripHtml(html: unknown): string | null {
  if (typeof html !== "string" || !html) return null;
  return html.replace(/<[^>]*>/g, "").trim() || null;
}

export async function searchShows(query: string): Promise<RemoteShow[]> {
  const data = (await tvFetch(
    `/search/shows?q=${encodeURIComponent(query)}`
  )) as Array<{ show: unknown }> | null;
  return (data ?? []).map((r) => mapShow(r.show));
}

export async function getShowWithEpisodes(
  id: number
): Promise<{ show: RemoteShow; episodes: RemoteEpisode[] } | null> {
  const data = (await tvFetch(`/shows/${id}?embed[]=episodes`)) as {
    _embedded?: { episodes?: unknown[] };
  } | null;
  if (!data) return null;
  const episodes = (data._embedded?.episodes ?? [])
    .map(mapEpisode)
    .filter((e): e is RemoteEpisode => e !== null);
  return { show: mapShow(data), episodes };
}

export async function lookupByTvdb(tvdbId: number): Promise<RemoteShow | null> {
  const data = await tvFetch(`/lookup/shows?thetvdb=${tvdbId}`);
  return data ? mapShow(data) : null;
}

export async function singleSearch(name: string): Promise<RemoteShow | null> {
  const data = await tvFetch(
    `/singlesearch/shows?q=${encodeURIComponent(name)}`
  );
  return data ? mapShow(data) : null;
}
