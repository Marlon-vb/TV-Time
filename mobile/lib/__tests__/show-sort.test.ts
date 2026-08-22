import { describe, expect, it } from "vitest";
import { filterShows, sortShows } from "../show-sort";
import type { ShowWithProgress } from "../types";

function show(overrides: Partial<ShowWithProgress>): ShowWithProgress {
  return {
    id: 1,
    name: "Show",
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
    followed_at: "2026-01-01T00:00:00Z",
    archived: 0,
    last_synced_at: null,
    rating: null,
    review: null,
    favorited_at: null,
    favorite_rank: null,
    episode_count: 0,
    watched_count: 0,
    aired_unwatched: 0,
    total_episodes: 0,
    next_airstamp: null,
    last_aired: null,
    category: "watching",
    ...overrides,
  };
}

describe("filterShows", () => {
  it("matches names case-insensitively", () => {
    const shows = [show({ id: 1, name: "Severance" }), show({ id: 2, name: "The Bear" })];
    expect(filterShows(shows, "bear").map((s) => s.id)).toEqual([2]);
    expect(filterShows(shows, "  ").map((s) => s.id)).toEqual([1, 2]);
  });
});

describe("sortShows", () => {
  const shows = [
    show({ id: 1, name: "Bravo", aired_unwatched: 2, last_aired: "2026-01-10", followed_at: "2026-01-05" }),
    show({ id: 2, name: "alpha", aired_unwatched: 9, last_aired: "2026-03-01", followed_at: "2026-02-01" }),
    show({ id: 3, name: "Charlie", aired_unwatched: 0, last_aired: "2026-02-15", followed_at: "2026-01-20" }),
  ];

  it("sorts A–Z case-insensitively", () => {
    expect(sortShows(shows, "az").map((s) => s.id)).toEqual([2, 1, 3]);
  });
  it("sorts by most behind", () => {
    expect(sortShows(shows, "behind").map((s) => s.id)).toEqual([2, 1, 3]);
  });
  it("sorts by most recently aired", () => {
    expect(sortShows(shows, "aired").map((s) => s.id)).toEqual([2, 3, 1]);
  });
  it("sorts by most recently added", () => {
    expect(sortShows(shows, "added").map((s) => s.id)).toEqual([2, 3, 1]);
  });
  it("does not mutate the input", () => {
    const input = [...shows];
    sortShows(input, "behind");
    expect(input.map((s) => s.id)).toEqual([1, 2, 3]);
  });
});
