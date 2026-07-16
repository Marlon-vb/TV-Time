import { describe, expect, it } from "vitest";
import { groupWatchNext, sectionForItem } from "../watchNextSections";
import { pickTonight } from "../tonight";
import type { WatchNextItem } from "../types";

const NOW = new Date("2026-07-13T20:00:00Z");
const DAY = 86_400_000;

function item(
  overrides: Partial<WatchNextItem> & {
    id?: number;
    watched?: number;
    lastWatchedDaysAgo?: number | null;
  } = {}
): WatchNextItem {
  const id = overrides.id ?? 1;
  return {
    show: {
      id,
      name: `Show ${id}`,
      tvdb_id: null,
      imdb_id: null,
      tmdb_id: null,
      poster_url: null,
      backdrop_url: null,
      status: "Running",
      network: null,
      runtime: 45,
      premiered: null,
      genres: "[]",
      summary: null,
      followed_at: "",
      archived: 0,
      last_synced_at: null,
      ...(overrides.show ?? {}),
    },
    episode: {
      id: id * 100,
      show_id: id,
      season: 1,
      number: 1,
      name: "Ep",
      airdate: null,
      airstamp: new Date(NOW.getTime() - DAY).toISOString(),
      runtime: overrides.episode?.runtime ?? 45,
      summary: null,
      image_url: null,
      watched_at: null,
      rating: null,
      ...(overrides.episode ?? {}),
    },
    aired_unwatched: overrides.aired_unwatched ?? 5,
    watched_count: overrides.watched ?? 3,
    last_watched_at:
      overrides.lastWatchedDaysAgo === null
        ? null
        : new Date(
            NOW.getTime() - (overrides.lastWatchedDaysAgo ?? 2) * DAY
          ).toISOString(),
  };
}

describe("watch next sections", () => {
  it("buckets items the TV Time way", () => {
    expect(sectionForItem(item({ watched: 0 }), NOW)).toBe("not_started");
    expect(sectionForItem(item({ lastWatchedDaysAgo: 45 }), NOW)).toBe("idle");
    expect(sectionForItem(item({ lastWatchedDaysAgo: 2 }), NOW)).toBe("up_next");
    // exactly at the boundary is not yet idle
    expect(sectionForItem(item({ lastWatchedDaysAgo: 30 }), NOW)).toBe("up_next");
  });

  it("groups in order, drops empty sections, most-neglected idle first", () => {
    const items = [
      item({ id: 1, lastWatchedDaysAgo: 2 }),
      item({ id: 2, lastWatchedDaysAgo: 60 }),
      item({ id: 3, lastWatchedDaysAgo: 90 }),
      item({ id: 4, watched: 0 }),
    ];
    const sections = groupWatchNext(items, NOW);
    expect(sections.map((s) => s.key)).toEqual([
      "up_next",
      "idle",
      "not_started",
    ]);
    expect(sections[1].data.map((i) => i.show.id)).toEqual([3, 2]);

    const onlyFresh = groupWatchNext([item({ id: 1 })], NOW);
    expect(onlyFresh).toHaveLength(1);
    expect(onlyFresh[0].key).toBe("up_next");
  });
});

describe("pickTonight", () => {
  it("returns null for an empty backlog", () => {
    expect(pickTonight([], () => 0.5, NOW)).toBeNull();
  });

  it("picks deterministically with a seeded rand and gives a reason", () => {
    const items = [
      item({ id: 1, watched: 0 }),
      item({ id: 2, lastWatchedDaysAgo: 70 }),
      item({ id: 3, aired_unwatched: 1 }),
    ];
    const first = pickTonight(items, () => 0, NOW)!;
    expect(first.item.show.id).toBe(1);
    expect(first.reason).toContain("never started");

    const idle = pickTonight(items, () => 0.4, NOW)!;
    expect(idle.item.show.id).toBe(2);
    expect(idle.reason).toContain("since you watched");

    const nearly = pickTonight(items, () => 0.9, NOW)!;
    expect(nearly.item.show.id).toBe(3);
    expect(nearly.reason).toContain("fully caught up");
  });

  it("avoids repeating the excluded episode when rerolling", () => {
    const items = [item({ id: 1 }), item({ id: 2 })];
    for (let r = 0; r < 1; r += 0.25) {
      const pick = pickTonight(items, () => r, NOW, 100)!; // exclude show 1's ep
      expect(pick.item.episode.id).toBe(200);
    }
  });
});
