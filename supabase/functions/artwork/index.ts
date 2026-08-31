// Show artwork proxy.
//
// TVmaze serves a poster and nothing else — mobile/lib/tvmaze.ts returns
// backdropUrl: null for every show, because the API has no such field. Wide
// art can only come from TMDB, and until now that meant a TMDB key the user
// pasted into Settings themselves. Almost nobody does, so almost nobody had a
// backdrop for any show, and the feature built on top of one — the hero banner
// on a profile — had nothing to draw for anybody.
//
// So the key lives here instead, as it already does for movie search, and
// every user gets the same artwork without holding anything. Results are
// cached by external id: artwork changes about never, and a popular show is
// one upstream call for the whole user base rather than one per install.
//
// Deploy:  supabase functions deploy artwork
// Secret:  TMDB_KEY — already set for the movies function; shared per project.
// Table:   run ../../show-artwork.sql once
//
// JWT verification stays ON (the default), so this is not an open proxy. A
// signed-out app simply keeps the TVmaze poster, exactly as it does today.

import { createClient } from "npm:@supabase/supabase-js@2";

/** Artwork does not change. A month is short. */
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

const IMG = "https://image.tmdb.org/t/p";

/** Mirrors TmdbArtwork in mobile/lib/tmdb.ts. */
interface Artwork {
  tmdbId: number;
  posterUrl: string | null;
  backdropUrl: string | null;
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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/**
 * TMDB's /find endpoint, which resolves an id from another database into a
 * TMDB record. IMDb first: it is the more reliable of the two on TVmaze rows.
 */
async function lookup(
  key: string,
  source: "imdb_id" | "tvdb_id",
  id: string
): Promise<Artwork | null> {
  const res = await tmdbRequest(
    key,
    `/find/${encodeURIComponent(id)}`,
    new URLSearchParams({ external_source: source })
  );
  if (!res.ok) throw new Error(`TMDB HTTP ${res.status}`);
  const body = (await res.json()) as { tv_results?: Record<string, unknown>[] };
  const tv = body.tv_results?.[0];
  if (!tv || typeof tv.id !== "number") return null;
  return {
    tmdbId: tv.id,
    posterUrl: tv.poster_path ? `${IMG}/w500${tv.poster_path}` : null,
    backdropUrl: tv.backdrop_path ? `${IMG}/w1280${tv.backdrop_path}` : null,
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const key = Deno.env.get("TMDB_KEY");
  if (!key) return json({ error: "Artwork is not configured" }, 503);

  let imdbId: string | null = null;
  let tvdbId: number | null = null;
  try {
    const body = (await req.json()) as { imdbId?: string; tvdbId?: number };
    // Shapes are checked rather than trusted: these become a cache key and a
    // path segment upstream.
    if (typeof body.imdbId === "string" && /^tt\d{5,12}$/.test(body.imdbId)) {
      imdbId = body.imdbId;
    }
    if (typeof body.tvdbId === "number" && Number.isInteger(body.tvdbId) && body.tvdbId > 0) {
      tvdbId = body.tvdbId;
    }
  } catch {
    // fall through to the no-id guard
  }
  if (!imdbId && !tvdbId) return json({ artwork: null });

  // One row per external id. IMDb is looked up first, so key on it first too —
  // otherwise the same show caches twice under two ids.
  const cacheKey = imdbId ? `imdb:${imdbId}` : `tvdb:${tvdbId}`;

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: cached } = await db
    .from("show_artwork_cache")
    .select("payload, fetched_at")
    .eq("external_id", cacheKey)
    .maybeSingle();

  if (cached && Date.now() - Date.parse(cached.fetched_at) < TTL_MS) {
    return json({ artwork: cached.payload, cached: true });
  }

  let artwork: Artwork | null = null;
  try {
    if (imdbId) artwork = await lookup(key, "imdb_id", imdbId);
    if (!artwork && tvdbId) artwork = await lookup(key, "tvdb_id", String(tvdbId));
  } catch (err) {
    // Stale artwork beats no artwork — the whole point of this function is
    // that a show without a backdrop has a hole where its banner should be.
    if (cached) return json({ artwork: cached.payload, cached: true, stale: true });
    return json({ error: String(err) }, 502);
  }

  // A miss is cached too. Plenty of shows are not in TMDB, and without this
  // every sync of every one of them costs an upstream call forever.
  await db.from("show_artwork_cache").upsert({
    external_id: cacheKey,
    payload: artwork,
    fetched_at: new Date().toISOString(),
  });

  return json({ artwork });
});
