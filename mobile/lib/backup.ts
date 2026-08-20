import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as repo from "./repo";
import { getDb } from "./db";
import { reconcileAll } from "./social/mirror";

/**
 * Full-fidelity backup of the library — the user's 11k-episode watch history
 * lives in one on-device SQLite file, so give them a way out. The JSON keeps
 * everything the importers can't reconstruct (watch dates, ratings, plays,
 * show notes) and restores losslessly on any device.
 */

export interface BackupEpisode {
  id: number; // TVmaze episode id
  season: number;
  number: number;
  watched_at: string | null;
  rating: number | null;
  plays: number;
}

export interface BackupShow {
  id: number; // TVmaze show id
  name: string; // for human-readable backups; restore matches by id
  archived: 0 | 1;
  rating: number | null;
  review: string | null;
  favorited_at: string | null;
  episodes: BackupEpisode[];
}

export interface BackupMovie {
  id: number; // TMDB movie id
  title: string;
  year: number | null;
  poster_url: string | null;
  genre: string | null;
  runtime: number | null;
  overview: string | null;
  release_date: string | null;
  watched_at: string | null;
  rating: number | null;
}

export interface BackupFile {
  app: "tv-time";
  version: 1;
  exported_at: string;
  shows: BackupShow[];
  // Optional so older backups (shows-only) still validate as version 1.
  movies?: BackupMovie[];
}

/** Snapshot the library (only episodes carrying user data). */
export function buildBackup(now: Date = new Date()): BackupFile {
  const db = getDb();
  const shows = db.getAllSync<{
    id: number;
    name: string;
    archived: 0 | 1;
    rating: number | null;
    review: string | null;
    favorited_at: string | null;
  }>(
    "SELECT id, name, archived, rating, review, favorited_at FROM shows ORDER BY name"
  );
  return {
    app: "tv-time",
    version: 1,
    exported_at: now.toISOString(),
    shows: shows.map((s) => ({
      ...s,
      episodes: db.getAllSync<BackupEpisode>(
        `SELECT id, season, number, watched_at, rating, plays
         FROM episodes
         WHERE show_id = ?
           AND (watched_at IS NOT NULL OR rating IS NOT NULL OR plays > 0)
         ORDER BY season, number`,
        s.id
      ),
    })),
    movies: db.getAllSync<BackupMovie>(
      `SELECT id, title, year, poster_url, genre, runtime, overview,
              release_date, watched_at, rating
       FROM movies ORDER BY title`
    ),
  };
}

/** Validate an untrusted backup payload. Pure and unit-tested. */
export function parseBackup(json: string): BackupFile {
  const data = JSON.parse(json) as BackupFile;
  if (data?.app !== "tv-time" || data.version !== 1) {
    throw new Error("Not a TV App backup file.");
  }
  if (!Array.isArray(data.shows)) throw new Error("Backup has no shows.");
  for (const s of data.shows) {
    if (typeof s.id !== "number" || !Array.isArray(s.episodes)) {
      throw new Error("Backup is damaged.");
    }
  }
  return data;
}

/** Write the backup JSON and hand it to the share sheet. */
export async function exportAndShare(): Promise<void> {
  const backup = buildBackup();
  const name = `tv-time-backup-${backup.exported_at.slice(0, 10)}.json`;
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(JSON.stringify(backup));
  await Sharing.shareAsync(file.uri, {
    mimeType: "application/json",
    dialogTitle: "Export TV App backup",
  });
}

export interface RestoreProgress {
  progress: number; // 0..1
  message: string;
  restoredShows: number;
  failedShows: string[];
}

/**
 * Restore a backup: re-follow missing shows from TVmaze, then apply the
 * watch state atomically per show. Existing local data wins ties (restore
 * never un-watches something you've since watched).
 */
export async function restoreBackup(
  backup: BackupFile,
  onProgress: (p: RestoreProgress) => void
): Promise<RestoreProgress> {
  const state: RestoreProgress = {
    progress: 0,
    message: "",
    restoredShows: 0,
    failedShows: [],
  };
  const db = getDb();
  for (let i = 0; i < backup.shows.length; i++) {
    const show = backup.shows[i];
    state.progress = i / backup.shows.length;
    state.message = `Restoring “${show.name}” (${i + 1}/${backup.shows.length})…`;
    onProgress({ ...state });
    try {
      if (!repo.isFollowed(show.id)) {
        const followed = await repo.followShow(show.id);
        if (!followed) {
          state.failedShows.push(show.name);
          continue;
        }
      }
      repo.inTransaction(() => {
        for (const ep of show.episodes) {
          db.runSync(
            `UPDATE episodes SET
               watched_at = COALESCE(watched_at, ?),
               rating = COALESCE(rating, ?),
               plays = MAX(plays, ?)
             WHERE id = ? AND show_id = ?`,
            ep.watched_at,
            ep.rating,
            ep.plays ?? 0,
            ep.id,
            show.id
          );
        }
        db.runSync(
          `UPDATE shows SET archived = ?,
             rating = COALESCE(rating, ?),
             review = COALESCE(review, ?),
             favorited_at = COALESCE(favorited_at, ?)
           WHERE id = ?`,
          show.archived ?? 0,
          show.rating ?? null,
          show.review ?? null,
          show.favorited_at ?? null,
          show.id
        );
      });
      state.restoredShows++;
    } catch {
      state.failedShows.push(show.name);
    }
  }
  // Movies restore locally and instantly (no network). Existing local watch
  // state wins ties, same as shows.
  let restoredMovies = 0;
  for (const m of backup.movies ?? []) {
    try {
      db.runSync(
        `INSERT INTO movies (id, title, year, poster_url, genre, runtime,
                             overview, release_date, added_at, watched_at, rating)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           watched_at = COALESCE(movies.watched_at, excluded.watched_at),
           rating = COALESCE(movies.rating, excluded.rating)`,
        m.id,
        m.title,
        m.year,
        m.poster_url,
        m.genre,
        m.runtime,
        m.overview,
        m.release_date,
        backup.exported_at,
        m.watched_at,
        m.rating
      );
      restoredMovies++;
    } catch {
      // skip a damaged movie row
    }
  }

  state.progress = 1;
  const failNote = state.failedShows.length
    ? ` ${state.failedShows.length} show(s) couldn't be restored.`
    : "";
  const movieNote = restoredMovies
    ? ` and ${restoredMovies} movie${restoredMovies === 1 ? "" : "s"}`
    : "";
  state.message = `Restored ${state.restoredShows} show${state.restoredShows === 1 ? "" : "s"}${movieNote}.${failNote}`;
  onProgress({ ...state });
  // Mirror the restored history to the social layer (no-op signed out — the
  // sign-in reconcile backfills it later instead).
  reconcileAll();
  return state;
}
