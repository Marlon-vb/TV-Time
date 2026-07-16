import * as repo from "./repo";
import { findShowArtwork, tmdbConfigured, tmdbGet } from "./tmdb";
import type { ShowRow } from "./types";

/**
 * "Recommended for you" on Discover: TMDB recommendations seeded from your
 * most-watched shows, aggregated and de-duplicated, with anything you already
 * follow filtered out. Requires a TMDB key (optional); returns [] otherwise or
 * on any error, so Discover simply hides the row when it can't be built.
 */

const IMG = "https://image.tmdb.org/t/p";

export interface Recommendation {
  tmdbId: number;
  name: string;
  posterUrl: string | null;
  overview: string | null;
  year: string | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

async function seedTmdbId(show: ShowRow): Promise<number | null> {
  if (show.tmdb_id) return show.tmdb_id;
  const art = await findShowArtwork(show.imdb_id, show.tvdb_id);
  return art?.tmdbId ?? null;
}

export async function recommendedShows(limit = 12): Promise<Recommendation[]> {
  if (!tmdbConfigured()) return [];
  try {
    const followedNames = new Set(
      repo.listShowsWithProgress().map((s) => s.name.trim().toLowerCase())
    );
    const seeds = repo
      .stats()
      .mostWatched.slice(0, 5)
      .map((m) => m.show);

    const scored = new Map<number, { rec: Recommendation; score: number }>();
    for (const seed of seeds) {
      const id = await seedTmdbId(seed);
      if (!id) continue;
      const data = (await tmdbGet(`/tv/${id}/recommendations`)) as any;
      for (const r of data?.results ?? []) {
        if (!r?.id || !r?.name) continue;
        if (followedNames.has(String(r.name).trim().toLowerCase())) continue;
        const bump = 1 + (Number(r.vote_average) || 0) / 20;
        const prev = scored.get(r.id);
        if (prev) {
          prev.score += bump;
        } else {
          scored.set(r.id, {
            score: bump,
            rec: {
              tmdbId: r.id,
              name: r.name,
              posterUrl: r.poster_path ? `${IMG}/w342${r.poster_path}` : null,
              overview: r.overview || null,
              year: r.first_air_date
                ? String(r.first_air_date).slice(0, 4)
                : null,
            },
          });
        }
      }
    }

    return [...scored.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => s.rec);
  } catch {
    return [];
  }
}

/* eslint-enable @typescript-eslint/no-explicit-any */
