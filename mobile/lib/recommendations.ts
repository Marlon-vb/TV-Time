import { getSetting, setSetting } from "./db";
import * as repo from "./repo";
import * as social from "./social/api";
import {
  getCastPeople,
  getPersonCrewShows,
  getPersonShows,
  getShow,
  getShowCreators,
} from "./tvmaze";
import {
  buildTasteProfile,
  rankCandidates,
  type CandidateShow,
  type Recommendation,
} from "./recommend-core";
import type { RemoteShow } from "./types";

export type { Recommendation } from "./recommend-core";

/**
 * "Recommended for you" on Discover — our own engine, no API key.
 *
 * TVmaze has no similar-shows endpoint, so we combine three signals:
 *  1. People graph (TVmaze): actors and creators from the shows you watch
 *     most → the other shows they made. TVmaze's `weight` (its popularity
 *     score, derived from real user behavior) breaks ties.
 *  2. Taste profile (local): candidates are boosted by how well their genres
 *     match what you actually watch, weighted by minutes.
 *  3. Community (our Supabase): "people who watch your shows also watch…"
 *     from TV Time's own users — real collaborative filtering that gets
 *     smarter as the user base grows. Optional signal; empty is fine.
 *
 * Every candidate is a real TVmaze show, so opening/following works directly.
 * Results are cached for a day. Scoring lives in recommend-core.ts (pure).
 */

const CACHE_KEY = "recs_cache_v2";
const TTL_MS = 24 * 60 * 60 * 1000;
const SEED_SHOWS = 4;
const ACTORS_PER_SEED = 3;
const CREATORS_PER_SEED = 2;
const SHOWS_PER_ACTOR = 20;
const SHOWS_PER_CREATOR = 10;
const COMMUNITY_HYDRATIONS = 8;

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function safely<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

/**
 * Map with a few requests in flight and a short gap between waves — the old
 * fully-serial loop with a 300ms sleep per call added ~10s of pure waiting
 * to a cold recommendations build. tvFetch's 429 backoff guards the TVmaze
 * rate limit if we ever push too hard.
 */
async function mapConcurrent<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  width = 3
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += width) {
    out.push(...(await Promise.all(items.slice(i, i + width).map(fn))));
    if (i + width < items.length) await pause(150);
  }
  return out;
}

export async function recommendedShows(
  force = false
): Promise<Recommendation[]> {
  if (!force) {
    try {
      const raw = getSetting(CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as {
          at: string;
          recs: Recommendation[];
        };
        if (Date.now() - Date.parse(cached.at) < TTL_MS) return cached.recs;
      }
    } catch {
      /* stale/corrupt cache — refetch */
    }
  }

  try {
    const followed = repo.listShowsWithProgress();
    const exclude = new Set(followed.map((s) => s.id));
    const stats = repo.stats();
    const seeds = stats.mostWatched.slice(0, SEED_SHOWS).map((m) => m.show);
    if (seeds.length === 0) return [];
    const profile = buildTasteProfile(stats.topGenres);

    // Your people: top-billed cast + creators across the seed shows.
    const actorNames = new Map<number, string>();
    const creatorNames = new Map<number, string>();
    const seedPeople = await mapConcurrent(seeds, async (seed) => ({
      cast: (await safely(() => getCastPeople(seed.id), [])).slice(
        0,
        ACTORS_PER_SEED
      ),
      creators: (await safely(() => getShowCreators(seed.id), [])).slice(
        0,
        CREATORS_PER_SEED
      ),
    }));
    for (const { cast, creators } of seedPeople) {
      for (const p of cast) {
        if (!actorNames.has(p.personId)) actorNames.set(p.personId, p.personName);
      }
      for (const p of creators) {
        if (!creatorNames.has(p.personId))
          creatorNames.set(p.personId, p.personName);
      }
    }

    // Their other shows → candidate pool.
    const pool = new Map<number, CandidateShow>();
    const addCandidate = (
      show: RemoteShow,
      weight: number,
      via: { actor?: string; creator?: string; watchers?: number }
    ) => {
      let c = pool.get(show.id);
      if (!c) {
        c = { show, weight, actors: [], creators: [], watchers: 0 };
        pool.set(show.id, c);
      }
      if (via.actor && !c.actors.includes(via.actor)) c.actors.push(via.actor);
      if (via.creator && !c.creators.includes(via.creator))
        c.creators.push(via.creator);
      if (via.watchers) c.watchers = Math.max(c.watchers, via.watchers);
    };

    const actorCredits = await mapConcurrent(
      [...actorNames.entries()],
      async ([personId, personName]) => ({
        personName,
        credits: (await safely(() => getPersonShows(personId), []))
          .sort((a, b) => b.weight - a.weight)
          .slice(0, SHOWS_PER_ACTOR),
      })
    );
    for (const { personName, credits } of actorCredits) {
      for (const { show, weight } of credits)
        addCandidate(show, weight, { actor: personName });
    }
    const creatorCredits = await mapConcurrent(
      [...creatorNames.entries()],
      async ([personId, personName]) => ({
        personName,
        credits: (await safely(() => getPersonCrewShows(personId), []))
          .sort((a, b) => b.weight - a.weight)
          .slice(0, SHOWS_PER_CREATOR),
      })
    );
    for (const { personName, credits } of creatorCredits) {
      for (const { show, weight } of credits)
        addCandidate(show, weight, { creator: personName });
    }

    // Community signal from our own users (empty when signed out / small).
    const community = await social.alsoWatched(followed.map((s) => s.id));
    const toHydrate: { show_id: number; watchers: number }[] = [];
    for (const { show_id, watchers } of community) {
      const existing = pool.get(show_id);
      if (existing) {
        existing.watchers = Math.max(existing.watchers, watchers);
      } else if (
        !exclude.has(show_id) &&
        toHydrate.length < COMMUNITY_HYDRATIONS
      ) {
        toHydrate.push({ show_id, watchers });
      }
    }
    const hydrated = await mapConcurrent(toHydrate, async (h) => ({
      ...h,
      show: await safely(() => getShow(h.show_id), null),
    }));
    for (const { show, watchers } of hydrated) {
      if (show) addCandidate(show, 0, { watchers });
    }

    const recs = rankCandidates([...pool.values()], profile, exclude);
    if (recs.length > 0) {
      try {
        setSetting(
          CACHE_KEY,
          JSON.stringify({ at: new Date().toISOString(), recs })
        );
      } catch {
        /* cache is best-effort */
      }
    }
    return recs;
  } catch {
    return [];
  }
}
