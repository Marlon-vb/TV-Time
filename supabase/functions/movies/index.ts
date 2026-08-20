// Movie + documentary search proxy.
//
// TVmaze covers television and nothing else, so film needs its own source.
// That was Apple's iTunes Search API, chosen because it needed no key — and it
// stopped returning results, which took the whole film half of search down
// with it. TMDB is the replacement: a real catalogue with posters, overviews
// and genres, and free for this use.
//
// TMDB needs a key, so the app does not hold one. It calls this function,
// which keeps the key as a server secret and caches every result in
// public.movie_cache. Same two reasons as the GIF proxy: a key inside an app
// binary can be extracted and spent by somebody else, and title searches
// follow a power law — "dune", "oppenheimer", "barbie" — so caching collapses
// thousands of users into one upstream call per query per TTL window.
//
// The response is mapped to the app's own movie shape here rather than in the
// app, so swapping TMDB for something else later never reaches a client.
//
// Deploy:  supabase functions deploy movies
// Secret:  supabase secrets set TMDB_KEY=<v3 api key or v4 read token>
// Table:   run ../../movies.sql once
//
// JWT verification is left ON (the default), so only signed-in users can call
// it — this is not an open proxy.

import { createClient } from "npm:@supabase/supabase-js@2";

/** Film metadata barely changes; a week of caching is still fresh. */
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

const IMG = "https://image.tmdb.org/t/p/w500";

/** The app's shape. Mirrors RemoteMovie in mobile/lib/types.ts. */
interface Movie {
  id: number;
  title: string;
  year: number | null;
  posterUrl: string | null;
  genre: string | null;
  runtime: number | null;
  overview: string | null;
  releaseDate: string | null;
}

/** v4 read tokens are JWTs; v3 keys are hex. Support whichever is set. */
function tmdbRequest(key: string, path: string, params: URLSearchParams) {
  const isV4 = key.startsWith("ey");
  if (!isV4) params.set("api_key", key);
  return fetch(`https://api.themoviedb.org/3${path}?${params}`, {
    headers: {
      Accept: "application/json",
      ...(isV4 ? { Authorization: `Bearer ${key}` } : {}),
    },
  });
}

// Genre ids are stable and the list is tiny, so one fetch per function
// instance is plenty — it is not worth a cache row or a second round trip on
// every search.
let genreNames: Map<number, string> | null = null;

async function loadGenres(key: string): Promise<Map<number, string>> {
  if (genreNames) return genreNames;
  try {
    const res = await tmdbRequest(key, "/genre/movie/list", new URLSearchParams());
    if (!res.ok) return new Map();
    const body = (await res.json()) as { genres?: { id: number; name: string }[] };
    genreNames = new Map((body.genres ?? []).map((g) => [g.id, g.name]));
    return genreNames;
  } catch {
    return new Map(); // a search without genre labels still works
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapMovie(r: any, genres: Map<number, string>): Movie | null {
  if (!r || typeof r.id !== "number" || !r.title) return null;
  const year = typeof r.release_date === "string" && r.release_date.length >= 4
    ? Number(r.release_date.slice(0, 4))
    : NaN;
  // Documentary first when present: it is the distinction the app draws in the
  // result row, and TMDB lists genres in its own order, not by relevance.
  const ids: number[] = Array.isArray(r.genre_ids) ? r.genre_ids : [];
  const names = ids.map((id) => genres.get(id)).filter(Boolean) as string[];
  const genre = names.find((n) => n === "Documentary") ?? names[0] ?? null;
  return {
    id: r.id,
    title: r.title,
    year: Number.isFinite(year) ? year : null,
    posterUrl: r.poster_path ? `${IMG}${r.poster_path}` : null,
    genre,
    // Search results carry no runtime — only the detail endpoint does, which
    // would be one extra request per result. Left null rather than paying for
    // it on every keystroke.
    runtime: null,
    overview: r.overview || null,
    releaseDate: r.release_date || null,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Same text should hit the same cache row regardless of spacing or case. */
function normalize(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 100);
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const key = Deno.env.get("TMDB_KEY");
  if (!key) return json({ error: "Movie search is not configured" }, 503);

  let q = "";
  try {
    const body = (await req.json()) as { q?: string };
    q = normalize(body?.q ?? "");
  } catch {
    // fall through to the empty-query guard
  }
  if (!q) return json({ movies: [] });

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: cached } = await db
    .from("movie_cache")
    .select("payload, fetched_at")
    .eq("query", q)
    .maybeSingle();

  if (cached && Date.now() - Date.parse(cached.fetched_at) < TTL_MS) {
    return json({ movies: cached.payload, cached: true });
  }

  let movies: Movie[];
  try {
    const params = new URLSearchParams({
      query: q,
      // Non-negotiable: an App Store app must not surface adult titles.
      include_adult: "false",
      language: "en-US",
      page: "1",
    });
    const res = await tmdbRequest(key, "/search/movie", params);
    if (!res.ok) throw new Error(`TMDB HTTP ${res.status}`);
    const body = (await res.json()) as { results?: unknown[] };
    const genres = await loadGenres(key);
    movies = (body.results ?? [])
      .map((r) => mapMovie(r, genres))
      .filter((m): m is Movie => m !== null)
      .slice(0, 25);
  } catch (err) {
    // Stale results beat an empty column, which is exactly the failure that
    // made iTunes look like a missing feature rather than a broken one.
    if (cached) {
      return json({ movies: cached.payload, cached: true, stale: true });
    }
    return json({ error: String(err) }, 502);
  }

  await db
    .from("movie_cache")
    .upsert({ query: q, payload: movies, fetched_at: new Date().toISOString() });

  return json({ movies });
});
