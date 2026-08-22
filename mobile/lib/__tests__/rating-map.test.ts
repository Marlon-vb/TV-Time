import { describe, expect, it } from "vitest";
import {
  buildRatingMap,
  hasEnoughRatings,
  MIN_RANGE,
} from "../rating-map";
import type { EpisodeRow } from "../types";

function ep(
  season: number,
  number: number,
  community_rating: number | null
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
    watched_at: null,
    rating: null,
    community_rating,
    plays: 0,
  };
}

/** A season of `n` episodes all at the same rating. */
const flat = (season: number, n: number, r: number | null) =>
  Array.from({ length: n }, (_, i) => ep(season, i + 1, r));

describe("hasEnoughRatings", () => {
  it("accepts a well-covered show", () => {
    expect(hasEnoughRatings(flat(1, 10, 8))).toBe(true);
  });

  it("rejects a show with too few rated episodes", () => {
    expect(hasEnoughRatings(flat(1, 7, 8))).toBe(false);
  });

  it("rejects a sparsely rated show", () => {
    // 8 rated out of 40 clears the count floor but is a scattering of dots,
    // not a map.
    expect(hasEnoughRatings([...flat(1, 8, 8), ...flat(2, 32, null)])).toBe(
      false
    );
  });

  it("rejects a show with no episodes at all", () => {
    expect(hasEnoughRatings([])).toBe(false);
  });
});

describe("buildRatingMap", () => {
  it("groups by season and orders both ways", () => {
    const map = buildRatingMap([ep(2, 2, 8), ep(1, 2, 7), ep(2, 1, 9), ep(1, 1, 6)]);
    expect(map.seasons.map((s) => s.season)).toEqual([1, 2]);
    expect(map.seasons[0].cells.map((c) => c.number)).toEqual([1, 2]);
    expect(map.widest).toBe(2);
  });

  it("scales heat to the show's own range, not to 0-10", () => {
    // A show running 7.4 to 9.1 never touches either end of the absolute
    // scale; against 0-10 the whole grid would be one flat colour.
    const map = buildRatingMap([ep(1, 1, 7.4), ep(1, 2, 8.25), ep(1, 3, 9.1)]);
    const [lowCell, midCell, highCell] = map.seasons[0].cells;
    expect(lowCell.heat).toBe(0);
    expect(highCell.heat).toBe(1);
    expect(midCell.heat).toBeCloseTo(0.5, 1);
  });

  it("does not stretch a near-uniform show into fake drama", () => {
    // Two episodes 0.2 apart must not render as opposite ends of the scale.
    const map = buildRatingMap([ep(1, 1, 8.0), ep(1, 2, 8.2)]);
    const [a, b] = map.seasons[0].cells;
    expect(a.heat).toBe(0);
    expect(b.heat).toBeCloseTo(0.2 / MIN_RANGE, 5);
    expect(b.heat!).toBeLessThan(0.25);
  });

  it("names the best and worst episode", () => {
    const map = buildRatingMap([ep(1, 1, 7), ep(1, 2, 9.4), ep(2, 1, 5.1)]);
    expect(map.best?.rating).toBe(9.4);
    expect(map.best?.season).toBe(1);
    expect(map.worst?.rating).toBe(5.1);
    expect(map.worst?.season).toBe(2);
  });

  it("keeps unrated episodes as holes rather than dropping them", () => {
    // The grid has to stay aligned to episode numbers, or S02E05 lands under
    // S01E04 and the map lies about which episode is which.
    const map = buildRatingMap([ep(1, 1, 8), ep(1, 2, null), ep(1, 3, 9)]);
    expect(map.seasons[0].cells).toHaveLength(3);
    expect(map.seasons[0].cells[1].heat).toBeNull();
    expect(map.rated).toBe(2);
  });

  it("survives a show with no ratings at all", () => {
    const map = buildRatingMap(flat(1, 3, null));
    expect(map.best).toBeNull();
    expect(map.worst).toBeNull();
    expect(map.rated).toBe(0);
  });
});
