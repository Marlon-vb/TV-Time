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

/** Genre → 0..1 weight, from minutes watched per genre. */
export type TasteProfile = Map<string, number>;

export function buildTasteProfile(
  topGenres: { genre: string; minutes: number }[]
): TasteProfile {
  const max = Math.max(...topGenres.map((g) => g.minutes), 1);
  return new Map(topGenres.map((g) => [g.genre, g.minutes / max]));
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
 * Pure ranking core: filter out followed shows and posterless entries, score
 * every candidate, return the top `limit` with a human reason each.
 */
export function rankCandidates(
  candidates: CandidateShow[],
  profile: TasteProfile,
  exclude: Set<number>,
  limit = 12
): Recommendation[] {
  return candidates
    .filter((c) => !exclude.has(c.show.id) && c.show.posterUrl)
    .map((c) => ({ c, s: score(c, profile) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map(({ c }) => ({
      showId: c.show.id,
      name: c.show.name,
      posterUrl: c.show.posterUrl,
      reason: pickReason(c, profile),
    }));
}
