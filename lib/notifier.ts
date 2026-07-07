import { getDb } from "./db";
import { epCode } from "./format";
import { listSubscriptions, sendToAll } from "./push";

/**
 * "New episode is out" notifications. A background tick (see lib/scheduler.ts)
 * calls checkAndNotify(); any episode of a followed, non-archived show whose
 * air time passed within the lookback window — and that hasn't been watched
 * or notified about yet — triggers a push. More than four at once collapse
 * into a single digest so a first sync or a busy night doesn't spam.
 */

const DEFAULT_LOOKBACK_HOURS = 12;

declare global {
  // eslint-disable-next-line no-var
  var __tvtime_notify_running: boolean | undefined;
}

export interface AiredEpisode {
  id: number;
  show_id: number;
  show_name: string;
  season: number;
  number: number;
  name: string;
  airstamp: string;
}

export function pendingAiredEpisodes(now = new Date()): AiredEpisode[] {
  const lookbackHours =
    Number(process.env.PUSH_LOOKBACK_HOURS) || DEFAULT_LOOKBACK_HOURS;
  const from = new Date(
    now.getTime() - lookbackHours * 3_600_000
  ).toISOString();
  return getDb()
    .prepare(
      `SELECT e.id, e.show_id, s.name AS show_name, e.season, e.number, e.name, e.airstamp
       FROM episodes e
       JOIN shows s ON s.id = e.show_id AND s.archived = 0
       WHERE e.airstamp IS NOT NULL
         AND e.airstamp > ? AND e.airstamp <= ?
         AND e.watched_at IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM notified_episodes n WHERE n.episode_id = e.id
         )
       ORDER BY e.airstamp ASC`
    )
    .all(from, now.toISOString()) as AiredEpisode[];
}

function markNotified(episodeIds: number[]): void {
  const stmt = getDb().prepare(
    "INSERT OR IGNORE INTO notified_episodes (episode_id, sent_at) VALUES (?, ?)"
  );
  const at = new Date().toISOString();
  for (const id of episodeIds) stmt.run(id, at);
}

export async function checkAndNotify(): Promise<{
  episodes: number;
  sent: number;
}> {
  if (globalThis.__tvtime_notify_running) return { episodes: 0, sent: 0 };
  globalThis.__tvtime_notify_running = true;
  try {
    // No devices to notify: leave episodes unmarked so a device that
    // subscribes a moment later still hears about them.
    if (listSubscriptions().length === 0) return { episodes: 0, sent: 0 };

    const episodes = pendingAiredEpisodes();
    if (episodes.length === 0) return { episodes: 0, sent: 0 };

    let sent = 0;
    if (episodes.length <= 4) {
      for (const ep of episodes) {
        const result = await sendToAll({
          title: ep.show_name,
          body: `${epCode(ep.season, ep.number)} · ${ep.name || "New episode"} is out now`,
          url: `/show/${ep.show_id}`,
          tag: `tvtime-episode-${ep.id}`,
        });
        sent += result.sent;
      }
    } else {
      const preview = episodes
        .slice(0, 3)
        .map((e) => `${e.show_name} ${epCode(e.season, e.number)}`)
        .join(", ");
      const result = await sendToAll({
        title: `${episodes.length} new episodes aired`,
        body: `${preview} and ${episodes.length - 3} more are ready to watch`,
        url: "/",
        tag: "tvtime-digest",
      });
      sent += result.sent;
    }

    markNotified(episodes.map((e) => e.id));
    return { episodes: episodes.length, sent };
  } finally {
    globalThis.__tvtime_notify_running = false;
  }
}
