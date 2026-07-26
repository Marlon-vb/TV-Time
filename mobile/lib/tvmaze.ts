import type { RemoteEpisode, RemoteShow } from "./types";

/** TVmaze client (https://www.tvmaze.com/api). Free, no API key. */

const BASE = "https://api.tvmaze.com";

async function tvFetch(pathname: string): Promise<unknown | null> {
  const url = `${BASE}${pathname}`;
  for (let attempt = 0; ; attempt++) {
    // Hard timeout: a stalled connection must fail fast, not hang a
    // pull-to-refresh spinner indefinitely.
    const abort = new AbortController();
    const kill = setTimeout(() => abort.abort(), 15_000);
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: abort.signal,
      });
    } finally {
      clearTimeout(kill);
    }
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
    imageUrl: e.image?.original ?? e.image?.medium ?? null,
    rating: typeof e.rating?.average === "number" ? e.rating.average : null,
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

/**
 * Series premieres (season 1, episode 1) scheduled over the next few weeks,
 * across both broadcast (US) and streaming — so you can follow a show before
 * it airs and get notified the moment it drops. Key-free: scans TVmaze's daily
 * schedule. Caller caches the result.
 */
export async function getPremieringSoon(
  days = 14,
  limit = 12
): Promise<RemoteShow[]> {
  const start = new Date();
  const urls: string[] = [];
  for (let i = 0; i < days; i++) {
    const date = new Date(start.getTime() + i * 86_400_000)
      .toISOString()
      .slice(0, 10);
    urls.push(`/schedule?country=US&date=${date}`); // broadcast + cable
    urls.push(`/schedule/web?date=${date}`); // streaming (global)
  }
  const byShow = new Map<number, { show: RemoteShow; weight: number }>();
  const width = 3;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  for (let i = 0; i < urls.length; i += width) {
    const batch = await Promise.all(
      urls.slice(i, i + width).map((u) => tvFetch(u).catch(() => null))
    );
    for (const entries of batch) {
      if (!Array.isArray(entries)) continue;
      for (const entry of entries as any[]) {
        // A series premiere is the very first episode.
        if (entry?.season !== 1 || entry?.number !== 1) continue;
        const s = entry?._embedded?.show ?? entry?.show; // web vs broadcast shape
        if (!s?.id || byShow.has(s.id)) continue;
        // Use the scheduled premiere date (more reliable than show.premiered,
        // which is often null for not-yet-aired shows).
        const show = mapShow(s);
        byShow.set(s.id, {
          show: { ...show, premiered: entry.airdate || show.premiered },
          weight: typeof s.weight === "number" ? s.weight : 0,
        });
      }
    }
    if (i + width < urls.length) {
      await new Promise((r) => setTimeout(r, 1200));
    }
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */
  return [...byShow.values()]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit)
    .map((e) => e.show)
    .filter((s) => s.posterUrl);
}

export interface CastMember {
  characterId: number;
  characterName: string;
  personName: string;
  image: string | null;
}

/** A single show without episodes — light hydration for recommendations. */
export async function getShow(id: number): Promise<RemoteShow | null> {
  const data = await tvFetch(`/shows/${id}`);
  return data ? mapShow(data) : null;
}

/**
 * Popular shows airing today (TVmaze schedule, ranked by its crowd-derived
 * weight). Gives Discover something alive before a user follows anything.
 */
export async function getAiringToday(limit = 12): Promise<RemoteShow[]> {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const data = (await tvFetch(`/schedule?country=US`)) as any[] | null;
  if (!data) return [];
  const byShow = new Map<number, { show: RemoteShow; weight: number }>();
  for (const entry of data) {
    const s = entry?.show;
    if (!s?.id || byShow.has(s.id)) continue;
    byShow.set(s.id, {
      show: mapShow(s),
      weight: typeof s.weight === "number" ? s.weight : 0,
    });
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */
  return [...byShow.values()]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit)
    .map((e) => e.show)
    .filter((s) => s.posterUrl);
}

export interface RatedShow {
  show: RemoteShow;
  imdb: number; // IMDb rating, 0–10
}

/**
 * The canonical IMDb top-rated TV series. IMDb has no free API, so the ratings
 * are bundled here (they're stable to ±0.1 over years); each title is resolved
 * to a live TVmaze show at runtime purely for its poster and navigation.
 * Sorted highest-first.
 */
const IMDB_TOP: { title: string; imdb: number }[] = [
  { title: "Breaking Bad", imdb: 9.5 },
  { title: "Planet Earth II", imdb: 9.4 },
  { title: "Band of Brothers", imdb: 9.4 },
  { title: "Chernobyl", imdb: 9.3 },
  { title: "The Wire", imdb: 9.3 },
  { title: "Avatar: The Last Airbender", imdb: 9.3 },
  { title: "Game of Thrones", imdb: 9.2 },
  { title: "The Sopranos", imdb: 9.2 },
  { title: "Sherlock", imdb: 9.1 },
  { title: "Rick and Morty", imdb: 9.1 },
  { title: "Better Call Saul", imdb: 9.0 },
  { title: "The Office", imdb: 9.0 },
  { title: "True Detective", imdb: 8.9 },
  { title: "Succession", imdb: 8.9 },
];

/**
 * Resolve the IMDb top-rated canon to real TVmaze shows (with posters).
 * Rate-limit-friendly: small concurrent batches with a pause between waves.
 */
export async function getTopRated(): Promise<RatedShow[]> {
  const out: RatedShow[] = [];
  const width = 3;
  for (let i = 0; i < IMDB_TOP.length; i += width) {
    const batch = await Promise.all(
      IMDB_TOP.slice(i, i + width).map(async (entry) => {
        const show = await singleSearch(entry.title).catch(() => null);
        return show && show.posterUrl ? { show, imdb: entry.imdb } : null;
      })
    );
    for (const r of batch) if (r) out.push(r);
    if (i + width < IMDB_TOP.length) {
      await new Promise((r) => setTimeout(r, 1200));
    }
  }
  // A title could resolve to a show already present — keep the first (highest).
  const seen = new Set<number>();
  return out.filter((r) =>
    seen.has(r.show.id) ? false : (seen.add(r.show.id), true)
  );
}

export interface CastPerson {
  personId: number;
  personName: string;
}

/** Top-billed people in a show's cast — seeds for cast-based recommendations. */
export async function getCastPeople(showId: number): Promise<CastPerson[]> {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const data = (await tvFetch(`/shows/${showId}/cast`)) as any[] | null;
  if (!data) return [];
  const seen = new Set<number>();
  const people: CastPerson[] = [];
  for (const entry of data) {
    const p = entry?.person;
    if (!p?.id || seen.has(p.id)) continue;
    seen.add(p.id);
    people.push({ personId: p.id, personName: p.name ?? "" });
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */
  return people;
}

/** People credited as creating/developing a show (from /shows/:id/crew). */
export async function getShowCreators(showId: number): Promise<CastPerson[]> {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const data = (await tvFetch(`/shows/${showId}/crew`)) as any[] | null;
  if (!data) return [];
  const seen = new Set<number>();
  const out: CastPerson[] = [];
  for (const entry of data) {
    const type = String(entry?.type ?? "").toLowerCase();
    if (!type.includes("creator") && !type.includes("developer")) continue;
    const p = entry?.person;
    if (!p?.id || seen.has(p.id)) continue;
    seen.add(p.id);
    out.push({ personId: p.id, personName: p.name ?? "" });
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */
  return out;
}

export interface RelatedShow {
  show: RemoteShow;
  weight: number; // TVmaze popularity score (0–100), for ranking
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapCredits(data: any[] | null): RelatedShow[] {
  if (!data) return [];
  const seen = new Set<number>();
  const out: RelatedShow[] = [];
  for (const credit of data) {
    const s = credit?._embedded?.show;
    if (!s?.id || seen.has(s.id)) continue;
    seen.add(s.id);
    out.push({
      show: mapShow(s),
      weight: typeof s.weight === "number" ? s.weight : 0,
    });
  }
  return out;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Other shows a person has acted in (TVmaze cast credits, show embedded). */
export async function getPersonShows(personId: number): Promise<RelatedShow[]> {
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const data = (await tvFetch(
    `/people/${personId}/castcredits?embed=show`
  )) as any[] | null;
  return mapCredits(data);
}

/** Shows a person created/wrote/produced (TVmaze crew credits). */
export async function getPersonCrewShows(
  personId: number
): Promise<RelatedShow[]> {
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const data = (await tvFetch(
    `/people/${personId}/crewcredits?embed=show`
  )) as any[] | null;
  return mapCredits(data);
}

/**
 * Show cast (character + the actor who plays them). Powers per-episode
 * character votes. TVmaze can list a character twice (recasts, dual roles);
 * we keep the first and dedupe by character id.
 */
export async function getCast(showId: number): Promise<CastMember[]> {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const data = (await tvFetch(`/shows/${showId}/cast`)) as any[] | null;
  if (!data) return [];
  const seen = new Set<number>();
  const cast: CastMember[] = [];
  for (const entry of data) {
    const character = entry?.character;
    const person = entry?.person;
    if (!character?.id || !character?.name) continue;
    if (seen.has(character.id)) continue;
    seen.add(character.id);
    cast.push({
      characterId: character.id,
      characterName: character.name,
      personName: person?.name ?? "",
      image:
        character.image?.medium ??
        character.image?.original ??
        person?.image?.medium ??
        null,
    });
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */
  return cast;
}
