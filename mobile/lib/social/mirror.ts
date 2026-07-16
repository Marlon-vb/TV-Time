import { getSetting, setSetting } from "@/lib/db";
import * as repo from "@/lib/repo";
import * as api from "./api";
import type { WatchedRow } from "./api";

/**
 * Keeps the server's watched_episodes in sync with the local library — the
 * local SQLite DB is always the source of truth.
 *
 * Two tiers:
 *  - Single actions (episode screen, Watch Next check) call recordWatch/
 *    unrecordWatch directly so they also publish a feed activity.
 *  - Everything else — bulk actions, the TV Time import, historic divergence —
 *    is reconciled here in batches, WITHOUT feed activities (marking a season
 *    must not spam friends with 20 feed rows).
 *
 * Every function silently no-ops when signed out and never throws.
 */

const key = (r: { show_id: number; season: number; episode: number }) =>
  `${r.show_id}:${r.season}:${r.episode}`;

function localWatchedRows(showId?: number): WatchedRow[] {
  const shows = showId != null ? [showId] : repo.listFollowedShowIds();
  const rows: WatchedRow[] = [];
  for (const id of shows) {
    for (const e of repo.getEpisodes(id)) {
      if (e.watched_at) {
        rows.push({
          show_id: id,
          season: e.season,
          episode: e.number,
          rating: e.rating,
        });
      }
    }
  }
  return rows;
}

/** Diff local truth against server rows; returns the writes needed. */
export function planReconcile(
  local: WatchedRow[],
  server: WatchedRow[]
): { upserts: WatchedRow[]; staleShowIds: number[] } {
  const localByKey = new Map(local.map((r) => [key(r), r]));
  const staleShows = new Set<number>();
  const matchedKeys = new Set<string>();
  for (const s of server) {
    const l = localByKey.get(key(s));
    if (!l) {
      staleShows.add(s.show_id); // server row the user no longer has watched
    } else {
      matchedKeys.add(key(s));
      if ((l.rating ?? null) !== (s.rating ?? null)) staleShows.add(s.show_id);
    }
  }
  // Shows with stale server rows are rewritten wholesale (tuple deletes are
  // awkward over PostgREST); everything else just upserts what's missing.
  const upserts = local.filter(
    (r) => staleShows.has(r.show_id) || !matchedKeys.has(key(r))
  );
  return { upserts, staleShowIds: [...staleShows] };
}

let running = false;

async function reconcile(showId?: number): Promise<void> {
  if (running) return;
  running = true;
  try {
    const local = localWatchedRows(showId);
    const server = await api.fetchMyWatched(showId);
    const { upserts, staleShowIds } = planReconcile(local, server);
    for (const id of staleShowIds) await api.deleteWatchedForShow(id);
    await api.upsertWatchedRows(upserts);
  } catch {
    /* offline / signed out — the next reconcile catches up */
  } finally {
    running = false;
  }
}

/** After bulk actions on one show (mark season/all/up-to, rewatch). */
export function reconcileShow(showId: number): void {
  void reconcile(showId);
}

/** Full-library reconcile — sign-in, after imports. */
export function reconcileAll(): void {
  void reconcile();
}

const LAST_FULL_KEY = "mirror_last_full_at";

/**
 * Launch-time sync keeper: a cheap count comparison every launch, a full
 * reconcile only when counts diverge or a day has passed. This is what
 * backfills a pre-existing library (e.g. a TV Time import done before
 * signing in) into the community layer.
 */
export async function reconcileIfStale(): Promise<void> {
  try {
    const serverCount = await api.countMyWatched();
    if (serverCount == null) return; // signed out
    const localCount = repo.countWatchedEpisodes();
    const last = getSetting(LAST_FULL_KEY);
    const dayOld = !last || Date.now() - Date.parse(last) > 24 * 60 * 60 * 1000;
    if (serverCount !== localCount || dayOld) {
      await reconcile();
      setSetting(LAST_FULL_KEY, new Date().toISOString());
    }
  } catch {
    /* best-effort */
  }
}
