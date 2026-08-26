import { describe, expect, it } from "vitest";
import { hasUnseen, seenMarker, unseenFollowers } from "../follow-inbox";
import type { FollowerRow } from "../social/api";

const f = (username: string, followed_at: string): FollowerRow => ({
  id: username,
  username,
  display_name: null,
  avatar_url: null,
  created_at: followed_at,
  followed_at,
});

// Newest first, the order the query returns.
const rows = [
  f("cass", "2026-08-26T10:00:00Z"),
  f("bo", "2026-08-24T10:00:00Z"),
  f("ada", "2026-08-20T10:00:00Z"),
];

describe("unseenFollowers", () => {
  it("counts only what arrived after the last open", () => {
    expect(
      unseenFollowers(rows, "2026-08-24T10:00:00Z").map((r) => r.username)
    ).toEqual(["cass"]);
  });

  it("treats everything as new before the first open", () => {
    expect(unseenFollowers(rows, null)).toHaveLength(3);
  });

  it("is empty once the marker matches the newest follower", () => {
    expect(unseenFollowers(rows, "2026-08-26T10:00:00Z")).toEqual([]);
    expect(hasUnseen(rows, "2026-08-26T10:00:00Z")).toBe(false);
  });

  it("has nothing to show for an account nobody follows", () => {
    expect(hasUnseen([], null)).toBe(false);
  });
});

describe("seenMarker", () => {
  it("stamps the newest follower, not the clock", () => {
    // A follow landing between the fetch and the tap must survive as unread;
    // stamping "now" would mark it read without it ever being shown.
    const now = new Date("2026-08-26T12:00:00Z");
    expect(seenMarker(rows, now)).toBe("2026-08-26T10:00:00Z");
  });

  it("falls back to the clock when there is nothing to mark", () => {
    const now = new Date("2026-08-26T12:00:00Z");
    expect(seenMarker([], now)).toBe(now.toISOString());
  });

  it("round-trips: marking seen clears the badge", () => {
    expect(hasUnseen(rows, seenMarker(rows))).toBe(false);
  });
});
