import { describe, expect, it } from "vitest";
import { byTopThenNewest, feedActivityText, shortAgo } from "../format-social";
import type { FeedItem } from "../social/types";

function feed(overrides: Partial<FeedItem>): FeedItem {
  return {
    id: "1",
    user_id: "u",
    username: "alex",
    display_name: "Alex",
    avatar_url: null,
    type: "watched",
    show_id: 101,
    show_name: "Midnight Signal",
    poster_url: null,
    season: 3,
    episode: 5,
    episode_name: "The Silent Wire",
    rating: null,
    created_at: "2026-07-15T12:00:00Z",
    ...overrides,
  };
}

describe("feedActivityText", () => {
  it("describes each activity type", () => {
    expect(feedActivityText(feed({ type: "watched" }))).toBe(
      "watched Midnight Signal S03E05"
    );
    expect(feedActivityText(feed({ type: "rated", rating: 4.5 }))).toBe(
      "rated Midnight Signal S03E05 4.5★"
    );
    expect(feedActivityText(feed({ type: "finished", season: null, episode: null }))).toBe(
      "finished Midnight Signal"
    );
    expect(feedActivityText(feed({ type: "started", season: null, episode: null }))).toBe(
      "started Midnight Signal"
    );
  });
});

describe("shortAgo", () => {
  const now = new Date("2026-07-15T12:00:00Z");
  it("formats compact durations", () => {
    expect(shortAgo("2026-07-15T11:59:30Z", now)).toBe("now");
    expect(shortAgo("2026-07-15T11:45:00Z", now)).toBe("15m");
    expect(shortAgo("2026-07-15T09:00:00Z", now)).toBe("3h");
    expect(shortAgo("2026-07-13T12:00:00Z", now)).toBe("2d");
    expect(shortAgo("2026-07-01T12:00:00Z", now)).toBe("2w");
  });
});

describe("byTopThenNewest", () => {
  const c = (upvotes: number, created_at: string) => ({ upvotes, created_at });

  it("puts the most upvoted comment first", () => {
    const rows = [c(1, "2026-07-01T10:00:00Z"), c(9, "2026-07-01T09:00:00Z"), c(4, "2026-07-01T11:00:00Z")];
    expect(rows.sort(byTopThenNewest).map((r) => r.upvotes)).toEqual([9, 4, 1]);
  });

  it("falls back to newest when upvotes tie", () => {
    const rows = [
      c(3, "2026-07-01T09:00:00Z"),
      c(3, "2026-07-01T12:00:00Z"),
      c(3, "2026-07-01T10:00:00Z"),
    ];
    expect(rows.sort(byTopThenNewest).map((r) => r.created_at)).toEqual([
      "2026-07-01T12:00:00Z",
      "2026-07-01T10:00:00Z",
      "2026-07-01T09:00:00Z",
    ]);
  });

  it("keeps zero-vote comments in newest-first order", () => {
    const rows = [c(0, "2026-07-01T08:00:00Z"), c(0, "2026-07-02T08:00:00Z")];
    expect(rows.sort(byTopThenNewest).map((r) => r.created_at)).toEqual([
      "2026-07-02T08:00:00Z",
      "2026-07-01T08:00:00Z",
    ]);
  });

  it("ranks a single upvote above a newer comment with none", () => {
    const rows = [c(0, "2026-07-05T08:00:00Z"), c(1, "2026-06-01T08:00:00Z")];
    expect(rows.sort(byTopThenNewest)[0].upvotes).toBe(1);
  });
});
