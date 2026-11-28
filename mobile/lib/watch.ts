import { NativeModules, Platform } from "react-native";
import { supabase } from "./supabase";
import { tmdbConfigured, tmdbFetch } from "./tmdb";
import { FALLBACK_REGION, regionFromLocale } from "./region";
import { normalizeWatchRegion, type WatchOffer } from "./watch-offer";

/**
 * Streaming availability for a show or a movie.
 *
 * Signed in, this goes through the `watch` Edge Function so the TMDB key
 * stays on the server and a popular title is fetched once per country per
 * day. A personal key in Settings talks to TMDB directly, which is also what
 * makes the row work while signed out.
 */

export interface WatchQuery {
  kind: "tv" | "movie";
  tmdbId?: number | null;
  imdbId?: string | null;
  tvdbId?: number | null;
}

const memory = new Map<string, { at: number; offer: WatchOffer }>();
const MEMORY_TTL_MS = 30 * 60 * 1000;

export function deviceRegion(): string {
  let locale: string | null = null;
  try {
    locale = Intl.DateTimeFormat().resolvedOptions().locale ?? null;
  } catch {
    locale = null;
  }
  if (Platform.OS === "ios") {
    const settings = NativeModules.SettingsManager?.settings as
      | { AppleLocale?: string; AppleLanguages?: string[] }
      | undefined;
    const apple = settings?.AppleLocale || settings?.AppleLanguages?.[0];
    if (typeof apple === "string" && apple) locale = apple;
  }
  return regionFromLocale(locale, FALLBACK_REGION);
}

function cacheKey(query: WatchQuery, region: string): string {
  return [
    query.kind,
    query.tmdbId ?? "",
    query.imdbId ?? "",
    query.tvdbId ?? "",
    region,
  ].join(":");
}

function hasId(query: WatchQuery): boolean {
  if (query.kind === "movie") return Boolean(query.tmdbId);
  return Boolean(query.tmdbId || query.imdbId || query.tvdbId);
}

async function resolveTvId(query: WatchQuery): Promise<number | null> {
  if (query.tmdbId) return query.tmdbId;
  const find = async (source: "imdb_id" | "tvdb_id", id: string) => {
    const data = (await tmdbFetch(
      `/find/${encodeURIComponent(id)}?external_source=${source}`
    )) as { tv_results?: { id?: number }[] } | null;
    const found = data?.tv_results?.[0]?.id;
    return typeof found === "number" ? found : null;
  };
  if (query.imdbId) {
    const id = await find("imdb_id", query.imdbId);
    if (id) return id;
  }
  if (query.tvdbId) return find("tvdb_id", String(query.tvdbId));
  return null;
}

async function loadDirect(query: WatchQuery, region: string): Promise<WatchOffer | null> {
  const id =
    query.kind === "movie" ? query.tmdbId ?? null : await resolveTvId(query);
  if (!id) return null;
  const path =
    query.kind === "movie"
      ? `/movie/${id}/watch/providers`
      : `/tv/${id}/watch/providers`;
  const data = (await tmdbFetch(path)) as { results?: Record<string, unknown> } | null;
  if (!data) return null;
  return normalizeWatchRegion(region, data.results?.[region] ?? null);
}

async function loadProxy(query: WatchQuery, region: string): Promise<WatchOffer | null> {
  const { data, error } = await supabase.functions.invoke<{
    found?: boolean;
    region?: string;
    result?: unknown;
    error?: string;
  }>("watch", {
    body: {
      kind: query.kind,
      region,
      ...(query.tmdbId ? { tmdbId: query.tmdbId } : {}),
      ...(query.imdbId ? { imdbId: query.imdbId } : {}),
      ...(query.tvdbId ? { tvdbId: query.tvdbId } : {}),
    },
  });
  if (error || data?.error || !data?.found) return null;
  return normalizeWatchRegion(data.region || region, data.result ?? null);
}

/** Null means we could not look it up. An empty offer means we did, and nothing is listed. */
export async function loadWatchOffer(query: WatchQuery): Promise<WatchOffer | null> {
  if (!hasId(query)) return null;
  const region = deviceRegion();
  const key = cacheKey(query, region);
  const hit = memory.get(key);
  if (hit && Date.now() - hit.at < MEMORY_TTL_MS) return hit.offer;

  try {
    let offer: WatchOffer | null = null;
    if (tmdbConfigured()) {
      offer = await loadDirect(query, region);
    } else {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return null;
      offer = await loadProxy(query, region);
    }
    if (!offer) return null;
    memory.set(key, { at: Date.now(), offer });
    return offer;
  } catch {
    return null;
  }
}
