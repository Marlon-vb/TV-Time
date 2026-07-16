import { describe, expect, it } from "vitest";
import { airedLabel, buildWidgetPayload } from "../widget-data";
import type { WatchNextItem } from "../types";

const NOW = new Date("2026-07-16T20:00:00Z");
const DAY = 86_400_000;

function item(
  id: number,
  daysAgo: number,
  airedUnwatched = 1,
  season = 1,
  number = 1
): WatchNextItem {
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
    },
    episode: {
      id: id * 100,
      show_id: id,
      season,
      number,
      name: "Ep",
      airdate: null,
      airstamp: new Date(NOW.getTime() - daysAgo * DAY).toISOString(),
      runtime: 45,
      summary: null,
      image_url: null,
      watched_at: null,
      rating: null,
      plays: 0,
    },
    aired_unwatched: airedUnwatched,
    watched_count: 0,
    last_watched_at: null,
  };
}

describe("airedLabel", () => {
  it("formats relative air dates", () => {
    expect(airedLabel(new Date(NOW).toISOString(), NOW)).toBe("Aired today");
    expect(airedLabel(new Date(NOW.getTime() - DAY).toISOString(), NOW)).toBe(
      "Aired yesterday"
    );
    expect(airedLabel(new Date(NOW.getTime() - 3 * DAY).toISOString(), NOW)).toBe(
      "Aired 3 days ago"
    );
    expect(airedLabel(new Date(NOW.getTime() - 10 * DAY).toISOString(), NOW)).toBe(
      "Aired 1 week ago"
    );
    expect(airedLabel(new Date(NOW.getTime() - 21 * DAY).toISOString(), NOW)).toBe(
      "Aired 3 weeks ago"
    );
    expect(airedLabel(null, NOW)).toBe("");
  });
});

describe("buildWidgetPayload", () => {
  it("summarizes the backlog and caps the item list", () => {
    const items = [
      item(1, 2, 3, 2, 5),
      item(2, 0, 1),
      item(3, 5, 2),
      item(4, 8, 1),
      item(5, 12, 4),
    ];
    const payload = buildWidgetPayload(items, NOW);
    expect(payload.count).toBe(3 + 1 + 2 + 1 + 4); // total aired-unwatched
    expect(payload.items).toHaveLength(4); // default max
    expect(payload.items[0]).toEqual({
      id: 100,
      show: "Show 1",
      code: "S02E05",
      detail: "Aired 2 days ago",
    });
    expect(payload.updatedAt).toBe(NOW.toISOString());
  });

  it("handles an empty backlog", () => {
    const payload = buildWidgetPayload([], NOW);
    expect(payload.count).toBe(0);
    expect(payload.items).toEqual([]);
  });
});
