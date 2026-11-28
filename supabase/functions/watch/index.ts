// Where a show or movie can be streamed, rented, or bought.
//
// TMDB's watch/providers endpoint needs the same key movie search and artwork
// already use, so the app does not hold one. This function keeps the key
// server-side and caches one row per title per country. Provider lineups
// change, but not by the hour, so a day of caching is still honest and turns
// a popular show into one upstream call for everyone in that country.
//
// The response is the raw region block from TMDB (or null). The app turns
// that into logos and groups, so the shape TMDB returns can change without a
// function deploy as long as the field names stay.
//
// Deploy:  supabase functions deploy watch
// Secret:  TMDB_KEY — already set for movies and artwork.
// Table:   run ../../alerts-and-watch.sql once (the watch_provider_cache section)
//
// JWT verification stays ON, so only a signed-in user can call it. Someone
// signed out with their own TMDB key talks to TMDB directly instead.

import { createClient } from "npm:@supabase/supabase-js@2";

/** Lineups move, but a day is the right trade against TMDB's rate limit. */
const TTL_MS = 24 * 60 * 60 * 1000;

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

interface Query {
  kind: "tv" | "movie";
  tmdbId: number | null;
  imdbId: string | null;
  tvdbId: number | null;
  region: string;
}

function readQuery(body: unknown): Query | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as Record<string, unknown>;
  const kind = raw.kind === "movie" ? "movie" : raw.kind === "tv" ? "tv" : null;
  if (!kind) return null;
  const region =
    typeof raw.region === "string" && /^[A-Z]{2}$/.test(raw.region) ? raw.region : null;
  if (!region) return null;
  const tmdbId =
    typeof raw.tmdbId === "number" && Number.isInteger(raw.tmdbId) && raw.tmdbId > 0
      ? raw.tmdbId
      : null;
  const imdbId =
    typeof raw.imdbId === "string" && /^tt\d{5,12}$/.test(raw.imdbId) ? raw.imdbId : null;
  const tvdbId =
    typeof raw.tvdbId === "number" && Number.isInteger(raw.tvdbId) && raw.tvdbId > 0
      ? raw.tvdbId
      : null;
  if (!tmdbId && !imdbId && !tvdbId) return null;
  if (kind === "movie" && !tmdbId) return null;
  return { kind, tmdbId, imdbId, tvdbId, region };
}

async function findTvId(
  key: string,
  imdbId: string | null,
  tvdbId: number | null
): Promise<number | null> {
  const tryOne = async (source: "imdb_id" | "tvdb_id", id: string) => {
    const res = await tmdbRequest(
      key,
      `/find/${encodeURIComponent(id)}`,
      new URLSearchParams({ external_source: source })
    );
    if (!res.ok) throw new Error(`TMDB HTTP ${res.status}`);
    const body = (await res.json()) as { tv_results?: { id?: unknown }[] };
    const found = body.tv_results?.[0]?.id;
    return typeof found === "number" ? found : null;
  };
  if (imdbId) {
    const id = await tryOne("imdb_id", imdbId);
    if (id) return id;
  }
  if (tvdbId) return tryOne("tvdb_id", String(tvdbId));
  return null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const key = Deno.env.get("TMDB_KEY");
  if (!key) return json({ error: "Watch providers are not configured" }, 503);

  let query: Query | null = null;
  try {
    query = readQuery(await req.json());
  } catch {
    query = null;
  }
  if (!query) return json({ error: "bad request" }, 400);

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let tmdbId = query.tmdbId;
  try {
    if (!tmdbId && query.kind === "tv") {
      tmdbId = await findTvId(key, query.imdbId, query.tvdbId);
    }
  } catch (err) {
    return json({ error: String(err) }, 502);
  }
  if (!tmdbId) return json({ found: false, region: query.region, result: null });

  const { data: cached } = await db
    .from("watch_provider_cache")
    .select("payload, fetched_at")
    .eq("kind", query.kind)
    .eq("tmdb_id", tmdbId)
    .eq("region", query.region)
    .maybeSingle();

  if (cached && Date.now() - Date.parse(cached.fetched_at) < TTL_MS) {
    return json({ found: true, region: query.region, result: cached.payload, cached: true });
  }

  let result: unknown = null;
  try {
    const path = query.kind === "movie" ? `/movie/${tmdbId}/watch/providers` : `/tv/${tmdbId}/watch/providers`;
    const res = await tmdbRequest(key, path, new URLSearchParams());
    if (res.status === 404) {
      return json({ found: false, region: query.region, result: null });
    }
    if (!res.ok) throw new Error(`TMDB HTTP ${res.status}`);
    const body = (await res.json()) as { results?: Record<string, unknown> };
    result = body.results?.[query.region] ?? null;
  } catch (err) {
    if (cached) {
      return json({
        found: true,
        region: query.region,
        result: cached.payload,
        cached: true,
        stale: true,
      });
    }
    return json({ error: String(err) }, 502);
  }

  await db.from("watch_provider_cache").upsert({
    kind: query.kind,
    tmdb_id: tmdbId,
    region: query.region,
    payload: result,
    fetched_at: new Date().toISOString(),
  });

  return json({ found: true, region: query.region, result });
});
