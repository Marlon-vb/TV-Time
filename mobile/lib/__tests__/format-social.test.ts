import { describe, expect, it } from "vitest";
import { feedActivityText, shortAgo } from "../format-social";
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
