/** A tracked movie or documentary film (source: Apple iTunes Search API). */
export interface MovieRow {
  id: number; // iTunes trackId (primary key)
  title: string;
  year: number | null;
  poster_url: string | null;
  genre: string | null;
  runtime: number | null; // minutes
  overview: string | null;
  release_date: string | null; // ISO
  added_at: string; // when you added it to your library
  watched_at: string | null; // null = still on your watchlist
  rating: number | null; // your star rating, ½–5
}

/** A movie as returned from an iTunes search (not yet tracked). */
export interface RemoteMovie {
  id: number;
  title: string;
  year: number | null;
  posterUrl: string | null;
  genre: string | null;
  runtime: number | null; // minutes
  overview: string | null;
  releaseDate: string | null;
}

export interface ShowRow {
  id: number; // TVmaze show id (primary key)
  name: string;
  tvdb_id: number | null;
  imdb_id: string | null;
  tmdb_id: number | null;
  poster_url: string | null;
  backdrop_url: string | null;
  status: string;
  network: string | null;
  runtime: number | null;
  premiered: string | null;
  genres: string; // JSON array
  summary: string | null;
  followed_at: string;
  archived: 0 | 1;
  last_synced_at: string | null;
  rating: number | null; // your show-level star rating (½–5)
  review: string | null; // private notes — never leaves the device
  favorited_at: string | null; // starred for your profile; null = not a favourite
}

export interface EpisodeRow {
  id: number; // TVmaze episode id
  show_id: number;
  season: number;
  number: number;
  name: string;
  airdate: string | null;
  airstamp: string | null; // UTC ISO
  runtime: number | null;
  summary: string | null;
  image_url: string | null;
  watched_at: string | null;
  rating: number | null; // 0.5–5.0 in half-star steps
  community_rating: number | null; // TVmaze crowd rating, 0–10
  plays: number; // times watched (2+ = rewatched); survives an un-check so
  //               rewatch history isn't lost — watched_at is the source of
  //               truth for whether an episode currently counts as watched
}

export type ShowCategory =
  | "watching"
  | "up_to_date"
  | "not_started"
  | "finished"
  | "archived";

export interface ShowWithProgress extends ShowRow {
  episode_count: number;
  watched_count: number;
  aired_unwatched: number;
  total_episodes: number;
  next_airstamp: string | null;
  last_aired: string | null;
  category: ShowCategory;
}

export interface WatchNextItem {
  show: ShowRow;
  episode: EpisodeRow;
  aired_unwatched: number;
  watched_count: number;
  last_watched_at: string | null;
}

export interface UpcomingItem {
  show: ShowRow;
  episode: EpisodeRow;
}

export interface RemoteShow {
  id: number;
  name: string;
  tvdbId: number | null;
  imdbId: string | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  status: string;
  network: string | null;
  runtime: number | null;
  premiered: string | null;
  genres: string[];
  summary: string | null;
  /** TVmaze's own user rating, 0–10, when it has one. */
  rating: number | null;
}

export interface RemoteEpisode {
  id: number;
  season: number;
  number: number;
  name: string;
  airdate: string | null;
  airstamp: string | null;
  runtime: number | null;
  summary: string | null;
  imageUrl: string | null;
  rating: number | null; // TVmaze community rating, 0–10
}
