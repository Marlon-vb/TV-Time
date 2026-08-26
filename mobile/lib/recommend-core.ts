import type { RemoteShow } from "./types";

/**
 * Pure scoring core for "Recommended for you" — no native imports so it's
 * unit-testable. The orchestrator that gathers signals from TVmaze and the
 * community lives in recommendations.ts.
 */

export interface Recommendation {
  showId: number; // TVmaze id
  name: string;
  posterUrl: string | null;
  reason: string | null; // e.g. "With Cillian Murphy"
}

/** One candidate show with the evidence gathered for it. */
export interface CandidateShow {
  show: RemoteShow;
  weight: number; // TVmaze popularity (0–100)
  actors: string[]; // your actors appearing in it
  creators: string[]; // your creators who made it
  watchers: number; // TV App taste-neighbors watching it
}

/** How many shows the engine reasons from, and how many of those are recent. */
export const SEED_SHOWS = 6;
export const RECENT_SEEDS = 3;
/** A show you actively disliked is not a description of your taste. */
export const DISLIKED_AT_OR_BELOW = 2;

/**
 * Which shows the engine reasons from.
 *
 * All-time favourites alone freeze it: the same four shows produce the same
 * list every day, and someone two hundred shows deep gets recommendations
 * derived from what they watched most in 2019. Half the seeds come from the
 * recent window instead, so the rail moves when their watching does — and the
 * all-time half keeps a quiet month from throwing it away entirely.
 *
 * Shows the user rated at or below DISLIKED_AT_OR_BELOW are dropped from both
 * halves. Finishing something and hating it is a strong statement about taste,
 * and it was previously read as a vote in favour.
 */
export function pickSeeds(
  recent: { id: number; rating: number | null }[],
  allTime: { id: number; rating: number | null }[]
): { id: number; rating: number | null }[] {
  const liked = <T extends { rating: number | null }>(rows: T[]) =>
    rows.filter((r) => r.rating == null || r.rating > DISLIKED_AT_OR_BELOW);
  const out: typeof recent = [];
  const seen = new Set<number>();
  const take = (rows: typeof recent, n: number) => {
    for (const r of rows) {
      if (out.length >= SEED_SHOWS || n <= 0) return;
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      out.push(r);
      n--;
    }
  };
  take(liked(recent), RECENT_SEEDS);
  take(liked(allTime), SEED_SHOWS);
  // Everything is disliked, or nothing is rated and both lists were empty —
  // better a recommendation from a bad seed than an empty rail.
  if (out.length === 0) take([...recent, ...allTime], SEED_SHOWS);
  return out;
}

/** Genre → 0..1 weight, from minutes watched per genre. */
export type TasteProfile = Map<string, number>;

/**
 * How much the recent window counts against the whole history.
 *
 * Taste moves. Someone who spent 2019 on procedurals and this year on anime is
 * better served by the anime, but an all-time profile buries the new interest
 * under years of accumulated minutes it can never outweigh. Recent leads;
 * all-time still has a say, so one weekend of something unusual cannot throw
 * the whole rail.
 */
export const RECENT_WEIGHT = 0.6;

const normalize = (
  genres: { genre: string; minutes: number }[]
): Map<string, number> => {
  const max = Math.max(...genres.map((g) => g.minutes), 1);
  return new Map(genres.map((g) => [g.genre, g.minutes / max]));
};

export function buildTasteProfile(
  allTime: { genre: string; minutes: number }[],
  recent: { genre: string; minutes: number }[] = []
): TasteProfile {
  const overall = normalize(allTime);
  // Nothing watched lately — the blend would just scale everything down.
  if (recent.length === 0) return overall;
  const lately = normalize(recent);
  const out = new Map<string, number>();
  for (const g of new Set([...overall.keys(), ...lately.keys()])) {
    out.set(
      g,
      RECENT_WEIGHT * (lately.get(g) ?? 0) +
        (1 - RECENT_WEIGHT) * (overall.get(g) ?? 0)
    );
  }
  return out;
}

/** How well a candidate's genres match your taste — 0..2. */
export function genreAffinity(
  genres: string[],
  profile: TasteProfile
): number {
  let sum = 0;
  for (const g of genres) sum += profile.get(g) ?? 0;
  return Math.min(sum, 2);
}

function score(c: CandidateShow, profile: TasteProfile): number {
  return (
    Math.min(c.actors.length, 3) * 1.0 +
    Math.min(c.creators.length, 2) * 1.5 +
    Math.min(c.watchers * 2, 8) +
    genreAffinity(c.show.genres, profile) +
    c.weight / 100 // popularity as a gentle tiebreak
  );
}

export function pickReason(
  c: CandidateShow,
  profile: TasteProfile
): string | null {
  if (c.watchers >= 2) return "Watched by people with your taste";
  if (c.actors.length > 0) return `With ${c.actors[0]}`;
  if (c.creators.length > 0) return `From ${c.creators[0]}`;
  const shared = c.show.genres
    .filter((g) => (profile.get(g) ?? 0) > 0)
    .sort((a, b) => (profile.get(b) ?? 0) - (profile.get(a) ?? 0))[0];
  return shared ? `Because you watch ${shared}` : null;
}

/**
 * How many recommendations one person may account for.
 *
 * Candidates come from an actor's or creator's other credits, so a prolific
 * seed can carry the entire rail: twelve posters, every one of them "With
 * Cillian Murphy". That reads as a filmography, not a recommendation.
 */
export const PER_SOURCE = 3;

/** Whoever this candidate is here because of — the same one pickReason names. */
function primarySource(c: CandidateShow): string {
  if (c.watchers >= 2) return "community";
  return c.actors[0] ?? c.creators[0] ?? "genre";
}

/**
 * Score order, rearranged so no single source takes more than PER_SOURCE of
 * the leading slots. A soft cap: everything held back is appended in score
 * order rather than dropped, so a narrow library still fills the rail instead
 * of showing three posters.
 */
function diversify<T extends { c: CandidateShow }>(scored: T[], limit: number): T[] {
  const used = new Map<string, number>();
  const first: T[] = [];
  const rest: T[] = [];
  for (const entry of scored) {
    const src = primarySource(entry.c);
    const n = used.get(src) ?? 0;
    if (n < PER_SOURCE) {
      used.set(src, n + 1);
      first.push(entry);
    } else {
      rest.push(entry);
    }
  }
  return [...first, ...rest].slice(0, limit);
}

/**
 * Pure ranking core: filter out followed shows and posterless entries, score
 * every candidate, return the top `limit` with a human reason each.
 */
export function rankCandidates(
  candidates: CandidateShow[],
  profile: TasteProfile,
  exclude: Set<number>,
  limit = 12
): Recommendation[] {
  const scored = candidates
    .filter((c) => !exclude.has(c.show.id) && c.show.posterUrl)
    .map((c) => ({ c, s: score(c, profile) }))
    .sort((a, b) => b.s - a.s);
  return diversify(scored, limit).map(({ c }) => ({
    showId: c.show.id,
    name: c.show.name,
    posterUrl: c.show.posterUrl,
    reason: pickReason(c, profile),
  }));
}
