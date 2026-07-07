import { beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.TV_API_MOCK = "1"; // push deliveries land in push_outbox

import { getDb } from "../db";
import { addSubscription } from "../push";
import { checkAndNotify } from "../notifier";

const HOUR = 3_600_000;

function seedShow(id: number, name: string, archived = 0) {
  getDb()
    .prepare(
      `INSERT INTO shows (id, name, status, genres, followed_at, archived)
       VALUES (?, ?, 'Running', '[]', ?, ?)`
    )
    .run(id, name, new Date().toISOString(), archived);
}

function seedEpisode(
  id: number,
  showId: number,
  season: number,
  number: number,
  airedOffsetHours: number,
  watched = false
) {
  const airstamp = new Date(Date.now() + airedOffsetHours * HOUR).toISOString();
  getDb()
    .prepare(
      `INSERT INTO episodes (id, show_id, season, number, name, airstamp, watched_at)
       VALUES (?, ?, ?, ?, 'Ep', ?, ?)`
    )
    .run(id, showId, season, number, airstamp, watched ? airstamp : null);
}

function outbox(): { endpoint: string; payload: string }[] {
  return getDb()
    .prepare("SELECT endpoint, payload FROM push_outbox ORDER BY id")
    .all() as { endpoint: string; payload: string }[];
}

function subscribe(endpoint = "https://push.example/device-1") {
  addSubscription({ endpoint, keys: { p256dh: "k", auth: "a" } }, "Test");
}

beforeEach(() => {
  // Fresh database per test: new data dir, drop the cached handle.
  (globalThis as Record<string, unknown>).__tvtime_db = undefined;
  process.env.TVTIME_DATA_DIR = fs.mkdtempSync(
    path.join(os.tmpdir(), "tvtime-test-")
  );
  delete process.env.PUSH_LOOKBACK_HOURS;
});

describe("checkAndNotify", () => {
  it("notifies only fresh, unwatched, non-archived aired episodes", async () => {
    seedShow(1, "Midnight Signal");
    seedShow(2, "Archived Show", 1);
    seedEpisode(11, 1, 3, 5, -1); // aired 1h ago → notify
    seedEpisode(12, 1, 3, 4, -24 * 30); // aired a month ago → too old
    seedEpisode(13, 1, 3, 6, +48); // future → no
    seedEpisode(14, 1, 3, 3, -2, true); // watched already → no
    seedEpisode(21, 2, 1, 1, -1); // archived show → no
    subscribe();

    const result = await checkAndNotify();
    expect(result.episodes).toBe(1);
    const messages = outbox();
    expect(messages).toHaveLength(1);
    const payload = JSON.parse(messages[0].payload);
    expect(payload.title).toBe("Midnight Signal");
    expect(payload.body).toContain("S03E05");
    expect(payload.url).toBe("/show/1");
  });

  it("does nothing (and keeps episodes pending) with no subscribers", async () => {
    seedShow(1, "Deadline");
    seedEpisode(11, 1, 1, 1, -1);

    expect((await checkAndNotify()).episodes).toBe(0);
    expect(outbox()).toHaveLength(0);

    // A device subscribing later still gets the episode.
    subscribe();
    expect((await checkAndNotify()).episodes).toBe(1);
  });

  it("never notifies the same episode twice", async () => {
    seedShow(1, "Orbit City");
    seedEpisode(11, 1, 4, 2, -1);
    subscribe();

    expect((await checkAndNotify()).episodes).toBe(1);
    expect((await checkAndNotify()).episodes).toBe(0);
    expect(outbox()).toHaveLength(1);
  });

  it("collapses more than four episodes into one digest", async () => {
    seedShow(1, "Static & Sons");
    for (let n = 1; n <= 5; n++) seedEpisode(10 + n, 1, 1, n, -1);
    subscribe();

    const result = await checkAndNotify();
    expect(result.episodes).toBe(5);
    const messages = outbox();
    expect(messages).toHaveLength(1);
    const payload = JSON.parse(messages[0].payload);
    expect(payload.title).toBe("5 new episodes aired");
    expect(payload.tag).toBe("tvtime-digest");
  });

  it("fans out to every subscribed device", async () => {
    seedShow(1, "Glasshouse");
    seedEpisode(11, 1, 1, 1, -1);
    subscribe("https://push.example/phone");
    subscribe("https://push.example/laptop");

    const result = await checkAndNotify();
    expect(result.sent).toBe(2);
    expect(outbox()).toHaveLength(2);
  });
});
