// New-episode pushes.
//
// pg_cron calls this every 15 minutes (see alerts-and-watch.sql). It refreshes
// air dates from TVmaze for shows people follow — the same source, and the
// same airstamp, as the on-device calendar — then pushes once per user per
// episode through Expo. A row in episode_alerts_sent is the de-dupe, claimed
// before the send and released if Expo never accepts the batch.
//
// Local notifications stay as the fallback for anyone signed out, or for a
// phone whose token we could not register. This job is the path that still
// works when the app has not been opened, and it is not capped at iOS's 64
// pending notifications.
//
// Deploy:  supabase functions deploy episode-alerts --no-verify-jwt
// Secret:  NOTIFY_SECRET — the same shared secret the social `notify`
//          function already checks. pg_net sends it as x-notify-secret.
// Table:   run ../../alerts-and-watch.sql, then insert episode_alert_config.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  ALERT_LOOKBACK_MS,
  alertsDue,
  type AlertSend,
} from "../_shared/episode-due.ts";

const REFRESH_CAP = 20;
const STALE_MS = 12 * 60 * 60 * 1000;
const EXPO_CHUNK = 100;
// TVmaze allows about 20 calls per 10 seconds. Stay under that.
const TVMAZE_GAP_MS = 550;

interface ExpoPushTicket {
  status: "ok" | "error";
  details?: { error?: string };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

function epCode(season: number, episode: number): string {
  return `S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`;
}

interface EpisodeRow {
  show_id: number;
  season: number;
  episode: number;
  name: string;
  airstamp: string;
  fetched_at: string;
}

function parseEpisodes(showId: number, body: unknown, fetchedAt: string): EpisodeRow[] {
  if (!Array.isArray(body)) return [];
  const byKey = new Map<string, EpisodeRow>();
  for (const raw of body) {
    if (!raw || typeof raw !== "object") continue;
    const e = raw as Record<string, unknown>;
    const season = e.season;
    const number = e.number;
    const airstamp = e.airstamp;
    if (typeof season !== "number" || !Number.isInteger(season) || season < 0) continue;
    if (typeof number !== "number" || !Number.isInteger(number) || number < 0) continue;
    if (typeof airstamp !== "string" || !Number.isFinite(Date.parse(airstamp))) continue;
    const name = typeof e.name === "string" ? e.name.slice(0, 300) : "";
    byKey.set(`${season}:${number}`, {
      show_id: showId,
      season,
      episode: number,
      name,
      airstamp: new Date(airstamp).toISOString(),
      fetched_at: fetchedAt,
    });
  }
  return [...byKey.values()];
}

async function refreshShow(showId: number): Promise<EpisodeRow[] | null> {
  const res = await fetch(`https://api.tvmaze.com/shows/${showId}/episodes`, {
    headers: {
      Accept: "application/json",
      "User-Agent": "TVApp/episode-alerts",
    },
  });
  if (res.status === 404) return [];
  if (!res.ok) return null;
  return parseEpisodes(showId, await res.json(), new Date().toISOString());
}

async function replaceShowEpisodes(
  db: SupabaseClient,
  showId: number,
  rows: EpisodeRow[]
): Promise<void> {
  const { error: cleared } = await db.from("tracked_episodes").delete().eq("show_id", showId);
  if (cleared) throw new Error(cleared.message);
  if (rows.length > 0) {
    const { error } = await db.from("tracked_episodes").insert(rows);
    if (error) throw new Error(error.message);
  }
  const { error: stamped } = await db.from("show_schedule_fetches").upsert({
    show_id: showId,
    fetched_at: new Date().toISOString(),
  });
  if (stamped) throw new Error(stamped.message);
}

interface Claimed {
  user_id: string;
  show_id: number;
  season: number;
  episode: number;
}

async function claim(db: SupabaseClient, sends: AlertSend[]): Promise<Set<string>> {
  const { data, error } = await db.rpc("claim_episode_alerts", {
    p_rows: sends.map((s) => ({
      user_id: s.userId,
      show_id: s.showId,
      season: s.season,
      episode: s.episode,
    })),
  });
  if (error) throw new Error(error.message);
  const keys = new Set<string>();
  for (const row of (data ?? []) as Claimed[]) {
    keys.add(`${row.user_id}:${row.show_id}:${row.season}:${row.episode}`);
  }
  return keys;
}

async function release(db: SupabaseClient, sends: AlertSend[]): Promise<void> {
  if (sends.length === 0) return;
  await db.rpc("release_episode_alerts", {
    p_rows: sends.map((s) => ({
      user_id: s.userId,
      show_id: s.showId,
      season: s.season,
      episode: s.episode,
    })),
  });
}

interface Outbound {
  send: AlertSend;
  token: string;
}

async function sendChunk(
  db: SupabaseClient,
  chunk: Outbound[]
): Promise<{ delivered: number; dead: string[] }> {
  const messages = chunk.map((item) => ({
    to: item.token,
    sound: "default" as const,
    title: item.send.showName,
    body: `${epCode(item.send.season, item.send.episode)} · ${item.send.episodeName || "New episode"} is out now`,
    data: { url: `/show/${item.send.showId}` },
  }));
  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(messages),
  });
  if (!res.ok) {
    await release(
      db,
      chunk.map((item) => item.send)
    );
    return { delivered: 0, dead: [] };
  }
  const tickets = (await res.json().catch(() => null)) as { data?: ExpoPushTicket[] } | null;
  const dead: string[] = [];
  tickets?.data?.forEach((ticket, i) => {
    if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
      dead.push(chunk[i].token);
    }
  });
  return { delivered: chunk.length, dead };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  const secret = Deno.env.get("NOTIFY_SECRET");
  if (!secret || req.headers.get("x-notify-secret") !== secret) {
    return json({ error: "unauthorized" }, 401);
  }

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: prefs, error: prefErr } = await db
    .from("notification_prefs")
    .select("user_id, enabled_at")
    .eq("episode_alerts", true);
  if (prefErr) return json({ error: prefErr.message }, 500);
  if (!prefs || prefs.length === 0) return json({ sent: 0, refreshed: 0 });

  const enabledAt = new Map(prefs.map((p) => [p.user_id as string, p.enabled_at as string]));
  const userIds = [...enabledAt.keys()];

  const { data: tracked, error: trackErr } = await db
    .from("tracked_shows")
    .select("user_id, show_id, name, tracked_at")
    .in("user_id", userIds);
  if (trackErr) return json({ error: trackErr.message }, 500);
  const shows = tracked ?? [];
  if (shows.length === 0) return json({ sent: 0, refreshed: 0 });

  const showIds = [...new Set(shows.map((s) => s.show_id as number))];
  const { data: fetches } = await db
    .from("show_schedule_fetches")
    .select("show_id, fetched_at")
    .in("show_id", showIds);
  const fetchedAt = new Map(
    (fetches ?? []).map((f) => [f.show_id as number, Date.parse(f.fetched_at as string)])
  );
  const staleBefore = Date.now() - STALE_MS;
  const stale = showIds
    .filter((id) => (fetchedAt.get(id) ?? 0) < staleBefore)
    .sort((a, b) => (fetchedAt.get(a) ?? 0) - (fetchedAt.get(b) ?? 0))
    .slice(0, REFRESH_CAP);

  let refreshed = 0;
  for (const showId of stale) {
    try {
      const rows = await refreshShow(showId);
      if (rows) {
        await replaceShowEpisodes(db, showId, rows);
        refreshed += 1;
      }
    } catch {
      // One show failing leaves last time's dates in place. The next run retries.
    }
    await new Promise((r) => setTimeout(r, TVMAZE_GAP_MS));
  }

  const now = new Date();
  const since = new Date(now.getTime() - ALERT_LOOKBACK_MS).toISOString();
  const { data: aired, error: airedErr } = await db
    .from("tracked_episodes")
    .select("show_id, season, episode, name, airstamp")
    .gte("airstamp", since)
    .lte("airstamp", now.toISOString());
  if (airedErr) return json({ error: airedErr.message }, 500);

  const airedShows = [...new Set((aired ?? []).map((e) => e.show_id as number))];
  let already: { user_id: string; show_id: number; season: number; episode: number }[] = [];
  if (airedShows.length > 0) {
    const { data: sentRows } = await db
      .from("episode_alerts_sent")
      .select("user_id, show_id, season, episode")
      .in("show_id", airedShows);
    already = sentRows ?? [];
  }

  const due = alertsDue(
    (aired ?? []).map((e) => ({
      showId: e.show_id as number,
      season: e.season as number,
      episode: e.episode as number,
      name: (e.name as string) ?? "",
      airstamp: e.airstamp as string,
    })),
    shows.map((s) => ({
      userId: s.user_id as string,
      showId: s.show_id as number,
      showName: (s.name as string) || "A show you follow",
      enabledAt: enabledAt.get(s.user_id as string) ?? now.toISOString(),
      trackedAt: s.tracked_at as string,
    })),
    already.map((s) => ({
      userId: s.user_id,
      showId: s.show_id,
      season: s.season,
      episode: s.episode,
    })),
    now
  );
  if (due.length === 0) return json({ sent: 0, refreshed, due: 0 });

  const dueUserIds = [...new Set(due.map((s) => s.userId))];
  const { data: tokenRows, error: tokenErr } = await db
    .from("push_tokens")
    .select("user_id, token")
    .in("user_id", dueUserIds);
  if (tokenErr) return json({ error: tokenErr.message, refreshed }, 500);
  const tokensByUser = new Map<string, string[]>();
  for (const row of tokenRows ?? []) {
    const token = row.token as string;
    if (!token.startsWith("ExponentPushToken")) continue;
    const list = tokensByUser.get(row.user_id as string) ?? [];
    list.push(token);
    tokensByUser.set(row.user_id as string, list);
  }

  // No token yet: don't claim. The next run retries until the episode
  // leaves the lookback, which covers a phone that registers a few minutes late.
  const deliverable = due.filter((s) => (tokensByUser.get(s.userId) ?? []).length > 0);
  if (deliverable.length === 0) {
    return json({ sent: 0, refreshed, due: due.length, waitingForToken: due.length });
  }

  let claimed: Set<string>;
  try {
    claimed = await claim(db, deliverable);
  } catch (err) {
    return json({ error: String(err), refreshed }, 500);
  }
  const mine = deliverable.filter((s) =>
    claimed.has(`${s.userId}:${s.showId}:${s.season}:${s.episode}`)
  );
  if (mine.length === 0) return json({ sent: 0, refreshed, due: due.length });

  const dead: string[] = [];
  let delivered = 0;
  let batch: Outbound[] = [];
  let batchSends: AlertSend[] = [];
  const flush = async () => {
    if (batch.length === 0) return;
    const chunk = batch;
    const sends = batchSends;
    batch = [];
    batchSends = [];
    try {
      const result = await sendChunk(db, chunk);
      delivered += result.delivered;
      dead.push(...result.dead);
    } catch {
      await release(db, sends);
    }
  };
  for (const send of mine) {
    const tokens = tokensByUser.get(send.userId) ?? [];
    if (batch.length + tokens.length > EXPO_CHUNK && batch.length > 0) await flush();
    for (const token of tokens) batch.push({ send, token });
    batchSends.push(send);
  }
  await flush();

  if (dead.length > 0) {
    await db.from("push_tokens").delete().in("token", [...new Set(dead)]);
  }

  return json({
    sent: delivered,
    refreshed,
    due: due.length,
    claimed: mine.length,
    waitingForToken: due.length - deliverable.length,
  });
});
