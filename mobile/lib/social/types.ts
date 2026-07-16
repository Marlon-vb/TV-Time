export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
}

export type ActivityType = "watched" | "rated" | "finished" | "started";

/** A row from the feed() RPC — an activity joined with its author. */
export interface FeedItem {
  id: string;
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  type: ActivityType;
  show_id: number | null;
  show_name: string | null;
  poster_url: string | null;
  season: number | null;
  episode: number | null;
  episode_name: string | null;
  rating: number | null;
  created_at: string;
}

export interface ActivityInput {
  type: ActivityType;
  showId: number | null;
  showName: string | null;
  posterUrl: string | null;
  season?: number | null;
  episode?: number | null;
  episodeName?: string | null;
  rating?: number | null;
}

export interface Comment {
  id: string;
  user_id: string;
  show_id: number;
  season: number;
  episode: number;
  body: string;
  created_at: string;
  // joined author fields (via select)
  username?: string;
  display_name?: string | null;
  avatar_url?: string | null;
}
