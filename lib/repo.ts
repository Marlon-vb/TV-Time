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
    getDb().prepare("SELECT 1 FROM shows WHERE id = ?").get(showId)
  );
}

function upsertShow(show: RemoteShow, artwork?: {
  tmdbId: number | null;
  posterUrl: string | null;
  backdropUrl: string | null;
} | null): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO shows (id, name, tvdb_id, imdb_id, tmdb_id, poster_url, backdrop_url,
                        status, network, runtime, premiered, genres, summary,
                        followed_at, archived, last_synced_at)
     VALUES (@id, @name, @tvdb_id, @imdb_id, @tmdb_id, @poster_url, @backdrop_url,
             @status, @network, @runtime, @premiered, @genres, @summary,
             @followed_at, 0, @last_synced_at)
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
       last_synced_at = excluded.last_synced_at`
  ).run({
    id: show.id,
    name: show.name,
    tvdb_id: show.tvdbId,
    imdb_id: show.imdbId,
    tmdb_id: artwork?.tmdbId ?? null,
    poster_url: artwork?.posterUrl ?? show.posterUrl,
    backdrop_url: artwork?.backdropUrl ?? show.backdropUrl,
    status: show.status,
    network: show.network,
    runtime: show.runtime,
    premiered: show.premiered,
    genres: JSON.stringify(show.genres),
    summary: show.summary,
    followed_at: nowIso(),
    last_synced_at: nowIso(),
  });
}

function upsertEpisodes(showId: number, episodes: RemoteEpisode[]): void {
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO episodes (id, show_id, season, number, name, airdate, airstamp,
                           runtime, summary, image_url, watched_at)
     VALUES (@id, @show_id, @season, @number, @name, @airdate, @airstamp,
             @runtime, @summary, @image_url, NULL)
     ON CONFLICT(id) DO UPDATE SET
       season = excluded.season,
       number = excluded.number,
       name = excluded.name,
       airdate = excluded.airdate,
       airstamp = excluded.airstamp,
       runtime = excluded.runtime,
       summary = excluded.summary,
       image_url = excluded.image_url`
    // watched_at intentionally preserved on update
  );
  const insertAll = db.transaction((eps: RemoteEpisode[]) => {
    for (const e of eps) {
      stmt.run({
        id: e.id,
        show_id: showId,
        season: e.season,
        number: e.number,
        name: e.name,
        airdate: e.airdate,
        airstamp: utcStamp(e.airstamp),
        runtime: e.runtime,
        summary: e.summary,
        image_url: e.imageUrl,
      });
    }
  });
  insertAll(episodes);
}

/** Follow a show by TVmaze id: fetches metadata + episodes and stores them. */
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
  getDb().prepare("DELETE FROM shows WHERE id = ?").run(showId);
}

export function setArchived(showId: number, archived: boolean): void {
  getDb()
    .prepare("UPDATE shows SET archived = ? WHERE id = ?")
    .run(archived ? 1 : 0, showId);
}

/** Refresh one show's metadata and episode list from the provider. */
export async function syncShow(showId: number): Promise<boolean> {
  const result = await tvmaze.getShowWithEpisodes(showId);
  if (!result) return false;
  const existing = getShowRow(showId);
  // Keep TMDB artwork if we already have it; re-enrich if we never did.
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

/**
 * Refresh shows whose data is older than maxAgeHours. Ended shows rarely
 * change, so they're refreshed far less often.
 */
export async function syncStaleShows(
  maxAgeHours = 12
): Promise<{ synced: number; failed: number }> {
  const rows = getDb()
    .prepare("SELECT id, status, last_synced_at FROM shows")
    .all() as Pick<ShowRow, "id" | "status" | "last_synced_at">[];
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
  getDb()
    .prepare("UPDATE episodes SET watched_at = ? WHERE id = ?")
    .run(watched ? nowIso() : null, episodeId);
}

export function markSeason(
  showId: number,
  season: number,
  watched: boolean
): void {
  if (watched) {
    // Preserve existing watch dates; only stamp episodes not yet watched.
    getDb()
      .prepare(
        `UPDATE episodes SET watched_at = ?
         WHERE show_id = ? AND season = ? AND watched_at IS NULL`
      )
      .run(nowIso(), showId, season);
  } else {
    getDb()
      .prepare(
        "UPDATE episodes SET watched_at = NULL WHERE show_id = ? AND season = ?"
      )
      .run(showId, season);
  }
}

export function markShow(showId: number, watched: boolean): void {
  if (watched) {
    // Only mark aired episodes — you can't have seen the future.
    getDb()
      .prepare(
        `UPDATE episodes SET watched_at = ?
         WHERE show_id = ? AND watched_at IS NULL
           AND airstamp IS NOT NULL AND airstamp <= ?`
      )
      .run(nowIso(), showId, nowIso());
  } else {
    getDb()
      .prepare("UPDATE episodes SET watched_at = NULL WHERE show_id = ?")
      .run(showId);
  }
}

/** Mark an episode and everything before it (same show) as watched. */
export function markUpTo(showId: number, episodeId: number): void {
  const db = getDb();
  const target = db
    .prepare("SELECT season, number FROM episodes WHERE id = ? AND show_id = ?")
    .get(episodeId, showId) as { season: number; number: number } | undefined;
  if (!target) return;
  db.prepare(
    `UPDATE episodes SET watched_at = ?
     WHERE show_id = ? AND watched_at IS NULL
       AND (season < ? OR (season = ? AND number <= ?))`
  ).run(nowIso(), showId, target.season, target.season, target.number);
}

export function markEpisodeBySeasonNumber(
  showId: number,
  season: number,
  number: number,
  watchedAt?: string
): boolean {
  const result = getDb()
    .prepare(
      `UPDATE episodes SET watched_at = COALESCE(watched_at, ?)
       WHERE show_id = ? AND season = ? AND number = ?`
    )
    .run(watchedAt ?? nowIso(), showId, season, number);
  return result.changes > 0;
}

// -------------------------------------------------------------------- queries

export function getShowRow(showId: number): ShowRow | null {
  return (
    (getDb()
      .prepare("SELECT * FROM shows WHERE id = ?")
      .get(showId) as ShowRow | undefined) ?? null
  );
}

export function getEpisodes(showId: number): EpisodeRow[] {
  return getDb()
    .prepare(
      "SELECT * FROM episodes WHERE show_id = ? ORDER BY season, number"
    )
    .all(showId) as EpisodeRow[];
}

interface ProgressAgg {
  show_id: number;
  total_episodes: number;
  episode_count: number;
  watched_count: number;
  aired_unwatched: number;
  next_airstamp: string | null;
}

function progressByShow(): Map<number, ProgressAgg> {
  const now = nowIso();
  const rows = getDb()
    .prepare(
      `SELECT show_id,
              COUNT(*) AS total_episodes,
              SUM(CASE WHEN airstamp IS NOT NULL AND airstamp <= @now THEN 1 ELSE 0 END) AS episode_count,
              SUM(CASE WHEN watched_at IS NOT NULL THEN 1 ELSE 0 END) AS watched_count,
              SUM(CASE WHEN watched_at IS NULL AND airstamp IS NOT NULL AND airstamp <= @now THEN 1 ELSE 0 END) AS aired_unwatched,
              MIN(CASE WHEN airstamp IS NOT NULL AND airstamp > @now THEN airstamp END) AS next_airstamp
       FROM episodes GROUP BY show_id`
    )
    .all({ now }) as ProgressAgg[];
  return new Map(rows.map((r) => [r.show_id, r]));
}

export function listShowsWithProgress(): ShowWithProgress[] {
  const shows = getDb()
    .prepare("SELECT * FROM shows ORDER BY name COLLATE NOCASE")
    .all() as ShowRow[];
  const progress = progressByShow();
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

/**
 * The heart of the app: for every followed (non-archived) show with aired,
 * unwatched episodes, the next episode to watch in order — plus how far
 * behind you are. Sorted so freshly-aired shows float to the top.
 */
export function watchNext(): WatchNextItem[] {
  const db = getDb();
  const now = nowIso();
  const rows = db
    .prepare(
      `SELECT e.*
       FROM episodes e
       JOIN shows s ON s.id = e.show_id AND s.archived = 0
       WHERE e.watched_at IS NULL
         AND e.airstamp IS NOT NULL AND e.airstamp <= @now
         AND NOT EXISTS (
           SELECT 1 FROM episodes e2
           WHERE e2.show_id = e.show_id
             AND e2.watched_at IS NULL
             AND e2.airstamp IS NOT NULL AND e2.airstamp <= @now
             AND (e2.season < e.season OR (e2.season = e.season AND e2.number < e.number))
         )
       ORDER BY e.airstamp DESC`
    )
    .all({ now }) as EpisodeRow[];

  const behind = db
    .prepare(
      `SELECT show_id, COUNT(*) AS n FROM episodes
       WHERE watched_at IS NULL AND airstamp IS NOT NULL AND airstamp <= ?
       GROUP BY show_id`
    )
    .all(now) as { show_id: number; n: number }[];
  const behindMap = new Map(behind.map((b) => [b.show_id, b.n]));

  return rows.map((episode) => ({
    show: getShowRow(episode.show_id)!,
    episode,
    aired_unwatched: behindMap.get(episode.show_id) ?? 0,
  }));
}

/** Future episodes of followed shows within the next `days` days. */
export function upcoming(days = 90): UpcomingItem[] {
  const now = nowIso();
  const until = new Date(Date.now() + days * 86_400_000).toISOString();
  const rows = getDb()
    .prepare(
      `SELECT e.* FROM episodes e
       JOIN shows s ON s.id = e.show_id AND s.archived = 0
       WHERE e.airstamp IS NOT NULL AND e.airstamp > ? AND e.airstamp <= ?
       ORDER BY e.airstamp ASC`
    )
    .all(now, until) as EpisodeRow[];
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
  topGenres: { genre: string; minutes: number }[];
  mostWatched: { show: ShowRow; watched: number; minutes: number }[];
  monthly: { month: string; episodes: number }[];
}

export function stats(): Stats {
  const db = getDb();
  const now = nowIso();
  const shows = listShowsWithProgress();

  const watchedRows = db
    .prepare(
      `SELECT e.show_id, COUNT(*) AS n,
              SUM(COALESCE(e.runtime, s.runtime, 40)) AS minutes
       FROM episodes e JOIN shows s ON s.id = e.show_id
       WHERE e.watched_at IS NOT NULL
       GROUP BY e.show_id`
    )
    .all() as { show_id: number; n: number; minutes: number }[];

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

  const monthlyRows = db
    .prepare(
      `SELECT substr(watched_at, 1, 7) AS month, COUNT(*) AS episodes
       FROM episodes WHERE watched_at IS NOT NULL
       GROUP BY month ORDER BY month DESC LIMIT 12`
    )
    .all() as { month: string; episodes: number }[];

  const episodesBehind = (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM episodes e
         JOIN shows s ON s.id = e.show_id AND s.archived = 0
         WHERE e.watched_at IS NULL AND e.airstamp IS NOT NULL AND e.airstamp <= ?`
      )
      .get(now) as { n: number }
  ).n;

  return {
    showsFollowed: shows.length,
    episodesWatched,
    minutesWatched,
    showsFinished: shows.filter((s) => s.category === "finished").length,
    episodesBehind,
    topGenres: [...genreMinutes.entries()]
      .map(([genre, minutes]) => ({ genre, minutes }))
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 6),
    mostWatched: perShow.sort((a, b) => b.minutes - a.minutes).slice(0, 5),
    monthly: monthlyRows.reverse(),
  };
}
