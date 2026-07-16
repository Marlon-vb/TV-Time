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

const throttle = () => new Promise((r) => setTimeout(r, 300));

async function safely<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
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
    for (const seed of seeds) {
      for (const p of (await safely(() => getCastPeople(seed.id), [])).slice(
        0,
        ACTORS_PER_SEED
      )) {
        if (!actorNames.has(p.personId)) actorNames.set(p.personId, p.personName);
      }
      await throttle();
      for (const p of (await safely(() => getShowCreators(seed.id), [])).slice(
        0,
        CREATORS_PER_SEED
      )) {
        if (!creatorNames.has(p.personId))
          creatorNames.set(p.personId, p.personName);
      }
      await throttle();
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

    for (const [personId, personName] of actorNames) {
      const credits = (await safely(() => getPersonShows(personId), []))
        .sort((a, b) => b.weight - a.weight)
        .slice(0, SHOWS_PER_ACTOR);
      for (const { show, weight } of credits)
        addCandidate(show, weight, { actor: personName });
      await throttle();
    }
    for (const [personId, personName] of creatorNames) {
      const credits = (await safely(() => getPersonCrewShows(personId), []))
        .sort((a, b) => b.weight - a.weight)
        .slice(0, SHOWS_PER_CREATOR);
      for (const { show, weight } of credits)
        addCandidate(show, weight, { creator: personName });
      await throttle();
    }

    // Community signal from our own users (empty when signed out / small).
    const community = await social.alsoWatched(followed.map((s) => s.id));
    let hydrations = 0;
    for (const { show_id, watchers } of community) {
      const existing = pool.get(show_id);
      if (existing) {
        existing.watchers = Math.max(existing.watchers, watchers);
      } else if (!exclude.has(show_id) && hydrations < COMMUNITY_HYDRATIONS) {
        hydrations++;
        const show = await safely(() => getShow(show_id), null);
        if (show) addCandidate(show, 0, { watchers });
        await throttle();
      }
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
