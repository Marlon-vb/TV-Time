import * as Contacts from "expo-contacts";
import * as Crypto from "expo-crypto";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { supabase } from "@/lib/supabase";
import { normalizeEmail, normalizePhone } from "./hash";
import type {
  ActivityInput,
  CharacterVoteTally,
  Comment,
  EpisodeStats,
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

export async function follow(userId: string): Promise<void> {
  const me = await uid();
  if (!me || me === userId) return;
  await supabase
    .from("follows")
    .upsert({ follower_id: me, followee_id: userId });
}

export async function unfollow(userId: string): Promise<void> {
  const me = await uid();
  if (!me) return;
  await supabase
    .from("follows")
    .delete()
    .eq("follower_id", me)
    .eq("followee_id", userId);
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

// ---------------------------------------------------------------- activities

export async function publishActivity(input: ActivityInput): Promise<void> {
  const me = await uid();
  if (!me) return;
  // Replace, don't append: re-toggling or re-rating an episode must not fill
  // friends' feeds with duplicate rows for the same episode.
  if (input.season != null && input.episode != null && input.showId != null) {
    await supabase
      .from("activities")
      .delete()
      .eq("user_id", me)
      .eq("show_id", input.showId)
      .eq("season", input.season)
      .eq("episode", input.episode);
  }
  await supabase.from("activities").insert({
    user_id: me,
    type: input.type,
    show_id: input.showId,
    show_name: input.showName,
    poster_url: input.posterUrl,
    season: input.season ?? null,
    episode: input.episode ?? null,
    episode_name: input.episodeName ?? null,
    rating: input.rating ?? null,
  });
}

export async function getFeed(before?: string): Promise<FeedItem[]> {
  const { data } = await supabase.rpc("feed", {
    limit_count: 50,
    before: before ?? new Date().toISOString(),
  });
  return (data as FeedItem[]) ?? [];
}

// -------------------------------------------------------- watched-episode sync

/**
 * Mirror a local watch/rating to the server so friends see it (activity feed,
 * friends-who-watched, community rating). Called from the watch/rate actions
 * only when signed in; silently no-ops otherwise.
 */
export async function recordWatch(input: {
  showId: number;
  season: number;
  episode: number;
  rating?: number | null;
  showName: string;
  posterUrl: string | null;
  episodeName?: string | null;
}): Promise<void> {
  const me = await uid();
  if (!me) return;
  await supabase.from("watched_episodes").upsert({
    user_id: me,
    show_id: input.showId,
    season: input.season,
    episode: input.episode,
    rating: input.rating ?? null,
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
  await supabase
    .from("activities")
    .delete()
    .eq("user_id", me)
    .eq("show_id", showId)
    .eq("season", season)
    .eq("episode", episode);
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
    await supabase
      .from("activities")
      .delete()
      .eq("user_id", me)
      .eq("show_id", showId)
      .eq("season", season)
      .eq("episode", episode)
      .eq("type", "rated");
  }
}

// ----------------------------------------------------- watched-history batch

export interface WatchedRow {
  show_id: number;
  season: number;
  episode: number;
  rating: number | null;
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
      .select("show_id,season,episode,rating")
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

/** Chunked batch upsert of watched rows (import-scale safe). */
export async function upsertWatchedRows(rows: WatchedRow[]): Promise<void> {
  const me = await uid();
  if (!me || rows.length === 0) return;
  const chunk = 500;
  for (let i = 0; i < rows.length; i += chunk) {
    await supabase
      .from("watched_episodes")
      .upsert(rows.slice(i, i + chunk).map((r) => ({ ...r, user_id: me })));
  }
}

/** Delete every server watched row of mine for one show. */
export async function deleteWatchedForShow(showId: number): Promise<void> {
  const me = await uid();
  if (!me) return;
  await supabase
    .from("watched_episodes")
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
  return ((data as any[]) ?? [])
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
}

export async function addComment(
  showId: number,
  season: number,
  episode: number,
  body: string,
  imageUrl?: string | null
): Promise<void> {
  const me = await uid();
  if (!me) return;
  const trimmed = body.trim();
  if (!trimmed && !imageUrl) return;
  await supabase.from("comments").insert({
    user_id: me,
    show_id: showId,
    season,
    episode,
    body: trimmed || null,
    image_url: imageUrl ?? null,
  });
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
  await supabase.from("blocks").upsert({ blocker_id: me, blocked_id: userId });
  // Blocking also severs the relationship both ways.
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
 * Hash the signed-in user's own phone/email so others can match them, then
 * hash the address book and ask the server which hashes belong to real users.
 * Raw contact details never leave the device — only SHA-256 hashes.
 */
export async function findFriendsFromContacts(
  defaultCountryCode = ""
): Promise<Profile[]> {
  const me = await uid();
  if (!me) return [];

  const { status } = await Contacts.requestPermissionsAsync();
  if (status !== "granted") return [];

  const { data: contacts } = await Contacts.getContactsAsync({
    fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails],
  });

  const phoneHashes = new Set<string>();
  const emailHashes = new Set<string>();
  for (const c of contacts) {
    for (const p of c.phoneNumbers ?? []) {
      const n = normalizePhone(p.number ?? "", defaultCountryCode);
      if (n) phoneHashes.add(await sha256(n));
    }
    for (const e of c.emails ?? []) {
      const n = normalizeEmail(e.email ?? "");
      if (n) emailHashes.add(await sha256(n));
    }
  }

  const { data } = await supabase.rpc("find_friends", {
    phone_hashes: [...phoneHashes],
    email_hashes: [...emailHashes],
  });
  return (data as Profile[]) ?? [];
}

/** Store hashes of the user's own email so contacts of theirs can match them. */
export async function upsertMyContactHashes(email?: string | null): Promise<void> {
  const me = await uid();
  if (!me) return;
  const normalized = normalizeEmail(email ?? "");
  if (!normalized) return;
  await supabase.from("profile_contacts").upsert({
    id: me,
    email_hash: await sha256(normalized),
  });
}
