import type { WatchedRow } from "./api";

/**
 * The pure diffing core of the watch-history mirror (no native imports so
 * it's unit-testable — the orchestration lives in mirror.ts).
 */

const key = (r: { show_id: number; season: number; episode: number }) =>
  `${r.show_id}:${r.season}:${r.episode}`;

/**
 * Diff local truth against server rows.
 *
 * Safety property: deletes are proposed only for shows in `judgeShowIds`
 * (shows the local library actually contains). Server rows for anything else
 * are preserved — so a fresh install or second device signing in can never
 * wipe an existing server history.
 */
export function planReconcile(
  local: WatchedRow[],
  server: WatchedRow[],
  judgeShowIds: Set<number>
): { upserts: WatchedRow[]; deletes: WatchedRow[] } {
  const serverByKey = new Map(server.map((r) => [key(r), r]));
  const localKeys = new Set(local.map((r) => key(r)));
  const upserts = local.filter((r) => {
    const s = serverByKey.get(key(r));
    if (!s) return true;
    if ((s.rating ?? null) !== (r.rating ?? null)) return true;
    // Backfill only. watched_at arrived after these rows did, so a server row
    // still missing one gets sent again — but a row that HAS one is left
    // alone, because the two sides format timestamps differently and a
    // value-equality check would re-upsert the whole library on every pass.
    return s.watched_at == null && r.watched_at != null;
  });
  const deletes = server.filter(
    (r) => judgeShowIds.has(r.show_id) && !localKeys.has(key(r))
  );
  return { upserts, deletes };
}
