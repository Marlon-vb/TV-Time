import { describe, expect, it } from "vitest";
import {
  buildRatingMap,
  hasEnoughRatings,
  initialSeasonIndex,
  RATING_TIERS,
  tierFor,
} from "../rating-map";
import type { EpisodeRow } from "../types";

function ep(
  season: number,
  number: number,
  community_rating: number | null,
  watched_at: string | null = null
): EpisodeRow {
  return {
    id: season * 100 + number,
    show_id: 1,
    season,
    number,
    name: `S${season}E${number}`,
    airdate: null,
    airstamp: null,
    runtime: 45,
    summary: null,
    image_url: null,
    watched_at,
    rating: null,
    community_rating,
    plays: 0,
  };
}

const flat = (season: number, n: number, r: number | null) =>
  Array.from({ length: n }, (_, i) => ep(season, i + 1, r));

describe("tierFor", () => {
  it("puts every band on the side of its own floor", () => {
    expect(tierFor(9.0)?.label).toBe("Awesome");
    expect(tierFor(8.9)?.label).toBe("Great");
    expect(tierFor(8.0)?.label).toBe("Great");
    expect(tierFor(7.9)?.label).toBe("Good");
    expect(tierFor(6.9)?.label).toBe("Regular");
    expect(tierFor(5.8)?.label).toBe("Bad");
    expect(tierFor(3.9)?.label).toBe("Garbage");
  });

  it("treats unrated as its own state, not as a bad score", () => {
    expect(tierFor(null)).toBeNull();
  });

  it("never runs off the bottom of the scale", () => {
    expect(tierFor(0)?.label).toBe("Garbage");
    expect(RATING_TIERS[RATING_TIERS.length - 1].min).toBe(0);
  });
});

describe("hasEnoughRatings", () => {
  it("accepts a well-covered show", () => {
    expect(hasEnoughRatings(flat(1, 10, 8))).toBe(true);
  });

  it("rejects too few rated episodes", () => {
    expect(hasEnoughRatings(flat(1, 7, 8))).toBe(false);
  });

  it("rejects a sparsely rated show", () => {
    expect(hasEnoughRatings([...flat(1, 8, 8), ...flat(2, 32, null)])).toBe(false);
  });

  it("rejects a show with no episodes", () => {
    expect(hasEnoughRatings([])).toBe(false);
  });
});

describe("buildRatingMap", () => {
  it("groups by season and orders both ways", () => {
    const map = buildRatingMap([ep(2, 2, 8), ep(1, 2, 7), ep(2, 1, 9), ep(1, 1, 6)]);
    expect(map.seasons.map((s) => s.season)).toEqual([1, 2]);
    expect(map.seasons[0].cells.map((c) => c.number)).toEqual([1, 2]);
  });

  it("averages only the rated episodes of a season", () => {
    // An unrated episode must not drag the average toward zero.
    const map = buildRatingMap([ep(1, 1, 8), ep(1, 2, null), ep(1, 3, 9)]);
    expect(map.seasons[0].average).toBeCloseTo(8.5, 5);
  });

  it("leaves a wholly unrated season with no average rather than zero", () => {
    expect(buildRatingMap(flat(1, 3, null)).seasons[0].average).toBeNull();
  });

  it("keeps unrated episodes in place rather than dropping them", () => {
    const map = buildRatingMap([ep(1, 1, 8), ep(1, 2, null), ep(1, 3, 9)]);
    expect(map.seasons[0].cells).toHaveLength(3);
    expect(map.seasons[0].cells[1].rating).toBeNull();
    expect(map.rated).toBe(2);
  });

  it("names the best and worst episode across the whole show", () => {
    const map = buildRatingMap([ep(1, 1, 7), ep(1, 2, 9.4), ep(2, 1, 5.1)]);
    expect(map.best?.rating).toBe(9.4);
    expect(map.worst?.season).toBe(2);
  });

  it("survives a show with no ratings at all", () => {
    const map = buildRatingMap(flat(1, 3, null));
    expect(map.best).toBeNull();
    expect(map.rated).toBe(0);
  });
});

describe("initialSeasonIndex", () => {
  it("opens on the season you last watched", () => {
    const eps = [
      ...flat(1, 3, 8),
      ep(2, 1, 8, "2026-08-01T20:00:00Z"),
      ...flat(3, 3, 8),
    ];
    expect(initialSeasonIndex(buildRatingMap(eps), eps)).toBe(1);
  });

  it("falls back to the last season when nothing is watched", () => {
    // Opening on season 1 of a show you have never touched is as good a guess
    // as any, but the newest season is the one people are talking about.
    const eps = [...flat(1, 3, 8), ...flat(2, 3, 8), ...flat(3, 3, 8)];
    expect(initialSeasonIndex(buildRatingMap(eps), eps)).toBe(2);
  });

  it("ignores a watched season that has no ratings row", () => {
    const eps = [...flat(1, 3, 8)];
    expect(initialSeasonIndex(buildRatingMap(eps), eps)).toBe(0);
  });
});
