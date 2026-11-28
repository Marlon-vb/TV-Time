/**
 * Which aired episodes deserve a push, and to whom.
 *
 * Pure so the scheduled job and the unit tests share one definition:
 * the episode's air time has passed, it is still inside the lookback
 * (a missed run still catches it), it aired after the person
 * turned alerts on and after they followed the show, and we have not
 * already sent it. Future episodes wait. Old ones never backfill.
 */

export const ALERT_LOOKBACK_MS = 36 * 60 * 60 * 1000;

export interface DueEpisode {
  showId: number;
  season: number;
  episode: number;
  name: string;
  /** UTC ISO, the same airstamp the on-device calendar stores. */
  airstamp: string;
}

export interface AlertSubscriber {
  userId: string;
  showId: number;
  showName: string;
  /** When they last turned episode alerts on. */
  enabledAt: string;
  /** When they followed this show (not when the phone last synced). */
  trackedAt: string;
}

export interface SentAlert {
  userId: string;
  showId: number;
  season: number;
  episode: number;
}

export interface AlertSend {
  userId: string;
  showId: number;
  showName: string;
  season: number;
  episode: number;
  episodeName: string;
  airstamp: string;
}

function sentKey(userId: string, showId: number, season: number, episode: number): string {
  return `${userId}:${showId}:${season}:${episode}`;
}

/**
 * One row per user per episode. Order is air time, then show, then user,
 * so a test (and a log) can depend on it. Callers still de-dupe in the
 * database; the `alreadySent` filter only avoids claiming rows we know
 * are done.
 */
export function alertsDue(
  episodes: DueEpisode[],
  subscribers: AlertSubscriber[],
  alreadySent: SentAlert[],
  now: Date,
  lookbackMs = ALERT_LOOKBACK_MS
): AlertSend[] {
  const sent = new Set(
    alreadySent.map((s) => sentKey(s.userId, s.showId, s.season, s.episode))
  );
  const byShow = new Map<number, AlertSubscriber[]>();
  for (const sub of subscribers) {
    const list = byShow.get(sub.showId);
    if (list) list.push(sub);
    else byShow.set(sub.showId, [sub]);
  }

  const nowMs = now.getTime();
  const earliest = nowMs - lookbackMs;
  const out: AlertSend[] = [];

  for (const ep of episodes) {
    const air = Date.parse(ep.airstamp);
    if (!Number.isFinite(air) || air > nowMs || air < earliest) continue;
    const subs = byShow.get(ep.showId);
    if (!subs) continue;
    for (const sub of subs) {
      const enabled = Date.parse(sub.enabledAt);
      const tracked = Date.parse(sub.trackedAt);
      if (!Number.isFinite(enabled) || air < enabled) continue;
      if (!Number.isFinite(tracked) || air < tracked) continue;
      if (sent.has(sentKey(sub.userId, ep.showId, ep.season, ep.episode))) continue;
      out.push({
        userId: sub.userId,
        showId: ep.showId,
        showName: sub.showName,
        season: ep.season,
        episode: ep.episode,
        episodeName: ep.name,
        airstamp: ep.airstamp,
      });
    }
  }

  out.sort(
    (a, b) =>
      a.airstamp.localeCompare(b.airstamp) ||
      a.showId - b.showId ||
      a.season - b.season ||
      a.episode - b.episode ||
      a.userId.localeCompare(b.userId)
  );
  return out;
}
