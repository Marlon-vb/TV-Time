import { getDb } from "./db";
import type { MovieRow, RemoteMovie } from "./types";

/** Movie/documentary tracking. Local-only (like show follows) — one row per
 *  tracked title, watched or on the watchlist. */

function nowIso(): string {
  return new Date().toISOString();
}

/** Your movies: unwatched (watchlist) first, then most recently added. */
export function listMovies(): MovieRow[] {
  return getDb().getAllSync<MovieRow>(
    `SELECT * FROM movies
     ORDER BY (watched_at IS NOT NULL), COALESCE(watched_at, added_at) DESC`
  );
}

export function getMovie(id: number): MovieRow | null {
  return (
    getDb().getFirstSync<MovieRow>("SELECT * FROM movies WHERE id = ?", id) ??
    null
  );
}

export function isMovieAdded(id: number): boolean {
  return (
    getDb().getFirstSync<{ n: number }>(
      "SELECT COUNT(*) AS n FROM movies WHERE id = ?",
      id
    )?.n ?? 0
  ) > 0;
}

/** Add a movie to the library (idempotent — keeps existing watch state). */
export function addMovie(m: RemoteMovie): void {
  getDb().runSync(
    `INSERT INTO movies (id, title, year, poster_url, genre, runtime, overview,
                         release_date, added_at, watched_at, rating)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       year = excluded.year,
       poster_url = excluded.poster_url,
       genre = excluded.genre,
       runtime = excluded.runtime,
       overview = excluded.overview,
       release_date = excluded.release_date`,
    m.id,
    m.title,
    m.year,
    m.posterUrl,
    m.genre,
    m.runtime,
    m.overview,
    m.releaseDate,
    nowIso()
  );
}

/**
 * Star or unstar a movie. Local only, like every other write here — the movie
 * screen pairs it with social.setFavoriteMovie, the same split shows use.
 */
export function setMovieFavorite(id: number, favorite: boolean): void {
  getDb().runSync(
    "UPDATE movies SET favorited_at = ? WHERE id = ?",
    favorite ? nowIso() : null,
    id
  );
}

/** Your starred movies, in the order you put them. Same rule as shows. */
export function favoriteMovies(): MovieRow[] {
  return getDb().getAllSync<MovieRow>(
    `SELECT * FROM movies WHERE favorited_at IS NOT NULL
     ORDER BY favorite_rank IS NULL, favorite_rank ASC, favorited_at DESC`
  );
}

/** Write a whole order at once; ids not present are cleared back to unranked. */
export function setFavoriteMovieOrder(movieIds: number[]): void {
  const db = getDb();
  db.runSync("UPDATE movies SET favorite_rank = NULL");
  movieIds.forEach((id, i) => {
    db.runSync("UPDATE movies SET favorite_rank = ? WHERE id = ?", i, id);
  });
}

export function removeMovie(id: number): void {
  getDb().runSync("DELETE FROM movies WHERE id = ?", id);
}

export function setMovieWatched(
  id: number,
  watched: boolean,
  at?: string
): void {
  getDb().runSync(
    "UPDATE movies SET watched_at = ? WHERE id = ?",
    watched ? (at ?? nowIso()) : null,
    id
  );
}

export function setMovieRating(id: number, rating: number | null): void {
  // Rating a movie implies you've seen it — mark watched if it wasn't.
  if (rating != null) {
    getDb().runSync(
      "UPDATE movies SET rating = ?, watched_at = COALESCE(watched_at, ?) WHERE id = ?",
      rating,
      nowIso(),
      id
    );
  } else {
    getDb().runSync("UPDATE movies SET rating = NULL WHERE id = ?", id);
  }
}

export interface MovieStats {
  watched: number;
  watchlist: number;
  minutes: number; // total runtime of watched movies
}

export function movieStats(): MovieStats {
  const row = getDb().getFirstSync<{
    watched: number;
    watchlist: number;
    minutes: number;
  }>(
    `SELECT
       SUM(CASE WHEN watched_at IS NOT NULL THEN 1 ELSE 0 END) AS watched,
       SUM(CASE WHEN watched_at IS NULL THEN 1 ELSE 0 END) AS watchlist,
       COALESCE(SUM(CASE WHEN watched_at IS NOT NULL THEN runtime ELSE 0 END), 0) AS minutes
     FROM movies`
  );
  return {
    watched: row?.watched ?? 0,
    watchlist: row?.watchlist ?? 0,
    minutes: row?.minutes ?? 0,
  };
}
