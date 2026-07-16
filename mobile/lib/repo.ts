import { getDb } from "./db";
import * as tvmaze from "./tvmaze";
import * as tmdb from "./tmdb";
import { computeCategory } from "./categories";
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
                               runtime, summary, image_url, watched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
         ON CONFLICT(id) DO UPDATE SET
           season = excluded.season,
           number = excluded.number,
           name = excluded.name,
           airdate = excluded.airdate,
           airstamp = excluded.airstamp,
           runtime = excluded.runtime,
           summary = excluded.summary,
           image_url = excluded.image_url`,
        e.id,
        showId,
        e.season,
        e.number,
        e.name,
        e.airdate,
        utcStamp(e.airstamp),
        e.runtime,
        e.summary,
        e.imageUrl
      );
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
  maxAgeHours = 12
): Promise<{ synced: number; failed: number }> {
  const rows = getDb().getAllSync<
    Pick<ShowRow, "id" | "status" | "last_synced_at">
  >("SELECT id, status, last_synced_at FROM shows");
  const now = Date.now();
  let synced = 0;
  let failed = 0;
  for (const row of rows) {
    const ageHours = row.last_synced_at
      ? (now - Date.parse(row.last_synced_at)) / 3_600_000
      : Infinity;
    const threshold = row.status === "Ended" ? 24 * 7 : maxAgeHours;
    if (ageHours < threshold) continue;
    try {
      (await syncShow(row.id)) ? synced++ : failed++;
    } catch {
      failed++;
    }
  }
  return { synced, failed };
}

// ------------------------------------------------------------------- watching

export function markEpisode(episodeId: number, watched: boolean): void {
  if (watched) {
    getDb().runSync(
      "UPDATE episodes SET watched_at = ?, plays = MAX(plays, 1) WHERE id = ?",
      nowIso(),
      episodeId
    );
  } else {
    getDb().runSync(
      "UPDATE episodes SET watched_at = NULL, plays = 0 WHERE id = ?",
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
    getDb().runSync(
      "UPDATE episodes SET watched_at = ?, plays = MAX(plays, 1) WHERE show_id = ? AND season = ? AND watched_at IS NULL",
      nowIso(),
      showId,
      season
    );
  } else {
    getDb().runSync(
      "UPDATE episodes SET watched_at = NULL, plays = 0 WHERE show_id = ? AND season = ?",
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
      "UPDATE episodes SET watched_at = NULL, plays = 0 WHERE show_id = ?",
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
  db.runSync(
    `UPDATE episodes SET watched_at = ?, plays = MAX(plays, 1)
     WHERE show_id = ? AND watched_at IS NULL
       AND (season < ? OR (season = ? AND number <= ?))`,
    nowIso(),
    showId,
    target.season,
    target.season,
    target.number
  );
}

export function markEpisodeBySeasonNumber(
  showId: number,
  season: number,
  number: number,
  watchedAt?: string
): boolean {
  const result = getDb().runSync(
    `UPDATE episodes SET watched_at = COALESCE(watched_at, ?)
     WHERE show_id = ? AND season = ? AND number = ?`,
    watchedAt ?? nowIso(),
    showId,
    season,
    number
  );
  return result.changes > 0;
}

// -------------------------------------------------------------------- queries

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
            MIN(CASE WHEN airstamp IS NOT NULL AND airstamp > $now THEN airstamp END) AS next_airstamp
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
    };
    return {
      ...s,
      total_episodes: p.total_episodes,
      episode_count: p.episode_count,
      watched_count: p.watched_count,
      aired_unwatched: p.aired_unwatched,
      next_airstamp: p.next_airstamp,
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
  const rows = db.getAllSync<EpisodeRow>(
    `SELECT e.*
     FROM episodes e
     JOIN shows s ON s.id = e.show_id AND s.archived = 0
     WHERE e.watched_at IS NULL
       AND e.airstamp IS NOT NULL AND e.airstamp <= $now
       AND NOT EXISTS (
         SELECT 1 FROM episodes e2
         WHERE e2.show_id = e.show_id
           AND e2.watched_at IS NULL
           AND e2.airstamp IS NOT NULL AND e2.airstamp <= $now
           AND (e2.season < e.season OR (e2.season = e.season AND e2.number < e.number))
       )
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
  return rows.map((episode) => ({
    show: getShowRow(episode.show_id)!,
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

  for (const row of watchedRows) {
    episodesWatched += row.n;
    minutesWatched += row.minutes;
    const show = shows.find((s) => s.id === row.show_id);
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
