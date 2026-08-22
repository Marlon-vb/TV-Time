import { describe, expect, it } from "vitest";
import { groupWatchNext, sectionForItem } from "../watchNextSections";
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
    rating: null,
    review: null,
    favorited_at: null,
    favorite_rank: null,
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
      community_rating: null,
      plays: 0,
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

  it("orders up next by most recently watched first", () => {
    const items = [
      item({ id: 1, lastWatchedDaysAgo: 10 }),
      item({ id: 2, lastWatchedDaysAgo: 1 }),
      item({ id: 3, lastWatchedDaysAgo: 5 }),
    ];
    const upNext = groupWatchNext(items, NOW).find((s) => s.key === "up_next")!;
    expect(upNext.data.map((i) => i.show.id)).toEqual([2, 3, 1]);
  });
});
