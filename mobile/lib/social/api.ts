import * as Contacts from "expo-contacts";
import * as Crypto from "expo-crypto";
import { supabase } from "@/lib/supabase";
import { normalizeEmail, normalizePhone } from "./hash";
import type { ActivityInput, Comment, FeedItem, Profile } from "./types";

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

// ------------------------------------------------------------------ comments

export async function getComments(
  showId: number,
  season: number,
  episode: number
): Promise<Comment[]> {
  const { data } = await supabase
    .from("comments")
    .select("*, author:profiles!comments_user_id_fkey(username,display_name,avatar_url)")
    .eq("show_id", showId)
    .eq("season", season)
    .eq("episode", episode)
    .order("created_at", { ascending: false });
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  return ((data as any[]) ?? []).map((c) => ({
    ...c,
    username: c.author?.username,
    display_name: c.author?.display_name,
    avatar_url: c.author?.avatar_url,
  }));
}

export async function addComment(
  showId: number,
  season: number,
  episode: number,
  body: string
): Promise<void> {
  const me = await uid();
  if (!me) return;
  await supabase.from("comments").insert({
    user_id: me,
    show_id: showId,
    season,
    episode,
    body: body.trim(),
  });
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
