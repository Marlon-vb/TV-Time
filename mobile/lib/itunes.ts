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
    if (!res.ok) {
      // Logged, not just thrown: this is a third-party, key-free endpoint we
      // do not control, and "no movies came back" is otherwise indis-
      // tinguishable from "no movies matched". 403 here means Apple is
      // throttling or blocking; a 5xx means it is down.
      console.log(`[itunes] HTTP ${res.status} for ${pathname}`);
      throw new Error(`iTunes HTTP ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    // A rejected fetch (offline, DNS, TLS, timeout) never reaches the line
    // above, and the caller swallows it into an empty column.
    if (!(err instanceof Error) || !err.message.startsWith("iTunes HTTP")) {
      console.log(`[itunes] request failed for ${pathname}: ${String(err)}`);
    }
    throw err;
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

/**
 * Apple's id and title fields, read tolerantly. The strict version required
 * `trackId` to be a JSON number and `trackName` to be present, so a row that
 * carried its id as a string, or came back as a collection rather than a
 * track, was dropped — silently, and for every row at once if the shape ever
 * shifts. Dropping the entire film column on a field-type change is not a
 * trade worth making for a source we do not control.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
function resultId(r: any): number | null {
  for (const v of [r.trackId, r.collectionId]) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
  }
  return null;
}

/** Map one iTunes result row to a RemoteMovie. Pure + unit-tested. */
export function mapMovieResult(r: any): RemoteMovie | null {
  if (!r) return null;
  const id = resultId(r);
  const title = r.trackName || r.collectionName;
  if (id == null || !title) return null;
  const year =
    typeof r.releaseDate === "string" ? Number(r.releaseDate.slice(0, 4)) : NaN;
  return {
    id,
    title,
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
  const raw = data?.results ?? [];
  const seen = new Set<number>();
  const out: RemoteMovie[] = [];
  for (const r of raw) {
    const m = mapMovieResult(r);
    if (m && !seen.has(m.id)) {
      seen.add(m.id);
      out.push(m);
    }
  }
  // Separates "Apple has nothing for this query" from "Apple answered and we
  // threw all of it away", which look identical from the search screen.
  if (out.length === 0) {
    console.log(`[itunes] "${query}": ${raw.length} raw result(s), 0 usable`);
  }
  return out;
}
