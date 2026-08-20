import { describe, expect, it } from "vitest";
import {
  airedLine,
  cardFileName,
  cardShareMessage,
  freshCard,
  isFinish,
  isFresh,
  watchTimeLine,
} from "../share-card";

const NOW = new Date("2026-08-20T20:00:00Z");
const hoursAgo = (h: number) =>
  new Date(NOW.getTime() - h * 3600_000).toISOString();

describe("isFinish", () => {
  it("fires for an ended show with nothing left", () => {
    expect(
      isFinish({ status: "Ended", watchedCount: 62, unwatchedCount: 0 })
    ).toBe(true);
  });

  it("does not fire for catching up on a running show", () => {
    // Otherwise this card would reappear every week when the next episode
    // landed and was watched.
    expect(
      isFinish({ status: "Running", watchedCount: 40, unwatchedCount: 0 })
    ).toBe(false);
  });

  it("does not fire with episodes still unwatched", () => {
    expect(
      isFinish({ status: "Ended", watchedCount: 61, unwatchedCount: 1 })
    ).toBe(false);
  });

  it("does not fire for an ended show you never started", () => {
    expect(
      isFinish({ status: "Ended", watchedCount: 0, unwatchedCount: 0 })
    ).toBe(false);
  });
});

describe("isFresh", () => {
  it("accepts an episode from the last two days", () => {
    expect(isFresh(hoursAgo(1), NOW)).toBe(true);
    expect(isFresh(hoursAgo(47), NOW)).toBe(true);
  });

  it("rejects one older than the window", () => {
    expect(isFresh(hoursAgo(49), NOW)).toBe(false);
  });

  it("rejects an episode that has not aired yet", () => {
    expect(isFresh(hoursAgo(-3), NOW)).toBe(false);
  });

  it("rejects missing or unparseable airstamps", () => {
    expect(isFresh(null, NOW)).toBe(false);
    expect(isFresh("soon", NOW)).toBe(false);
  });
});

describe("airedLine", () => {
  it("scales from minutes to days", () => {
    expect(airedLine(hoursAgo(0.2), NOW)).toBe("Aired minutes ago");
    expect(airedLine(hoursAgo(1), NOW)).toBe("Aired 1 hour ago");
    expect(airedLine(hoursAgo(4), NOW)).toBe("Aired 4 hours ago");
    expect(airedLine(hoursAgo(30), NOW)).toBe("Aired yesterday");
    expect(airedLine(hoursAgo(50), NOW)).toBe("Aired 2 days ago");
  });
});

describe("watchTimeLine", () => {
  it("stays in hours below a day and never says '1 hours'", () => {
    expect(watchTimeLine(60)).toBe("1 hour");
    expect(watchTimeLine(600)).toBe("10 hours");
  });

  it("switches to days, dropping a zero remainder", () => {
    expect(watchTimeLine(24 * 60)).toBe("1 day");
    expect(watchTimeLine(2 * 24 * 60 + 4 * 60)).toBe("2 days 4h");
  });
});

describe("freshCard", () => {
  const show = { name: "Severance", poster_url: "https://p/s.jpg" };
  const ep = {
    season: 2,
    number: 7,
    name: "Chikhai Bardo",
    airstamp: hoursAgo(4),
  };

  it("builds a card for a just-aired episode", () => {
    const card = freshCard(show, ep, NOW);
    expect(card).toMatchObject({
      kind: "fresh",
      showName: "Severance",
      code: "S02E07",
      airedLine: "Aired 4 hours ago",
    });
  });

  it("returns null once the episode is old news", () => {
    expect(freshCard(show, { ...ep, airstamp: hoursAgo(100) }, NOW)).toBeNull();
    expect(freshCard(show, { ...ep, airstamp: null }, NOW)).toBeNull();
  });
});

describe("cardShareMessage", () => {
  it("writes each card's caption", () => {
    expect(
      cardShareMessage({
        kind: "finished",
        showName: "Breaking Bad",
        posterUrl: null,
        episodes: 62,
        minutes: 2800,
        rating: 5,
      })
    ).toBe("Finished Breaking Bad — ★★★★★ 🏁");

    expect(
      cardShareMessage({
        kind: "fresh",
        showName: "Severance",
        posterUrl: null,
        code: "S02E07",
        episodeName: null,
        airedLine: "Aired 4 hours ago",
      })
    ).toBe("Just watched Severance S02E07 — aired 4 hours ago 📺");

    expect(
      cardShareMessage({
        kind: "year",
        year: 2026,
        episodes: 812,
        minutes: 24000,
        shows: 41,
        topGenre: "Drama",
        posters: [],
      })
    ).toBe("My 2026 in TV: 812 episodes, 16 days 16h watched 📺");
  });
});

describe("cardFileName", () => {
  it("slugs the show name and never produces an empty stem", () => {
    expect(
      cardFileName({
        kind: "finished",
        showName: "Marvel's Daredevil",
        posterUrl: null,
        episodes: 1,
        minutes: 1,
        rating: null,
      })
    ).toBe("finished-marvel-s-daredevil.png");
    expect(
      cardFileName({
        kind: "fresh",
        showName: "!!!",
        posterUrl: null,
        code: "S01E01",
        episodeName: null,
        airedLine: "",
      })
    ).toBe("tv-app-s01e01.png");
  });
});
