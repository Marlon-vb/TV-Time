import { describe, expect, it } from "vitest";
import { alertsDue, type AlertSubscriber, type DueEpisode } from "../../../supabase/functions/_shared/episode-due";

const now = new Date("2026-11-28T18:00:00.000Z");

function ep(hoursAgo: number, extra: Partial<DueEpisode> = {}): DueEpisode {
  return {
    showId: 1,
    season: 2,
    episode: 5,
    name: "The One",
    airstamp: new Date(now.getTime() - hoursAgo * 3_600_000).toISOString(),
    ...extra,
  };
}

const sub: AlertSubscriber = {
  userId: "user-a",
  showId: 1,
  showName: "Example",
  enabledAt: "2026-11-01T00:00:00.000Z",
  trackedAt: "2026-10-01T00:00:00.000Z",
};

describe("alertsDue", () => {
  it("includes an episode that has aired inside the lookback", () => {
    const due = alertsDue([ep(2)], [sub], [], now);
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({
      userId: "user-a",
      showName: "Example",
      season: 2,
      episode: 5,
      episodeName: "The One",
    });
  });

  it("waits for the future and ignores anything older than the lookback", () => {
    const future = ep(-3);
    const stale = ep(40);
    expect(alertsDue([future, stale], [sub], [], now)).toEqual([]);
  });

  it("does not backfill episodes from before alerts were turned on", () => {
    const late = { ...sub, enabledAt: now.toISOString() };
    expect(alertsDue([ep(2)], [late], [], now)).toEqual([]);
  });

  it("stays quiet for an episode that aired before the show was followed", () => {
    const followedAfter = { ...sub, trackedAt: now.toISOString() };
    expect(alertsDue([ep(2)], [followedAfter], [], now)).toEqual([]);
  });

  it("sends once per user per episode", () => {
    const other: AlertSubscriber = { ...sub, userId: "user-b" };
    const already = [{ userId: "user-a", showId: 1, season: 2, episode: 5 }];
    const due = alertsDue([ep(1)], [sub, other], already, now);
    expect(due.map((d) => d.userId)).toEqual(["user-b"]);
  });

  it("does not notify someone who does not follow that show", () => {
    const otherShow = ep(1, { showId: 99 });
    expect(alertsDue([otherShow], [sub], [], now)).toEqual([]);
  });
});
