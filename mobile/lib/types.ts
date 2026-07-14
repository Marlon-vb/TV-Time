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
  reaction: string | null; // emoji reaction, e.g. "🔥"
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
