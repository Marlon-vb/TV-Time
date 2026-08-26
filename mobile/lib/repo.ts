import { getDb } from "./db";
import * as tvmaze from "./tvmaze";
import * as tmdb from "./tmdb";
import { computeCategory } from "./categories";
import { favoritesOf } from "./favorites-order";
import type {
  EpisodeRow,
  RemoteEpisode,
  RemoteShow,
  ShowRow,
  ShowWithProgress,
  UpcomingItem,
  WatchNextItem,
} from "./types";

function nowIso(): string {
  return new Date().toISOString();
}

/** Run many writes atomically (and much faster than auto-commit per row). */
export function inTransaction(fn: () => void): void {
  getDb().withTransactionSync(fn);
}

/** Normalize provider airstamps to UTC ISO so string comparison is safe. */
function utcStamp(airstamp: string | null): string | null {
  if (!airstamp) return null;
  const t = Date.parse(airstamp);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

// ---------------------------------------------------------------- follow/sync

export function isFollowed(showId: number): boolean {
  return Boolean(
    getDb().getFirstSync("SELECT 1 FROM shows WHERE id = ?", showId)
  );
}

function upsertShow(
  show: RemoteShow,
  artwork?: {
    tmdbId: number | null;
    posterUrl: string | null;
    backdropUrl: string | null;
  } | null
): void {
  getDb().runSync(
    `INSERT INTO shows (id, name, tvdb_id, imdb_id, tmdb_id, poster_url, backdrop_url,
                        status, network, runtime, premiered, genres, summary,
                        followed_at, archived, last_synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       tvdb_id = excluded.tvdb_id,
       imdb_id = excluded.imdb_id,
       tmdb_id = COALESCE(excluded.tmdb_id, shows.tmdb_id),
       poster_url = COALESCE(excluded.poster_url, shows.poster_url),
       backdrop_url = COALESCE(excluded.backdrop_url, shows.backdrop_url),
       status = excluded.status,
       network = excluded.network,
       runtime = excluded.runtime,
       premiered = excluded.premiered,
       genres = excluded.genres,
       summary = excluded.summary,
       last_synced_at = excluded.last_synced_at`,
    show.id,
    show.name,
    show.tvdbId,
    show.imdbId,
    artwork?.tmdbId ?? null,
    artwork?.posterUrl ?? show.posterUrl,
    artwork?.backdropUrl ?? show.backdropUrl,
    show.status,
    show.network,
    show.runtime,
    show.premiered,
    JSON.stringify(show.genres),
    show.summary,
    nowIso(),
    nowIso()
  );
}

function upsertEpisodes(showId: number, episodes: RemoteEpisode[]): void {
  const db = getDb();
  db.withTransactionSync(() => {
    for (const e of episodes) {
      db.runSync(
        `INSERT INTO episodes (id, show_id, season, number, name, airdate, airstamp,
                               runtime, summary, image_url, community_rating, watched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
         ON CONFLICT(id) DO UPDATE SET
           season = excluded.season,
           number = excluded.number,
           name = excluded.name,
           airdate = excluded.airdate,
           airstamp = excluded.airstamp,
           runtime = excluded.runtime,
           summary = excluded.summary,
           image_url = excluded.image_url,
           community_rating = excluded.community_rating`,
        e.id,
        showId,
        e.season,
        e.number,
        e.name,
        e.airdate,
        utcStamp(e.airstamp),
        e.runtime,
        e.summary,
        e.imageUrl,
        e.rating
      );
    }
    // TVmaze deletes/merges episode records (schedule shuffles, renumbering).
    // Drop local rows that vanished upstream so they don't haunt Watch Next
    // forever — but keep anything carrying user history: watched rows, and
    // un-checked rows that still hold a rating or rewatch count.
    if (episodes.length > 0) {
      const ids = episodes
        .map((e) => e.id)
        .filter((id) => Number.isFinite(id))
        .join(",");
      if (ids) {
        db.runSync(
          `DELETE FROM episodes
           WHERE show_id = ? AND watched_at IS NULL
             AND plays = 0 AND rating IS NULL
             AND id NOT IN (${ids})`,
          showId
        );
      }
    }
  });
}

export async function followShow(tvmazeId: number): Promise<ShowRow | null> {
  const result = await tvmaze.getShowWithEpisodes(tvmazeId);
  if (!result) return null;
  const artwork = await tmdb.findShowArtwork(
    result.show.imdbId,
    result.show.tvdbId
  );
  upsertShow(result.show, artwork);
  upsertEpisodes(tvmazeId, result.episodes);
  return getShowRow(tvmazeId);
}

export function unfollowShow(showId: number): void {
  getDb().runSync("DELETE FROM shows WHERE id = ?", showId);
}

export function setShowRating(showId: number, rating: number | null): void {
  getDb().runSync("UPDATE shows SET rating = ? WHERE id = ?", rating, showId);
}

export function setShowReview(showId: number, review: string | null): void {
  getDb().runSync(
    "UPDATE shows SET review = ? WHERE id = ?",
    review?.trim() || null,
    showId
  );
}

/**
 * Star or unstar a show. Local only, like every other repo write — screens
 * pair it with social.setFavorite the same way marking an episode is paired
 * with recordWatchForEpisode, so this layer keeps no opinion about accounts.
 *
 * A timestamp rather than a flag: the showcase orders by when you picked each
 * one, and that needs no second column.
 */
export function setFavorite(showId: number, favorite: boolean): void {
  getDb().runSync(
    "UPDATE shows SET favorited_at = ? WHERE id = ?",
    favorite ? new Date().toISOString() : null,
    showId
  );
}

/**
 * Hours between the first and last episode of a show being marked watched.
 *
 * Separates having watched a show from having just told the app you watched
 * it. Populating a library dumps a whole series in seconds; even a punishing
 * binge takes longer than that. Null when fewer than two episodes carry a
 * timestamp, which is not enough to tell either way.
 */
export function watchSpanHours(showId: number): number | null {
  const row = getDb().getFirstSync<{
    first: string | null;
    last: string | null;
    n: number;
  }>(
    `SELECT MIN(watched_at) AS first, MAX(watched_at) AS last, COUNT(*) AS n
     FROM episodes WHERE show_id = ? AND watched_at IS NOT NULL`,
    showId
  );
  if (!row?.first || !row.last || row.n < 2) return null;
  const span = Date.parse(row.last) - Date.parse(row.first);
  return Number.isNaN(span) ? null : span / 3_600_000;
}

/** Your starred shows, in the order you put them. */
export function favorites(): ShowRow[] {
  return favoritesOf(
    getDb().getAllSync<ShowRow>(
      "SELECT * FROM shows WHERE favorited_at IS NOT NULL"
    )
  );
}

/** Write a whole order at once; ids not present are cleared back to unranked. */
export function setFavoriteOrder(showIds: number[]): void {
  const db = getDb();
  db.runSync("UPDATE shows SET favorite_rank = NULL");
  showIds.forEach((id, i) => {
    db.runSync("UPDATE shows SET favorite_rank = ? WHERE id = ?", i, id);
  });
}

export function setArchived(showId: number, archived: boolean): void {
  getDb().runSync(
    "UPDATE shows SET archived = ? WHERE id = ?",
    archived ? 1 : 0,
    showId
  );
}

export async function syncShow(showId: number): Promise<boolean> {
  const result = await tvmaze.getShowWithEpisodes(showId);
  if (!result) return false;
  const existing = getShowRow(showId);
  const artwork =
    existing?.tmdb_id != null
      ? {
          tmdbId: existing.tmdb_id,
          posterUrl: existing.poster_url,
          backdropUrl: existing.backdrop_url,
        }
      : await tmdb.findShowArtwork(result.show.imdbId, result.show.tvdbId);
  upsertShow(result.show, artwork);
  upsertEpisodes(showId, result.episodes);
  return true;
}

export async function syncStaleShows(
  maxAgeHours = 12,
  opts: {
    limit?: number;
    concurrency?: number;
    /**
     * "activity" spends a capped budget on the shows that most recently
     * aired something (what a pull-to-refresh user is actually looking
     * for); "stale" (default) works oldest-sync-first (background repair).
     */
    prioritize?: "stale" | "activity";
  } = {}
): Promise<{ synced: number; failed: number }> {
  const rows = getDb().getAllSync<{
    id: number;
    status: string;
    last_synced_at: string | null;
    last_aired: string | null;
  }>(
    `SELECT s.id, s.status, s.last_synced_at,
            MAX(CASE WHEN e.airstamp IS NOT NULL AND e.airstamp <= $now
                     THEN e.airstamp END) AS last_aired
     FROM shows s LEFT JOIN episodes e ON e.show_id = s.id
     GROUP BY s.id`,
    { $now: nowIso() }
  );
  const now = Date.now();

  const stale = rows
    .filter((row) => {
      const ageHours = row.last_synced_at
        ? (now - Date.parse(row.last_synced_at)) / 3_600_000
        : Infinity;
      const threshold = row.status === "Ended" ? 24 * 7 : maxAgeHours;
      return ageHours >= threshold;
    })
    .sort((a, b) => {
      const ended =
        (a.status === "Ended" ? 1 : 0) - (b.status === "Ended" ? 1 : 0);
      if (ended !== 0) return ended; // airing shows first either way
      return opts.prioritize === "activity"
        ? (b.last_aired ?? "").localeCompare(a.last_aired ?? "")
        : (a.last_synced_at ?? "").localeCompare(b.last_synced_at ?? "");
    })
    .slice(0, opts.limit ?? Infinity);

  // A few in flight, paced under TVmaze's ~20 requests / 10s budget — bursts
  // just trade time for 429 backoff sleeps. Sequential syncs of a 250-show
  // library took minutes; this keeps the same rate ceiling without idling.
  const width = Math.max(1, opts.concurrency ?? 1);
  let synced = 0;
  let failed = 0;
  for (let i = 0; i < stale.length; i += width) {
    const results = await Promise.all(
      stale.slice(i, i + width).map(async (row) => {
        try {
          return await syncShow(row.id);
        } catch {
          return false;
        }
      })
    );
    for (const ok of results) ok ? synced++ : failed++;
    if (width > 1 && i + width < stale.length) {
      await new Promise((r) => setTimeout(r, width * 500));
    }
  }
  return { synced, failed };
}

// ------------------------------------------------------------------- watching

export function markEpisode(
  episodeId: number,
  watched: boolean,
  at?: string
): void {
  if (watched) {
    getDb().runSync(
      "UPDATE episodes SET watched_at = ?, plays = MAX(plays, 1) WHERE id = ?",
      at ?? nowIso(),
      episodeId
    );
  } else {
    // Keep plays: an accidental un-check must not erase rewatch history.
    // Re-marking restores the old count via MAX(plays, 1).
    getDb().runSync(
      "UPDATE episodes SET watched_at = NULL WHERE id = ?",
      episodeId
    );
  }
}

/** Log another watch of an already-seen episode (rewatch). */
export function logRewatch(episodeId: number): void {
  getDb().runSync(
    "UPDATE episodes SET plays = MAX(plays, 1) + 1, watched_at = ? WHERE id = ?",
    nowIso(),
    episodeId
  );
}

/** Undo one rewatch (never drops below a single watch). Local-only. */
export function removeRewatch(episodeId: number): void {
  getDb().runSync(
    "UPDATE episodes SET plays = MAX(1, plays - 1) WHERE id = ?",
    episodeId
  );
}

/** Start a fresh rewatch of a whole show: +1 play on every aired episode. */
export function rewatchShow(showId: number): void {
  getDb().runSync(
    `UPDATE episodes SET plays = MAX(plays, 1) + 1, watched_at = ?
     WHERE show_id = ? AND airstamp IS NOT NULL AND airstamp <= ?`,
    nowIso(),
    showId,
    nowIso()
  );
}

export function markSeason(
  showId: number,
  season: number,
  watched: boolean
): void {
  if (watched) {
    // Aired episodes only — a mid-air season must not get future episodes
    // stamped watched (they'd never show up in Watch Next).
    getDb().runSync(
      `UPDATE episodes SET watched_at = ?, plays = MAX(plays, 1)
       WHERE show_id = ? AND season = ? AND watched_at IS NULL
         AND airstamp IS NOT NULL AND airstamp <= ?`,
      nowIso(),
      showId,
      season,
      nowIso()
    );
  } else {
    getDb().runSync(
      "UPDATE episodes SET watched_at = NULL WHERE show_id = ? AND season = ?",
      showId,
      season
    );
  }
}

export function markShow(showId: number, watched: boolean): void {
  if (watched) {
    getDb().runSync(
      `UPDATE episodes SET watched_at = ?, plays = MAX(plays, 1)
       WHERE show_id = ? AND watched_at IS NULL
         AND airstamp IS NOT NULL AND airstamp <= ?`,
      nowIso(),
      showId,
      nowIso()
    );
  } else {
    getDb().runSync(
      "UPDATE episodes SET watched_at = NULL WHERE show_id = ?",
      showId
    );
  }
}

export function markUpTo(showId: number, episodeId: number): void {
  const db = getDb();
  const target = db.getFirstSync<{ season: number; number: number }>(
    "SELECT season, number FROM episodes WHERE id = ? AND show_id = ?",
    episodeId,
    showId
  );
  if (!target) return;
  const now = nowIso();
  db.runSync(
    // Aired only, for the same reason markSeason and markShow filter: an
    // episode stamped watched before it airs never surfaces in Watch Next
    // again. A gap earlier in a season that hasn't finished airing is the
    // realistic case.
    `UPDATE episodes SET watched_at = ?, plays = MAX(plays, 1)
     WHERE show_id = ? AND watched_at IS NULL
       AND airstamp IS NOT NULL AND airstamp <= ?
       AND (season < ? OR (season = ? AND number <= ?))`,
    now,
    showId,
    now,
    target.season,
    target.season,
    target.number
  );
}

/**
 * Aired-but-unwatched episodes sitting before `episodeId` in the same show —
 * the backlog you skipped over. Zero for the normal case of watching in order,
 * which is what keeps the catch-up prompt from firing on every single tap.
 */
export function countUnwatchedBefore(showId: number, episodeId: number): number {
  const db = getDb();
  const target = db.getFirstSync<{ season: number; number: number }>(
    "SELECT season, number FROM episodes WHERE id = ? AND show_id = ?",
    episodeId,
    showId
  );
  if (!target) return 0;
  const row = db.getFirstSync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM episodes
     WHERE show_id = ? AND watched_at IS NULL
       AND airstamp IS NOT NULL AND airstamp <= ?
       AND (season < ? OR (season = ? AND number < ?))`,
    showId,
    nowIso(),
    target.season,
    target.season,
    target.number
  );
  return row?.n ?? 0;
}

export function markEpisodeBySeasonNumber(
  showId: number,
  season: number,
  number: number,
  watchedAt?: string
): boolean {
  // Prefer the export's own watch date, then the episode's air date, then now —
  // so imported history lands on real dates instead of the import moment.
  const result = getDb().runSync(
    `UPDATE episodes
       SET watched_at = COALESCE(watched_at, ?, airstamp, ?),
           plays = MAX(plays, 1)
     WHERE show_id = ? AND season = ? AND number = ?`,
    watchedAt ?? null,
    nowIso(),
    showId,
    season,
    number
  );
  return result.changes > 0;
}

// -------------------------------------------------------------------- queries

export function listFollowedShowIds(): number[] {
  return getDb()
    .getAllSync<{ id: number }>("SELECT id FROM shows")
    .map((r) => r.id);
}

export function countWatchedEpisodes(): number {
  return (
    getDb().getFirstSync<{ n: number }>(
      "SELECT COUNT(*) AS n FROM episodes WHERE watched_at IS NOT NULL"
    )?.n ?? 0
  );
}

/** All watched (show, season, episode, rating) tuples in one indexed scan. */
export function listWatchedRows(showId?: number): {
  show_id: number;
  season: number;
  episode: number;
  rating: number | null;
  watched_at: string | null;
}[] {
  const where =
    showId != null ? "watched_at IS NOT NULL AND show_id = ?" : "watched_at IS NOT NULL";
  const params = showId != null ? [showId] : [];
  return getDb().getAllSync(
    `SELECT show_id, season, number AS episode, rating, watched_at
     FROM episodes WHERE ${where}`,
    ...params
  );
}

export interface HistoryEntry {
  episode_id: number;
  show_id: number;
  show_name: string;
  poster_url: string | null;
  season: number;
  number: number;
  episode_name: string;
  watched_at: string;
  rating: number | null;
}

/** The watch diary: everything watched, newest first, paginated. */
export function watchHistory(limit: number, offset: number): HistoryEntry[] {
  return getDb().getAllSync<HistoryEntry>(
    `SELECT e.id AS episode_id, e.show_id, s.name AS show_name, s.poster_url,
            e.season, e.number, e.name AS episode_name, e.watched_at, e.rating
     FROM episodes e JOIN shows s ON s.id = e.show_id
     WHERE e.watched_at IS NOT NULL
     ORDER BY e.watched_at DESC, e.id DESC
     LIMIT ? OFFSET ?`,
    limit,
    offset
  );
}

/** Diary edit: move a watch to a different date (stays watched). */
export function setWatchedDate(episodeId: number, at: string): void {
  getDb().runSync(
    "UPDATE episodes SET watched_at = ? WHERE id = ? AND watched_at IS NOT NULL",
    at,
    episodeId
  );
}

/** Local episode id for a (show, season, number) triple — used by feed links. */
export function findEpisodeId(
  showId: number,
  season: number,
  number: number
): number | null {
  return (
    getDb().getFirstSync<{ id: number }>(
      "SELECT id FROM episodes WHERE show_id = ? AND season = ? AND number = ?",
      showId,
      season,
      number
    )?.id ?? null
  );
}

export function getShowRow(showId: number): ShowRow | null {
  return (
    getDb().getFirstSync<ShowRow>("SELECT * FROM shows WHERE id = ?", showId) ??
    null
  );
}

export function getEpisodes(showId: number): EpisodeRow[] {
  return getDb().getAllSync<EpisodeRow>(
    "SELECT * FROM episodes WHERE show_id = ? ORDER BY season, number",
    showId
  );
}

export function getEpisode(episodeId: number): EpisodeRow | null {
  return (
    getDb().getFirstSync<EpisodeRow>(
      "SELECT * FROM episodes WHERE id = ?",
      episodeId
    ) ?? null
  );
}

/**
 * Set (or clear, with null) the ½–5 star rating for an episode. Rating an
 * episode implies you watched it, so it also stamps watched_at if unset.
 */
export function setRating(episodeId: number, rating: number | null): void {
  getDb().runSync(
    `UPDATE episodes
     SET rating = ?,
         watched_at = CASE WHEN ? IS NOT NULL THEN COALESCE(watched_at, ?) ELSE watched_at END,
         plays = CASE WHEN ? IS NOT NULL THEN MAX(plays, 1) ELSE plays END
     WHERE id = ?`,
    rating,
    rating,
    new Date().toISOString(),
    rating,
    episodeId
  );
}

interface ProgressAgg {
  show_id: number;
  total_episodes: number;
  episode_count: number;
  watched_count: number;
  aired_unwatched: number;
  next_airstamp: string | null;
  last_aired: string | null;
}

export function listShowsWithProgress(): ShowWithProgress[] {
  const now = nowIso();
  const shows = getDb().getAllSync<ShowRow>(
    "SELECT * FROM shows ORDER BY name COLLATE NOCASE"
  );
  const aggs = getDb().getAllSync<ProgressAgg>(
    `SELECT show_id,
            COUNT(*) AS total_episodes,
            SUM(CASE WHEN airstamp IS NOT NULL AND airstamp <= $now THEN 1 ELSE 0 END) AS episode_count,
            SUM(CASE WHEN watched_at IS NOT NULL THEN 1 ELSE 0 END) AS watched_count,
            SUM(CASE WHEN watched_at IS NULL AND airstamp IS NOT NULL AND airstamp <= $now THEN 1 ELSE 0 END) AS aired_unwatched,
            MIN(CASE WHEN airstamp IS NOT NULL AND airstamp > $now THEN airstamp END) AS next_airstamp,
            MAX(CASE WHEN airstamp IS NOT NULL AND airstamp <= $now THEN airstamp END) AS last_aired
     FROM episodes GROUP BY show_id`,
    { $now: now }
  );
  const progress = new Map(aggs.map((a) => [a.show_id, a]));
  return shows.map((s) => {
    const p = progress.get(s.id) ?? {
      show_id: s.id,
      total_episodes: 0,
      episode_count: 0,
      watched_count: 0,
      aired_unwatched: 0,
      next_airstamp: null,
      last_aired: null,
    };
    return {
      ...s,
      total_episodes: p.total_episodes,
      episode_count: p.episode_count,
      watched_count: p.watched_count,
      aired_unwatched: p.aired_unwatched,
      next_airstamp: p.next_airstamp,
      last_aired: p.last_aired,
      category: computeCategory({
        archived: s.archived === 1,
        watchedCount: p.watched_count,
        airedUnwatched: p.aired_unwatched,
        status: s.status,
      }),
    };
  });
}

export function watchNext(): WatchNextItem[] {
  const db = getDb();
  const now = nowIso();
  // First unwatched aired episode per show via a GROUP BY on a season+number
  // sort key — one indexed aggregate instead of the old correlated NOT
  // EXISTS, which was O(behind × episodes-per-show) and janked tab focus at
  // an 11k-episode library. (Episode numbers are always < 100000.)
  // `number BETWEEN 0 AND 99999` enforces the packing invariant rather than
  // trusting it: an out-of-range episode number would silently corrupt the
  // per-show MIN instead of erroring.
  const rows = db.getAllSync<EpisodeRow>(
    `SELECT e.*
     FROM episodes e
     JOIN (
       SELECT show_id, MIN(season * 100000 + number) AS pos
       FROM episodes
       WHERE watched_at IS NULL AND airstamp IS NOT NULL AND airstamp <= $now
         AND number BETWEEN 0 AND 99999
       GROUP BY show_id
     ) f ON f.show_id = e.show_id
        AND e.season * 100000 + e.number = f.pos
     JOIN shows s ON s.id = e.show_id AND s.archived = 0
     WHERE e.watched_at IS NULL
       AND e.airstamp IS NOT NULL AND e.airstamp <= $now
     ORDER BY e.airstamp DESC`,
    { $now: now }
  );
  const behind = db.getAllSync<{ show_id: number; n: number }>(
    `SELECT show_id, COUNT(*) AS n FROM episodes
     WHERE watched_at IS NULL AND airstamp IS NOT NULL AND airstamp <= ?
     GROUP BY show_id`,
    now
  );
  const behindMap = new Map(behind.map((b) => [b.show_id, b.n]));
  const watchedAgg = db.getAllSync<{
    show_id: number;
    n: number;
    latest: string | null;
  }>(
    `SELECT show_id, COUNT(*) AS n, MAX(watched_at) AS latest
     FROM episodes WHERE watched_at IS NOT NULL GROUP BY show_id`
  );
  const watchedMap = new Map(watchedAgg.map((w) => [w.show_id, w]));
  // One query for exactly the shows that have a backlog — not getShowRow per
  // row (N+1), and not all 250 shows' full rows for a 3-show backlog either.
  const showMap = new Map(
    db
      .getAllSync<ShowRow>(
        `SELECT * FROM shows WHERE archived = 0 AND id IN (
           SELECT DISTINCT show_id FROM episodes
           WHERE watched_at IS NULL AND airstamp IS NOT NULL AND airstamp <= ?
         )`,
        now
      )
      .map((s) => [s.id, s])
  );
  return rows.map((episode) => ({
    show: showMap.get(episode.show_id)!,
    episode,
    aired_unwatched: behindMap.get(episode.show_id) ?? 0,
    watched_count: watchedMap.get(episode.show_id)?.n ?? 0,
    last_watched_at: watchedMap.get(episode.show_id)?.latest ?? null,
  }));
}

/**
 * Every announced future episode of your shows, earliest first. Pass `days` to
 * cap how far ahead to look; omit it (the default) to show everything we have
 * air dates for, out to the last known episode.
 */
export function upcoming(days?: number): UpcomingItem[] {
  const now = nowIso();
  const params: string[] = [now];
  let upperBound = "";
  if (days != null) {
    upperBound = " AND e.airstamp <= ?";
    params.push(new Date(Date.now() + days * 86_400_000).toISOString());
  }
  const rows = getDb().getAllSync<EpisodeRow>(
    `SELECT e.* FROM episodes e
     JOIN shows s ON s.id = e.show_id AND s.archived = 0
     WHERE e.airstamp IS NOT NULL AND e.airstamp > ?${upperBound}
     ORDER BY e.airstamp ASC`,
    ...params
  );
  const showCache = new Map<number, ShowRow>();
  return rows.map((episode) => {
    let show = showCache.get(episode.show_id);
    if (!show) {
      show = getShowRow(episode.show_id)!;
      showCache.set(episode.show_id, show);
    }
    return { show, episode };
  });
}

// ---------------------------------------------------------------------- stats

export interface Stats {
  showsFollowed: number;
  episodesWatched: number;
  minutesWatched: number;
  showsFinished: number;
  episodesBehind: number;
  averageRating: number | null; // mean of your episode star ratings
  ratedCount: number;
  topGenres: { genre: string; minutes: number }[];
  mostWatched: { show: ShowRow; watched: number; minutes: number }[];
  monthly: { month: string; episodes: number }[];
}

export function stats(): Stats {
  const db = getDb();
  const now = nowIso();
  const shows = listShowsWithProgress();

  const watchedRows = db.getAllSync<{
    show_id: number;
    n: number;
    minutes: number;
  }>(
    `SELECT e.show_id, COUNT(*) AS n,
            SUM(COALESCE(e.runtime, s.runtime, 40)) AS minutes
     FROM episodes e JOIN shows s ON s.id = e.show_id
     WHERE e.watched_at IS NOT NULL
     GROUP BY e.show_id`
  );

  let episodesWatched = 0;
  let minutesWatched = 0;
  const genreMinutes = new Map<string, number>();
  const perShow: { show: ShowRow; watched: number; minutes: number }[] = [];
  const showById = new Map(shows.map((s) => [s.id, s]));

  for (const row of watchedRows) {
    episodesWatched += row.n;
    minutesWatched += row.minutes;
    const show = showById.get(row.show_id);
    if (!show) continue;
    perShow.push({ show, watched: row.n, minutes: row.minutes });
    for (const genre of JSON.parse(show.genres) as string[]) {
      genreMinutes.set(genre, (genreMinutes.get(genre) ?? 0) + row.minutes);
    }
  }

  const monthly = db
    .getAllSync<{ month: string; episodes: number }>(
      `SELECT substr(watched_at, 1, 7) AS month, COUNT(*) AS episodes
       FROM episodes WHERE watched_at IS NOT NULL
       GROUP BY month ORDER BY month DESC LIMIT 12`
    )
    .reverse();

  const episodesBehind =
    db.getFirstSync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM episodes e
       JOIN shows s ON s.id = e.show_id AND s.archived = 0
       WHERE e.watched_at IS NULL AND e.airstamp IS NOT NULL AND e.airstamp <= ?`,
      now
    )?.n ?? 0;

  const ratingAgg = db.getFirstSync<{ n: number; avg: number | null }>(
    "SELECT COUNT(*) AS n, AVG(rating) AS avg FROM episodes WHERE rating IS NOT NULL"
  );

  return {
    showsFollowed: shows.length,
    episodesWatched,
    minutesWatched,
    showsFinished: shows.filter((s) => s.category === "finished").length,
    episodesBehind,
    ratedCount: ratingAgg?.n ?? 0,
    averageRating: ratingAgg?.avg ?? null,
    topGenres: [...genreMinutes.entries()]
      .map(([genre, minutes]) => ({ genre, minutes }))
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 6),
    mostWatched: perShow.sort((a, b) => b.minutes - a.minutes).slice(0, 5),
    monthly,
  };
}
