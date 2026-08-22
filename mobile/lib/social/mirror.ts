import { getSetting, setSetting } from "@/lib/db";
import * as repo from "@/lib/repo";
import * as movies from "@/lib/movies";
import * as api from "./api";
import { planReconcile } from "./mirror-plan";

/**
 * Keeps the server's watched_episodes in sync with the local library.
 *
 * Two tiers:
 *  - Single actions (episode screen, Watch Next check, show-screen episode
 *    toggles) call recordWatch/unrecordWatch directly so they also publish a
 *    feed activity.
 *  - Bulk actions and historic divergence are reconciled here in batches,
 *    WITHOUT feed activities (marking a season must not spam friends).
 *
 * Safety model: the local library is the source of truth ONLY for shows it
 * actually contains. Server rows for shows that aren't followed locally are
 * left untouched — so signing in on a fresh install or second device can
 * never wipe an existing server history. Removing a show's server history is
 * an explicit act (unfollow calls deleteWatchedForShow directly).
 *
 * Every entry point silently no-ops when signed out and never throws.
 */

/** One reconcile pass; returns false on any failure. */
async function reconcileOnce(showId?: number): Promise<boolean> {
  try {
    const judge = new Set(
      showId != null ? [showId] : repo.listFollowedShowIds()
    );
    const local = repo.listWatchedRows(showId);
    const server = await api.fetchMyWatched(showId);
    const { upserts, deletes } = planReconcile(local, server, judge);
    // Upsert first so a mid-flight failure can only leave extra rows behind,
    // never missing history; targeted deletes go last.
    await api.upsertWatchedRows(upserts);
    await api.deleteWatchedRows(deletes);
    // Stars picked before signing in have never reached the profile. Only on
    // a full pass — per-show reconciles run often and this is one query.
    if (showId == null) {
      // Index, not the stored rank: favorites() has already applied the
      // ranked-then-newest rule, so the array order is the shelf order and
      // sending it directly keeps the server agreeing with the device.
      await api.upsertFavorites(
        repo.favorites().map((s, i) => ({
          id: s.id,
          name: s.name,
          posterUrl: s.poster_url,
          position: i,
        }))
      );
      await api.upsertFavoriteMovies(
        movies.favoriteMovies().map((m, i) => ({
          id: m.id,
          title: m.title,
          posterUrl: m.poster_url,
          position: i,
        }))
      );
    }
    return true;
  } catch {
    return false; // offline / signed out — a later reconcile catches up
  }
}

// Concurrent requests queue behind the in-flight pass instead of being
// dropped (a dropped pass used to lose the newest change until next launch).
let running = false;
let pending: { full: boolean; showIds: Set<number> } | null = null;

async function requestReconcile(showId?: number): Promise<boolean> {
  if (running) {
    pending ??= { full: false, showIds: new Set() };
    if (showId == null) pending.full = true;
    else pending.showIds.add(showId);
    return false; // queued — the in-flight runner will pick it up
  }
  running = true;
  try {
    let ok = true;
    let next: { full: boolean; showIds: Set<number> } | null = {
      full: showId == null,
      showIds: new Set(showId != null ? [showId] : []),
    };
    while (next) {
      if (next.full) {
        ok = (await reconcileOnce()) && ok;
      } else {
        for (const id of next.showIds) ok = (await reconcileOnce(id)) && ok;
      }
      next = pending;
      pending = null;
    }
    return ok;
  } finally {
    running = false;
  }
}

/** After bulk actions on one show (mark season/all/up-to, rewatch). */
export function reconcileShow(showId: number): void {
  void requestReconcile(showId);
}

/** Full-library reconcile — after imports. */
export function reconcileAll(): void {
  void requestReconcile();
}

const LAST_FULL_KEY = "mirror_last_full_at";

/**
 * Launch-time sync keeper: a cheap count comparison, a full reconcile only
 * when counts diverge or a day has passed. This is what backfills a
 * pre-existing library (e.g. a TV Time import done before signing in) into
 * the community layer.
 */
export async function reconcileIfStale(): Promise<void> {
  try {
    const serverCount = await api.countMyWatched();
    if (serverCount == null) return; // signed out
    const localCount = repo.countWatchedEpisodes();
    const last = getSetting(LAST_FULL_KEY);
    const dayOld = !last || Date.now() - Date.parse(last) > 24 * 60 * 60 * 1000;
    if (serverCount !== localCount || dayOld) {
      // Stamp only after a clean, actually-run full pass.
      if (await requestReconcile()) {
        setSetting(LAST_FULL_KEY, new Date().toISOString());
      }
    }
  } catch {
    /* best-effort */
  }
}
