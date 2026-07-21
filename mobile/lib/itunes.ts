import type { RemoteMovie } from "./types";

/**
 * Apple iTunes Search API (https://performance-partners.apple.com/search-api).
 * Free, no API key — the key-free movie source for a key-free app. TVmaze is
 * TV-only, so movies come from here. No ratings, but posters/year/genre/runtime
 * are all present.
 */

const BASE = "https://itunes.apple.com";

async function itFetch(pathname: string): Promise<unknown | null> {
  const abort = new AbortController();
  const kill = setTimeout(() => abort.abort(), 15_000);
  try {
    const res = await fetch(`${BASE}${pathname}`, {
      headers: { Accept: "application/json" },
      signal: abort.signal,
    });
    if (!res.ok) throw new Error(`iTunes HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(kill);
  }
}

/**
 * iTunes artwork defaults to a tiny 100×100. Swap the size segment for a crisp
 * poster. Pure + unit-tested.
 */
export function upscaleArtwork(
  url: string | null | undefined,
  size = 600
): string | null {
  if (!url) return null;
  // e.g. .../source/100x100bb.jpg  →  .../source/600x600bb.jpg
  return url.replace(/\/\d+x\d+bb\.(jpg|png)/, `/${size}x${size}bb.$1`);
}

/** Map one iTunes result row to a RemoteMovie. Pure + unit-tested. */
/* eslint-disable @typescript-eslint/no-explicit-any */
export function mapMovieResult(r: any): RemoteMovie | null {
  if (!r || typeof r.trackId !== "number" || !r.trackName) return null;
  const year =
    typeof r.releaseDate === "string" ? Number(r.releaseDate.slice(0, 4)) : NaN;
  return {
    id: r.trackId,
    title: r.trackName,
    year: Number.isFinite(year) ? year : null,
    posterUrl: upscaleArtwork(r.artworkUrl100),
    genre: r.primaryGenreName ?? null,
    runtime:
      typeof r.trackTimeMillis === "number"
        ? Math.round(r.trackTimeMillis / 60000)
        : null,
    overview: r.longDescription ?? r.shortDescription ?? null,
    releaseDate: r.releaseDate ?? null,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Search movies by title. Deduped by iTunes track id, poster-only. */
export async function searchMovies(query: string): Promise<RemoteMovie[]> {
  const data = (await itFetch(
    `/search?media=movie&entity=movie&limit=25&term=${encodeURIComponent(query)}`
  )) as { results?: unknown[] } | null;
  const seen = new Set<number>();
  const out: RemoteMovie[] = [];
  for (const r of data?.results ?? []) {
    const m = mapMovieResult(r);
    if (m && !seen.has(m.id)) {
      seen.add(m.id);
      out.push(m);
    }
  }
  return out;
}
