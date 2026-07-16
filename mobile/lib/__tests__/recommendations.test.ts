import { describe, expect, it } from "vitest";
import {
  buildTasteProfile,
  genreAffinity,
  pickReason,
  rankCandidates,
  type CandidateShow,
} from "../recommend-core";
import type { RemoteShow } from "../types";

function show(overrides: Partial<RemoteShow> & { id: number }): RemoteShow {
  return {
    name: `Show ${overrides.id}`,
    tvdbId: null,
    imdbId: null,
    posterUrl: "https://img.example/p.jpg",
    backdropUrl: null,
    status: "Running",
    network: null,
    runtime: 45,
    premiered: null,
    genres: [],
    summary: null,
    ...overrides,
  };
}

function candidate(
  id: number,
  overrides: Partial<CandidateShow> = {}
): CandidateShow {
  return {
    show: show({ id, ...(overrides.show ?? {}) }),
    weight: 50,
    actors: [],
    creators: [],
    watchers: 0,
    ...overrides,
  };
}

const profile = buildTasteProfile([
  { genre: "Drama", minutes: 1000 },
  { genre: "Anime", minutes: 500 },
]);

describe("buildTasteProfile / genreAffinity", () => {
  it("normalizes genre weights against the top genre", () => {
    expect(profile.get("Drama")).toBe(1);
    expect(profile.get("Anime")).toBe(0.5);
    expect(genreAffinity(["Drama", "Anime"], profile)).toBe(1.5);
    expect(genreAffinity(["Romance"], profile)).toBe(0);
  });
});

describe("rankCandidates", () => {
  it("ranks community > creators > actors and excludes followed/posterless", () => {
    const candidates = [
      candidate(1, { actors: ["A"] }),
      candidate(2, { creators: ["C"] }),
      candidate(3, { watchers: 3 }),
      candidate(4, { actors: ["A", "B"], show: show({ id: 4, posterUrl: null }) }),
      candidate(5, { actors: ["A", "B", "C", "D"] }), // capped at 3
    ];
    const recs = rankCandidates(candidates, profile, new Set([2]));
    const ids = recs.map((r) => r.showId);
    expect(ids).not.toContain(2); // excluded (followed)
    expect(ids).not.toContain(4); // no poster
    expect(ids[0]).toBe(3); // 3 watchers → +6 beats everything else
    expect(ids[1]).toBe(5); // 3 capped actors → +3
  });

  it("uses genre affinity and popularity as tiebreaks", () => {
    const candidates = [
      candidate(1, { actors: ["A"], show: show({ id: 1, genres: ["Drama"] }) }),
      candidate(2, { actors: ["A"] }),
      candidate(3, { actors: ["A"], weight: 99 }),
    ];
    const ids = rankCandidates(candidates, profile, new Set()).map(
      (r) => r.showId
    );
    expect(ids).toEqual([1, 3, 2]); // genre match (+1) > weight tiebreak
  });

  it("caps the list at the limit", () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      candidate(i + 1, { actors: ["A"] })
    );
    expect(rankCandidates(many, profile, new Set(), 12)).toHaveLength(12);
  });
});

describe("pickReason", () => {
  it("prefers community, then actor, then creator, then genre", () => {
    expect(pickReason(candidate(1, { watchers: 2, actors: ["A"] }), profile)).toBe(
      "Watched by people with your taste"
    );
    expect(
      pickReason(candidate(1, { actors: ["Cillian Murphy"] }), profile)
    ).toBe("With Cillian Murphy");
    expect(
      pickReason(candidate(1, { creators: ["Vince Gilligan"] }), profile)
    ).toBe("From Vince Gilligan");
    expect(
      pickReason(
        candidate(1, { show: show({ id: 1, genres: ["Anime", "Drama"] }) }),
        profile
      )
    ).toBe("Because you watch Drama");
    expect(pickReason(candidate(1), profile)).toBeNull();
  });
});
