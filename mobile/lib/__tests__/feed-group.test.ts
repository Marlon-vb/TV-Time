import { describe, expect, it } from "vitest";
import { groupActivityText, groupFeed } from "../social/feed-group";
import type { FeedItem } from "../social/types";

const HOUR = 3600_000;
const BASE = Date.parse("2026-08-20T20:00:00Z");

function item(over: Partial<FeedItem> & { id: string }): FeedItem {
  return {
    user_id: "u1",
    username: "loic",
    display_name: "Loïc",
    avatar_url: null,
    type: "watched",
    show_id: 10,
    show_name: "Breaking Bad",
    poster_url: null,
    season: 1,
    episode: 1,
    episode_name: "Pilot",
    rating: null,
    created_at: new Date(BASE).toISOString(),
    ...over,
  };
}

/** Newest-first, one every `stepMin` minutes, as the feed returns them. */
function run(n: number, stepMin: number, over: Partial<FeedItem> = {}) {
  return Array.from({ length: n }, (_, i) =>
    item({
      id: `a${i}`,
      episode: n - i,
      created_at: new Date(BASE - i * stepMin * 60_000).toISOString(),
      ...over,
    })
  );
}

describe("groupFeed", () => {
  it("collapses a backfill burst into one row", () => {
    const groups = groupFeed(run(23, 2));
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(23);
    expect(groupActivityText(groups[0])).toBe(
      "watched 23 episodes of Breaking Bad"
    );
  });

  it("keeps the newest activity as the group's face", () => {
    const groups = groupFeed(run(5, 2));
    expect(groups[0].item.id).toBe("a0");
    expect(groups[0].key).toBe("a0");
  });

  it("leaves a lone watch alone", () => {
    const groups = groupFeed([item({ id: "solo" })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(1);
  });

  it("splits runs of different shows", () => {
    const groups = groupFeed([
      ...run(3, 2),
      ...run(2, 2, { show_id: 99, show_name: "Severance" }).map((i) => ({
        ...i,
        id: `b${i.episode}`,
        created_at: new Date(BASE - 10 * 60_000).toISOString(),
      })),
    ]);
    expect(groups.map((g) => g.count)).toEqual([3, 2]);
  });

  it("splits runs from different people watching the same show", () => {
    const mine = run(2, 2);
    const theirs = run(2, 2).map((i) => ({
      ...i,
      id: `c${i.episode}`,
      user_id: "u2",
    }));
    expect(groupFeed([...mine, ...theirs]).map((g) => g.count)).toEqual([2, 2]);
  });

  it("treats a six-hour gap as a separate sitting", () => {
    const groups = groupFeed([
      item({ id: "n1", created_at: new Date(BASE).toISOString() }),
      item({ id: "n2", created_at: new Date(BASE - 7 * HOUR).toISOString() }),
    ]);
    expect(groups.map((g) => g.count)).toEqual([1, 1]);
  });

  it("chains a long session instead of cutting it at six hours", () => {
    // An eight-hour binge in one-hour steps is one sitting, even though the
    // ends are further apart than the window.
    const groups = groupFeed(run(9, 60));
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(9);
  });

  it("never collapses ratings or comments", () => {
    const groups = groupFeed([
      item({ id: "r1", type: "rated", rating: 5 }),
      item({ id: "r2", type: "rated", rating: 4 }),
      item({ id: "c1", type: "commented" }),
    ]);
    expect(groups.map((g) => g.count)).toEqual([1, 1, 1]);
  });

  it("preserves every activity — grouping is display-only", () => {
    const items = run(12, 3);
    const total = groupFeed(items).reduce((n, g) => n + g.count, 0);
    expect(total).toBe(items.length);
  });
});
