import * as Contacts from "expo-contacts";
import * as Crypto from "expo-crypto";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { supabase } from "@/lib/supabase";
import { byTopThenNewest } from "@/lib/format-social";
import { normalizeEmail } from "./hash";
import type {
  ActivityInput,
  CharacterVoteTally,
  Comment,
  EpisodeStats,
  FavoriteMovie,
  FavoriteShow,
  FeedItem,
  Profile,
} from "./types";

/**
 * All reads/writes for the social layer. Every call is guarded server-side by
 * row-level security, so these are thin wrappers over the Supabase client.
 */

async function uid(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

async function sha256(input: string): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    input
  );
}

// ------------------------------------------------------------------ profiles

export async function getProfileByUsername(
  username: string
): Promise<Profile | null> {
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("username", username.toLowerCase())
    .maybeSingle();
  return (data as Profile) ?? null;
}

/** Search users by username or display name (case-insensitive prefix). */
export async function searchProfiles(query: string): Promise<Profile[]> {
  const q = query.trim().replace(/^@/, "");
  if (q.length < 2) return [];
  const me = await uid();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .or(`username.ilike.${q}%,display_name.ilike.%${q}%`)
    .neq("id", me ?? "")
    .limit(25);
  return (data as Profile[]) ?? [];
}

// ------------------------------------------------------------------- follows

/** Returns false when the follow didn't reach the server (offline, blocked). */
export async function follow(userId: string): Promise<boolean> {
  const me = await uid();
  if (!me || me === userId) return false;
  const { error } = await supabase
    .from("follows")
    .upsert({ follower_id: me, followee_id: userId });
  return !error;
}

export async function unfollow(userId: string): Promise<boolean> {
  const me = await uid();
  if (!me) return false;
  const { error } = await supabase
    .from("follows")
    .delete()
    .eq("follower_id", me)
    .eq("followee_id", userId);
  return !error;
}

export async function isFollowing(userId: string): Promise<boolean> {
  const me = await uid();
  if (!me) return false;
  const { data } = await supabase
    .from("follows")
    .select("followee_id")
    .eq("follower_id", me)
    .eq("followee_id", userId)
    .maybeSingle();
  return Boolean(data);
}

/** Profiles the given user (default: me) follows. */
export async function getFollowing(userId?: string): Promise<Profile[]> {
  const target = userId ?? (await uid());
  if (!target) return [];
  const { data } = await supabase
    .from("follows")
    .select("followee:profiles!follows_followee_id_fkey(*)")
    .eq("follower_id", target);
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  return ((data as any[]) ?? []).map((r) => r.followee as Profile);
}

export interface FollowerRow extends Profile {
  /** When they followed you — what the inbox sorts and marks unseen by. */
  followed_at: string;
}

/**
 * People who follow me, newest first.
 *
 * The follows table IS the inbox: a notifications table would be a second copy
 * of the same fact, free to drift from it every time someone unfollows.
 */
export async function recentFollowers(limit = 50): Promise<FollowerRow[]> {
  const me = await uid();
  if (!me) return [];
  const { data, error } = await supabase
    .from("follows")
    .select("created_at, follower:profiles!follows_follower_id_fkey(*)")
    .eq("followee_id", me)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  return ((data as any[]) ?? [])
    .map((r) =>
      r.follower
        ? { ...(r.follower as Profile), followed_at: r.created_at as string }
        : null
    )
    .filter((r): r is FollowerRow => r != null);
}

export async function followCounts(
  userId: string
): Promise<{ followers: number; following: number }> {
  const [followers, following] = await Promise.all([
    supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("followee_id", userId),
    supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("follower_id", userId),
  ]);
  return {
    followers: followers.count ?? 0,
    following: following.count ?? 0,
  };
}

/**
 * A profile's shows with watched counts (TVmaze ids, most-watched first).
 * Empty unless it's you or someone you follow — RLS keeps strangers private.
 */
export async function profileWatchSummary(
  userId: string
): Promise<{ show_id: number; episodes: number }[]> {
  const { data, error } = await supabase.rpc("profile_watch_summary", {
    p_user_id: userId,
  });
  if (error) return [];
  return (data as { show_id: number; episodes: number }[]) ?? [];
}

/**
 * The shows someone watched most recently, newest first.
 *
 * Read straight from watched_episodes rather than through a second RPC, so
 * this needs no database change to ship. Follower-scoped by the same RLS as
 * everything else here: an empty array for profiles you do not follow.
 *
 * Ordered by created_at, which is when the watch reached the server — the
 * only timestamp the mirrored rows carry. Accurate for anything watched in
 * the app; a bulk import lands its whole history at once, so ordering within
 * an imported back catalogue is arbitrary.
 */
export async function recentlyWatchedShows(
  userId: string,
  limit = 12
): Promise<number[]> {
  // Bounded scan, then deduped here: Postgres has no distinct-on through
  // PostgREST, and a heavy user has tens of thousands of rows. 400 is deep
  // enough that a binge does not crowd out every other show.
  const { data, error } = await supabase
    .from("watched_episodes")
    .select("show_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(400);
  if (error || !data) return [];
  const seen = new Set<number>();
  for (const row of data as { show_id: number }[]) {
    seen.add(row.show_id);
    if (seen.size >= limit) break;
  }
  return [...seen];
}

// ---------------------------------------------------------------- activities

/** Remove my feed activities for one episode (optionally scoped further). */
async function deleteEpisodeActivities(
  me: string,
  showId: number,
  season: number,
  episode: number,
  opts: { type?: string; excludeId?: string } = {}
): Promise<void> {
  let q = supabase
    .from("activities")
    .delete()
    .eq("user_id", me)
    .eq("show_id", showId)
    .eq("season", season)
    .eq("episode", episode);
  if (opts.type) q = q.eq("type", opts.type);
  if (opts.excludeId) q = q.neq("id", opts.excludeId);
  await q;
}

export async function publishActivity(input: ActivityInput): Promise<void> {
  const me = await uid();
  if (!me) return;
  // Replace, don't append — but insert FIRST: if the network dies between
  // the two steps the feed keeps a row, never loses one.
  const { data, error } = await supabase
    .from("activities")
    .insert({
      user_id: me,
      type: input.type,
      show_id: input.showId,
      show_name: input.showName,
      poster_url: input.posterUrl,
      season: input.season ?? null,
      episode: input.episode ?? null,
      episode_name: input.episodeName ?? null,
      rating: input.rating ?? null,
    })
    .select("id")
    .single();
  if (error || !data) return;
  if (input.season != null && input.episode != null && input.showId != null) {
    await deleteEpisodeActivities(me, input.showId, input.season, input.episode, {
      excludeId: data.id as string,
    });
  }
}

export async function getFeed(before?: {
  createdAt: string;
  id: string;
}): Promise<FeedItem[]> {
  const { data, error } = await supabase.rpc("feed", {
    limit_count: 50,
    before: before?.createdAt ?? new Date().toISOString(),
    // Tiebreaker: created_at isn't unique (server-side backfills stamp many
    // rows with one now()), and a bare `<` cursor would skip the rest of a
    // same-timestamp run at a page boundary.
    before_id: before?.id ?? null,
  });
  // Surface failures — an offline feed must not masquerade as an empty one.
  if (error) throw error;
  return (data as FeedItem[]) ?? [];
}

// -------------------------------------------------------- watched-episode sync

/**
 * Mirror a local watch/rating to the server so friends see it (activity feed,
 * friends-who-watched, community rating). Called from the watch/rate actions
 * only when signed in; silently no-ops otherwise.
 */
/**
 * Mirror a star to the profile everyone else reads.
 *
 * Signed out this is a no-op and the local star still stands — favourites
 * work as a private shelf until there is an account to hang them on, rather
 * than refusing the tap.
 */
export async function setFavorite(
  show:
    | { id: number; name: string; posterUrl: string | null; position?: number | null }
    | number
): Promise<void> {
  const me = await uid();
  if (!me) return;
  if (typeof show === "number") {
    await supabase
      .from("favorite_shows")
      .delete()
      .eq("user_id", me)
      .eq("show_id", show);
    return;
  }
  await supabase.from("favorite_shows").upsert({
    user_id: me,
    show_id: show.id,
    name: show.name,
    poster_url: show.posterUrl,
    position: show.position ?? null,
  });
}

/**
 * Push a whole set of local stars up at once. Upsert only, never delete:
 * signing in on a fresh install would otherwise wipe the favourites already
 * on your profile, which is the same trap the watch-history mirror avoids.
 */
export async function upsertFavorites(
  shows: {
    id: number;
    name: string;
    posterUrl: string | null;
    position?: number | null;
  }[]
): Promise<void> {
  const me = await uid();
  if (!me || shows.length === 0) return;
  await supabase.from("favorite_shows").upsert(
    shows.map((s) => ({
      user_id: me,
      show_id: s.id,
      name: s.name,
      poster_url: s.posterUrl,
      position: s.position ?? null,
    }))
  );
}

/** Mirror a starred film. Signed out this is a no-op, as with shows. */
export async function setFavoriteMovie(
  movie:
    | { id: number; title: string; posterUrl: string | null; position?: number | null }
    | number
): Promise<void> {
  const me = await uid();
  if (!me) return;
  if (typeof movie === "number") {
    await supabase
      .from("favorite_movies")
      .delete()
      .eq("user_id", me)
      .eq("movie_id", movie);
    return;
  }
  await supabase.from("favorite_movies").upsert({
    user_id: me,
    movie_id: movie.id,
    title: movie.title,
    poster_url: movie.posterUrl,
    position: movie.position ?? null,
  });
}

/** Someone's starred films, newest first. Their own id when omitted. */
export async function getFavoriteMovies(
  userId?: string
): Promise<FavoriteMovie[]> {
  const target = userId ?? (await uid());
  if (!target) return [];
  const { data } = await supabase
    .from("favorite_movies")
    .select("movie_id, title, poster_url")
    .eq("user_id", target)
    .order("position", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  return (data as FavoriteMovie[]) ?? [];
}

/** Push a whole set of local film stars up. Upsert only, same as shows. */
export async function upsertFavoriteMovies(
  movies: {
    id: number;
    title: string;
    posterUrl: string | null;
    position?: number | null;
  }[]
): Promise<void> {
  const me = await uid();
  if (!me || movies.length === 0) return;
  await supabase.from("favorite_movies").upsert(
    movies.map((m) => ({
      user_id: me,
      movie_id: m.id,
      title: m.title,
      poster_url: m.posterUrl,
      position: m.position ?? null,
    }))
  );
}

/** Someone's starred shows, newest first. Their own id when omitted. */
export async function getFavorites(userId?: string): Promise<FavoriteShow[]> {
  const target = userId ?? (await uid());
  if (!target) return [];
  const { data } = await supabase
    .from("favorite_shows")
    .select("show_id, name, poster_url")
    .eq("user_id", target)
    // Nulls last, so an arranged top of the shelf survives and everything
    // never reordered still falls in newest-first behind it.
    .order("position", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  return (data as FavoriteShow[]) ?? [];
}

export async function recordWatch(input: {
  showId: number;
  season: number;
  episode: number;
  rating?: number | null;
  showName: string;
  posterUrl: string | null;
  episodeName?: string | null;
  /** Defaults to now; pass the row's own date when mirroring older history. */
  watchedAt?: string | null;
}): Promise<void> {
  const me = await uid();
  if (!me) return;
  await supabase.from("watched_episodes").upsert({
    user_id: me,
    show_id: input.showId,
    season: input.season,
    episode: input.episode,
    rating: input.rating ?? null,
    watched_at: input.watchedAt ?? new Date().toISOString(),
  });
  await publishActivity({
    type: input.rating != null ? "rated" : "watched",
    showId: input.showId,
    showName: input.showName,
    posterUrl: input.posterUrl,
    season: input.season,
    episode: input.episode,
    episodeName: input.episodeName ?? null,
    rating: input.rating ?? null,
  });
}

export async function unrecordWatch(
  showId: number,
  season: number,
  episode: number
): Promise<void> {
  const me = await uid();
  if (!me) return;
  await supabase
    .from("watched_episodes")
    .delete()
    .eq("user_id", me)
    .eq("show_id", showId)
    .eq("season", season)
    .eq("episode", episode);
  // Un-watching retracts the claim — remove the stale feed activity too.
  await deleteEpisodeActivities(me, showId, season, episode);
}

/**
 * Convenience wrapper: mirror a single watch of a local episode row, feed
 * activity included. The one payload mapping shared by every screen.
 */
export async function recordWatchForEpisode(
  show: { id: number; name: string; poster_url: string | null },
  ep: {
    season: number;
    number: number;
    name: string;
    rating: number | null;
    watched_at?: string | null;
  }
): Promise<void> {
  await recordWatch({
    showId: show.id,
    season: ep.season,
    episode: ep.number,
    rating: ep.rating,
    showName: show.name,
    posterUrl: show.poster_url,
    episodeName: ep.name,
    watchedAt: ep.watched_at ?? null,
  });
}

/** Clear (or change) the rating on an already-recorded watch. */
export async function updateWatchRating(
  showId: number,
  season: number,
  episode: number,
  rating: number | null
): Promise<void> {
  const me = await uid();
  if (!me) return;
  await supabase
    .from("watched_episodes")
    .update({ rating })
    .eq("user_id", me)
    .eq("show_id", showId)
    .eq("season", season)
    .eq("episode", episode);
  if (rating == null) {
    // A retracted rating shouldn't keep showing in friends' feeds.
    await deleteEpisodeActivities(me, showId, season, episode, {
      type: "rated",
    });
  }
}

// ----------------------------------------------------- watched-history batch

export interface WatchedRow {
  show_id: number;
  season: number;
  episode: number;
  rating: number | null;
  /** When it was actually watched, not when the row reached the server.
   *  Null on rows written before the column existed. */
  watched_at: string | null;
}

/** All of my watched rows on the server (paginated past PostgREST's cap). */
export async function fetchMyWatched(showId?: number): Promise<WatchedRow[]> {
  const me = await uid();
  if (!me) return [];
  const out: WatchedRow[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    let q = supabase
      .from("watched_episodes")
      .select("show_id,season,episode,rating,watched_at")
      .eq("user_id", me)
      .order("show_id")
      .order("season")
      .order("episode")
      .range(from, from + page - 1);
    if (showId != null) q = q.eq("show_id", showId);
    const { data, error } = await q;
    if (error || !data) break;
    out.push(...(data as WatchedRow[]));
    if (data.length < page) break;
  }
  return out;
}

/** Count of my watched rows on the server — cheap sync check. */
export async function countMyWatched(): Promise<number | null> {
  const me = await uid();
  if (!me) return null;
  const { count, error } = await supabase
    .from("watched_episodes")
    .select("*", { count: "exact", head: true })
    .eq("user_id", me);
  return error ? null : (count ?? 0);
}

/**
 * Chunked batch upsert of watched rows (import-scale safe): 500-row chunks,
 * 4 in flight at a time. Throws on the first failed chunk so callers never
 * mistake a partial write for success.
 */
export async function upsertWatchedRows(rows: WatchedRow[]): Promise<void> {
  const me = await uid();
  if (!me) throw new Error("not signed in");
  if (rows.length === 0) return;
  const chunkSize = 500;
  const chunks: WatchedRow[][] = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
    chunks.push(rows.slice(i, i + chunkSize));
  }
  const width = 4;
  for (let i = 0; i < chunks.length; i += width) {
    const results = await Promise.all(
      chunks.slice(i, i + width).map((c) =>
        supabase
          .from("watched_episodes")
          .upsert(c.map((r) => ({ ...r, user_id: me })))
      )
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) throw failed.error;
  }
}

/** Targeted deletes of specific server watched rows. Throws on failure. */
export async function deleteWatchedRows(rows: WatchedRow[]): Promise<void> {
  const me = await uid();
  if (!me) throw new Error("not signed in");
  const width = 4;
  for (let i = 0; i < rows.length; i += width) {
    const results = await Promise.all(
      rows.slice(i, i + width).map((r) =>
        supabase.from("watched_episodes").delete().match({
          user_id: me,
          show_id: r.show_id,
          season: r.season,
          episode: r.episode,
        })
      )
    );
    const failed = results.find((x) => x.error);
    if (failed?.error) throw failed.error;
  }
}

/** Delete every server watched row of mine for one show (used on unfollow). */
export async function deleteWatchedForShow(showId: number): Promise<void> {
  const me = await uid();
  if (!me) return;
  await supabase
    .from("watched_episodes")
    .delete()
    .eq("user_id", me)
    .eq("show_id", showId);
  // The unfollowed show's feed rows go with it.
  await supabase
    .from("activities")
    .delete()
    .eq("user_id", me)
    .eq("show_id", showId);
}

export async function friendsWhoWatched(
  showId: number,
  season?: number,
  episode?: number
): Promise<Profile[]> {
  const { data } = await supabase.rpc("friends_who_watched", {
    p_show_id: showId,
    p_season: season ?? null,
    p_episode: episode ?? null,
  });
  return (data as Profile[]) ?? [];
}

export async function episodeStats(
  showId: number,
  season: number,
  episode: number
): Promise<EpisodeStats> {
  const { data } = await supabase
    .rpc("episode_stats", {
      p_show_id: showId,
      p_season: season,
      p_episode: episode,
    })
    .maybeSingle();
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const r = data as any;
  return {
    avgRating: r?.avg_rating ?? null,
    ratingCount: r?.rating_count ?? 0,
    watchCount: r?.watch_count ?? 0,
  };
}

// ------------------------------------------------------------------ comments

export async function getComments(
  showId: number,
  season: number,
  episode: number
): Promise<Comment[]> {
  const me = await uid();
  const blocked = await getBlockedIds();
  const { data } = await supabase
    .from("comments")
    .select(
      "*, author:profiles!comments_user_id_fkey(username,display_name,avatar_url), comment_votes(user_id)"
    )
    .eq("show_id", showId)
    .eq("season", season)
    .eq("episode", episode)
    .order("created_at", { ascending: false });
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const rows = ((data as any[]) ?? [])
    .filter((c) => !blocked.has(c.user_id))
    .map((c) => ({
      id: c.id,
      user_id: c.user_id,
      show_id: c.show_id,
      season: c.season,
      episode: c.episode,
      body: c.body,
      image_url: c.image_url,
      created_at: c.created_at,
      username: c.author?.username,
      display_name: c.author?.display_name,
      avatar_url: c.author?.avatar_url,
      upvotes: (c.comment_votes ?? []).length,
      upvoted: (c.comment_votes ?? []).some((v: any) => v.user_id === me),
    }));
  /* eslint-enable @typescript-eslint/no-explicit-any */
  return rows.sort(byTopThenNewest);
}

export async function addComment(
  showId: number,
  season: number,
  episode: number,
  body: string,
  imageUrl?: string | null,
  ctx?: {
    showName: string | null;
    posterUrl: string | null;
    episodeName?: string | null;
  }
): Promise<void> {
  const me = await uid();
  if (!me) return;
  const trimmed = body.trim();
  if (!trimmed && !imageUrl) return;
  const { error } = await supabase.from("comments").insert({
    user_id: me,
    show_id: showId,
    season,
    episode,
    body: trimmed || null,
    image_url: imageUrl ?? null,
  });
  // The comment row is the write that matters — throw so the composer keeps
  // the user's text and can say why (an RLS denial, the 2000-char DB check)
  // instead of clearing the box as if it had posted.
  if (error) throw error;
  // Surface the comment in friends' feeds — one 'commented' activity per
  // episode (deduped by type, so it never wipes the watched/rated entry).
  if (ctx) {
    const { data } = await supabase
      .from("activities")
      .insert({
        user_id: me,
        type: "commented",
        show_id: showId,
        show_name: ctx.showName,
        poster_url: ctx.posterUrl,
        season,
        episode,
        episode_name: ctx.episodeName ?? null,
      })
      .select("id")
      .single();
    if (data) {
      await deleteEpisodeActivities(me, showId, season, episode, {
        type: "commented",
        excludeId: data.id as string,
      });
    }
  }
}

/** Delete a comment and, if it carried a photo, the photo itself. */
export async function deleteComment(
  commentId: string,
  imageUrl?: string | null
): Promise<void> {
  await supabase.from("comments").delete().eq("id", commentId);
  if (imageUrl) {
    const path = imageUrl.split("/comment-photos/")[1];
    if (path) {
      await supabase.storage
        .from("comment-photos")
        .remove([decodeURIComponent(path)]);
    }
  }
}

export async function toggleUpvote(
  commentId: string,
  upvoted: boolean
): Promise<void> {
  const me = await uid();
  if (!me) return;
  if (upvoted) {
    await supabase
      .from("comment_votes")
      .delete()
      .eq("comment_id", commentId)
      .eq("user_id", me);
  } else {
    await supabase
      .from("comment_votes")
      .upsert({ comment_id: commentId, user_id: me });
  }
}

/** Upload a photo to the public comment-photos bucket, return its URL. */
export async function uploadCommentPhoto(
  localUri: string
): Promise<string | null> {
  const me = await uid();
  if (!me) return null;
  try {
    const res = await fetch(localUri);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const ext = localUri.split(".").pop()?.split("?")[0] || "jpg";
    const path = `${me}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("comment-photos")
      .upload(path, bytes, {
        contentType: `image/${ext === "jpg" ? "jpeg" : ext}`,
        upsert: false,
      });
    if (error) return null;
    return supabase.storage.from("comment-photos").getPublicUrl(path).data
      .publicUrl;
  } catch {
    return null;
  }
}

// -------------------------------------------------- moderation (blocks/reports)

let blockedCache: { at: number; ids: Set<string> } | null = null;

/** Ids of users I've blocked (30s cache so list screens stay cheap). */
export async function getBlockedIds(): Promise<Set<string>> {
  const me = await uid();
  if (!me) return new Set();
  if (blockedCache && Date.now() - blockedCache.at < 30_000)
    return blockedCache.ids;
  const { data } = await supabase
    .from("blocks")
    .select("blocked_id")
    .eq("blocker_id", me);
  const ids = new Set(
    ((data as { blocked_id: string }[]) ?? []).map((b) => b.blocked_id)
  );
  blockedCache = { at: Date.now(), ids };
  return ids;
}

export async function blockUser(userId: string): Promise<void> {
  const me = await uid();
  if (!me || me === userId) return;
  // The block row is the write that matters — throw so confirmBlock's
  // "Couldn't block" alert is reachable instead of the UI lying offline.
  const { error } = await supabase
    .from("blocks")
    .upsert({ blocker_id: me, blocked_id: userId });
  if (error) throw error;
  // Sever the relationship both ways immediately for the UI; the
  // handle_new_block trigger does the same server-side, so these staying
  // best-effort is safe.
  await unfollow(userId);
  await supabase
    .from("follows")
    .delete()
    .eq("follower_id", userId)
    .eq("followee_id", me);
  blockedCache = null;
}

export async function unblockUser(userId: string): Promise<void> {
  const me = await uid();
  if (!me) return;
  await supabase
    .from("blocks")
    .delete()
    .eq("blocker_id", me)
    .eq("blocked_id", userId);
  blockedCache = null;
}

/** File a report on a comment and/or user for the owner to review. */
export async function reportContent(input: {
  commentId?: string;
  userId?: string;
  reason?: string;
}): Promise<boolean> {
  const me = await uid();
  if (!me) return false;
  const { error } = await supabase.from("reports").insert({
    reporter_id: me,
    comment_id: input.commentId ?? null,
    reported_user_id: input.userId ?? null,
    reason: input.reason ?? null,
  });
  return !error;
}

// ------------------------------------------------------------ account deletion

/**
 * Permanently delete the signed-in account: auth user, profile, follows,
 * activities, watched history, comments, votes, photos (server-side cascade),
 * then end the local session. Local on-device library is untouched.
 */
export async function deleteAccount(): Promise<boolean> {
  const { error } = await supabase.rpc("delete_account");
  if (error) return false;
  await supabase.auth.signOut();
  return true;
}

// ------------------------------------------------- community recommendations

/**
 * Shows that people who watch the same shows as you also watch (TVmaze ids
 * with taste-neighbor counts). Empty when signed out, on error, or while the
 * community is still small — callers treat this as one optional signal.
 */
export async function alsoWatched(
  showIds: number[]
): Promise<{ show_id: number; watchers: number }[]> {
  if (showIds.length === 0) return [];
  // Guard before the RPC: a signed-out user's library stays on the device.
  const me = await uid();
  if (!me) return [];
  try {
    const { data, error } = await supabase.rpc("also_watched", {
      p_show_ids: showIds.slice(0, 100),
      p_limit: 30,
    });
    if (error) return [];
    return (data as { show_id: number; watchers: number }[]) ?? [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------- character votes

/** The character id I voted best-in-episode, or null if I haven't voted. */
export async function getMyCharacterVote(
  showId: number,
  season: number,
  episode: number
): Promise<number | null> {
  const me = await uid();
  if (!me) return null;
  const { data } = await supabase
    .from("character_votes")
    .select("character_id")
    .eq("user_id", me)
    .eq("show_id", showId)
    .eq("season", season)
    .eq("episode", episode)
    .maybeSingle();
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  return (data as any)?.character_id ?? null;
}

/** Cast one vote for the episode's best character (replaces any prior vote). */
export async function voteCharacter(
  showId: number,
  season: number,
  episode: number,
  characterId: number,
  characterName: string
): Promise<void> {
  const me = await uid();
  if (!me) return;
  await supabase.from("character_votes").upsert({
    user_id: me,
    show_id: showId,
    season,
    episode,
    character_id: characterId,
    character_name: characterName,
  });
}

export async function clearCharacterVote(
  showId: number,
  season: number,
  episode: number
): Promise<void> {
  const me = await uid();
  if (!me) return;
  await supabase
    .from("character_votes")
    .delete()
    .eq("user_id", me)
    .eq("show_id", showId)
    .eq("season", season)
    .eq("episode", episode);
}

export async function characterVoteTally(
  showId: number,
  season: number,
  episode: number
): Promise<CharacterVoteTally[]> {
  const { data } = await supabase.rpc("character_vote_tally", {
    p_show_id: showId,
    p_season: season,
    p_episode: episode,
  });
  return (data as CharacterVoteTally[]) ?? [];
}

// ------------------------------------------------------- push notifications

export async function registerPushToken(token: string): Promise<void> {
  const me = await uid();
  if (!me) return;
  await supabase
    .from("push_tokens")
    .upsert({ user_id: me, token, updated_at: new Date().toISOString() });
}

/**
 * On sign-in: store the user's email hash (so their contacts can find them)
 * and register their Expo push token if notifications are already allowed.
 * Best-effort — never throws.
 */
export async function registerForSocial(email?: string | null): Promise<void> {
  try {
    await upsertMyContactHashes(email);
  } catch {
    /* ignore */
  }
  try {
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) return;
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const projectId = (Constants.expoConfig?.extra as any)?.eas?.projectId;
    if (!projectId) return;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await registerPushToken(token);
  } catch {
    /* ignore */
  }
}

// -------------------------------------------------- contacts friend matching

/**
 * Match the address book against real users by email only. We read just the
 * Emails field, and only SHA-256 hashes of it are sent — raw addresses never
 * leave the device. Phone numbers are deliberately not read or hashed: only
 * email_hash is ever stored for a user (see upsertMyContactHashes), so a phone
 * hash could never match a row. The RPC keeps its phone_hashes argument for
 * signature compatibility and always receives an empty array.
 */
export async function findFriendsFromContacts(): Promise<{
  granted: boolean;
  profiles: Profile[];
}> {
  const me = await uid();
  if (!me) return { granted: true, profiles: [] };

  const { status } = await Contacts.requestPermissionsAsync();
  if (status !== "granted") return { granted: false, profiles: [] };

  const { data: contacts } = await Contacts.getContactsAsync({
    fields: [Contacts.Fields.Emails],
  });

  const emailHashes = new Set<string>();
  for (const c of contacts) {
    for (const e of c.emails ?? []) {
      const n = normalizeEmail(e.email ?? "");
      if (n) emailHashes.add(await sha256(n));
    }
  }

  const { data } = await supabase.rpc("find_friends", {
    phone_hashes: [],
    email_hashes: [...emailHashes],
  });
  return { granted: true, profiles: (data as Profile[]) ?? [] };
}

/**
 * True for the per-app address Apple issues when someone picks "Hide My
 * Email". It is unique to this app and this user, so nobody on earth has it in
 * their address book — hashing it stores a row that can never match anything.
 */
function isPrivateRelay(email: string): boolean {
  return email.endsWith("@privaterelay.appleid.com");
}

/** Store hashes of the user's own email so contacts of theirs can match them. */
export async function upsertMyContactHashes(email?: string | null): Promise<void> {
  const me = await uid();
  if (!me) return;
  const normalized = normalizeEmail(email ?? "");
  if (!normalized || isPrivateRelay(normalized)) return;
  await supabase.from("profile_contacts").upsert({
    id: me,
    email_hash: await sha256(normalized),
  });
}

// -------------------------------------------------------------- suggestions

export interface SuggestedFriend extends Profile {
  /** "Followed by 3 people you follow" / "12 shows in common". */
  reason: string;
  mutuals: number;
  shows_in_common: number;
}

/**
 * Who to follow, from the graph the app already has: people followed by
 * people you follow, and people whose watched shows overlap yours.
 *
 * This is what fills the screen for everyone who declines contacts access —
 * and for everyone signed in with Hide My Email, whose address is in nobody's
 * address book by construction.
 */
export async function suggestedFriends(limit = 12): Promise<SuggestedFriend[]> {
  const me = await uid();
  if (!me) return [];
  try {
    const { data, error } = await supabase.rpc("suggested_friends", {
      p_limit: limit,
    });
    if (error) return [];
    return (data as SuggestedFriend[]) ?? [];
  } catch {
    return [];
  }
}

// ----------------------------------------------------------------- trending

export interface TrendingShow {
  show_id: number;
  watchers: number;
  episodes: number;
  show_name: string | null;
  poster_url: string | null;
}

export interface TrendingEpisode {
  show_id: number;
  season: number;
  episode: number;
  watchers: number;
  show_name: string | null;
  episode_name: string | null;
  poster_url: string | null;
}

/**
 * What the community watched in the last `days`, ranked by how many DISTINCT
 * people watched it — so one person's binge, or one person's import, cannot
 * manufacture a trend.
 *
 * Empty when signed out or on any error: this is a section that hides rather
 * than a section that shows an apology.
 */
export async function trendingShows(
  days = 7,
  limit = 20
): Promise<TrendingShow[]> {
  const me = await uid();
  if (!me) return [];
  try {
    const { data, error } = await supabase.rpc("trending_shows", {
      p_days: days,
      p_limit: limit,
    });
    if (error) return [];
    return (data as TrendingShow[]) ?? [];
  } catch {
    return [];
  }
}

export async function trendingEpisodes(
  days = 7,
  limit = 20
): Promise<TrendingEpisode[]> {
  const me = await uid();
  if (!me) return [];
  try {
    const { data, error } = await supabase.rpc("trending_episodes", {
      p_days: days,
      p_limit: limit,
    });
    if (error) return [];
    return (data as TrendingEpisode[]) ?? [];
  } catch {
    return [];
  }
}
