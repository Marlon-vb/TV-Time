import { describe, expect, it } from "vitest";
import {
  MIN_ROWS,
  MIN_WATCHERS,
  trendingEpisodeRows,
  trendingRows,
  watchersLine,
} from "../trending-core";
import type { TrendingEpisode, TrendingShow } from "../social/api";

const show = (show_id: number, watchers: number, episodes = 1): TrendingShow => ({
  show_id,
  watchers,
  episodes,
  show_name: `Show ${show_id}`,
  poster_url: "p.jpg",
});

const ep = (
  show_id: number,
  season: number,
  episode: number,
  watchers: number
): TrendingEpisode => ({
  show_id,
  season,
  episode,
  watchers,
  show_name: `Show ${show_id}`,
  episode_name: "E",
  poster_url: "p.jpg",
});

describe("trendingRows", () => {
  it("drops anything under the watcher bar", () => {
    const rows = [show(1, 9), show(2, 5), show(3, 4), show(4, 3), show(5, 2)];
    expect(trendingRows(rows).map((r) => r.show_id)).toEqual([1, 2, 3, 4]);
  });

  it("hides the whole rail rather than show a thin one", () => {
    // Three qualifying shows is a real signal and still not a rail.
    const rows = [show(1, 9), show(2, 5), show(3, 4), show(4, 1)];
    expect(rows.filter((r) => r.watchers >= MIN_WATCHERS)).toHaveLength(3);
    expect(trendingRows(rows)).toEqual([]);
  });

  it("hides the rail on a brand-new backend with no history at all", () => {
    expect(trendingRows([])).toEqual([]);
  });

  it("respects the limit", () => {
    const rows = Array.from({ length: 30 }, (_, i) => show(i + 1, 10));
    expect(trendingRows(rows, 5)).toHaveLength(5);
  });
});

describe("trendingEpisodeRows", () => {
  it("keeps one episode per show, the biggest", () => {
    // A show mid-season puts its whole run in the window; without the
    // per-show cap the list is one series and nothing else.
    const rows = [
      ep(1, 3, 8, 40),
      ep(1, 3, 7, 38),
      ep(1, 3, 6, 35),
      ep(2, 1, 1, 30),
      ep(3, 2, 4, 12),
      ep(4, 1, 9, 5),
    ];
    expect(trendingEpisodeRows(rows).map((r) => [r.show_id, r.episode])).toEqual([
      [1, 8],
      [2, 1],
      [3, 4],
      [4, 9],
    ]);
  });

  it("applies the same bar and the same all-or-nothing rule", () => {
    expect(trendingEpisodeRows([ep(1, 1, 1, 99), ep(2, 1, 1, 1)])).toEqual([]);
  });

  it("counts qualifying rows, not deduped ones, when deciding to show", () => {
    // Four rows clear the bar, so the rail shows — even though they collapse
    // to two entries once one-per-show is applied.
    const rows = [ep(1, 1, 1, 9), ep(1, 1, 2, 8), ep(2, 1, 1, 7), ep(2, 1, 2, 6)];
    expect(trendingEpisodeRows(rows)).toHaveLength(2);
  });
});

describe("watchersLine", () => {
  it("groups thousands so a real number stays readable", () => {
    expect(watchersLine(1)).toBe("1 watching");
    expect(watchersLine(4120)).toBe("4,120 watching");
  });
});

describe("thresholds", () => {
  it("are stated, not scattered", () => {
    expect(MIN_WATCHERS).toBeGreaterThan(1);
    expect(MIN_ROWS).toBeGreaterThan(1);
  });
});
