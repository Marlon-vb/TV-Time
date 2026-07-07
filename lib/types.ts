export interface ShowRow {
  id: number; // TVmaze show id (primary key)
  name: string;
  tvdb_id: number | null;
  imdb_id: string | null;
  tmdb_id: number | null;
  poster_url: string | null;
  backdrop_url: string | null;
  status: string; // Running | Ended | To Be Determined | In Development
  network: string | null;
  runtime: number | null; // average runtime in minutes
  premiered: string | null; // YYYY-MM-DD
  genres: string; // JSON array
  summary: string | null;
  followed_at: string; // ISO timestamp
  archived: 0 | 1;
  last_synced_at: string | null;
}

export interface EpisodeRow {
  id: number; // TVmaze episode id
  show_id: number;
  season: number;
  number: number;
  name: string;
  airdate: string | null; // YYYY-MM-DD
  airstamp: string | null; // ISO timestamp
  runtime: number | null;
  summary: string | null;
  image_url: string | null;
  watched_at: string | null; // ISO timestamp, null = unwatched
}

/** Show list item with per-show progress, as served by the API. */
export interface ShowWithProgress extends ShowRow {
  episode_count: number; // aired episodes
  watched_count: number;
  aired_unwatched: number; // "behind by N"
  total_episodes: number; // including future
  next_airstamp: string | null; // next future episode, if any
  category: ShowCategory;
}

export type ShowCategory =
  | "watching"
  | "up_to_date"
  | "not_started"
  | "finished"
  | "archived";

export interface WatchNextItem {
  show: ShowRow;
  episode: EpisodeRow;
  aired_unwatched: number;
}

export interface UpcomingItem {
  show: ShowRow;
  episode: EpisodeRow;
}

/** A show as returned by the metadata provider (TVmaze), before it's stored. */
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
}

export interface ImportReport {
  status: "idle" | "running" | "done" | "error";
  progress: number; // 0..1
  message: string;
  showsMatched: number;
  showsFailed: string[];
  episodesMarked: number;
  episodesApproximated: number; // marked via count-based fallback
  startedAt: string | null;
  finishedAt: string | null;
}
