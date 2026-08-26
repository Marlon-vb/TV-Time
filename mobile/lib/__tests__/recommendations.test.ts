import { describe, expect, it } from "vitest";
import {
  PER_SOURCE,
  buildTasteProfile,
  genreAffinity,
  pickReason,
  pickSeeds,
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
    rating: null,
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

describe("buildTasteProfile with a recent window", () => {
  it("lets a new interest outweigh years of accumulated minutes", () => {
    // 2019 was all procedurals; this year is all anime. All-time alone would
    // bury the thing they are actually watching.
    const allTime = [
      { genre: "Crime", minutes: 40_000 },
      { genre: "Anime", minutes: 2_000 },
    ];
    const recent = [{ genre: "Anime", minutes: 3_000 }];
    const blended = buildTasteProfile(allTime, recent);
    expect(blended.get("Anime")!).toBeGreaterThan(blended.get("Crime")!);
  });

  it("falls back to all-time when nothing was watched lately", () => {
    const allTime = [
      { genre: "Drama", minutes: 1000 },
      { genre: "Anime", minutes: 500 },
    ];
    expect(buildTasteProfile(allTime, [])).toEqual(buildTasteProfile(allTime));
  });
});

describe("pickSeeds", () => {
  const s = (id: number, rating: number | null = null) => ({ id, rating });

  it("takes recent shows first, then tops up from all-time", () => {
    const recent = [s(1), s(2), s(3), s(4), s(5)];
    const allTime = [s(9), s(8), s(7), s(6)];
    expect(pickSeeds(recent, allTime).map((x) => x.id)).toEqual([
      1, 2, 3, 9, 8, 7,
    ]);
  });

  it("never seeds the same show twice", () => {
    const recent = [s(1), s(2)];
    const allTime = [s(1), s(2), s(3)];
    expect(pickSeeds(recent, allTime).map((x) => x.id)).toEqual([1, 2, 3]);
  });

  it("drops shows the user rated badly from both halves", () => {
    // Finishing something and hating it used to read as a vote in favour.
    const recent = [s(1, 1), s(2, 5)];
    const allTime = [s(3, 2), s(4, null)];
    expect(pickSeeds(recent, allTime).map((x) => x.id)).toEqual([2, 4]);
  });

  it("would rather seed from a disliked show than return nothing", () => {
    const recent = [s(1, 1)];
    expect(pickSeeds(recent, []).map((x) => x.id)).toEqual([1]);
  });

  it("is empty only when there is nothing watched at all", () => {
    expect(pickSeeds([], [])).toEqual([]);
  });
});

describe("source diversity", () => {
  it("stops one prolific actor from taking the whole rail", () => {
    const prolific = Array.from({ length: 10 }, (_, i) =>
      candidate(i + 1, { actors: ["Cillian Murphy"], weight: 90 })
    );
    const others = [
      candidate(50, { actors: ["B"] }),
      candidate(51, { creators: ["C"] }),
    ];
    // Five slots, three sources: the cap is reachable without backfilling.
    const ids = rankCandidates([...prolific, ...others], profile, new Set(), 5)
      .map((r) => r.showId);
    expect(ids.filter((id) => id <= 10)).toHaveLength(PER_SOURCE);
    expect(ids).toContain(50);
    expect(ids).toContain(51);
  });

  it("tops up past the cap rather than leave the rail short", () => {
    // Same pool, more slots than the other sources can fill. The cap orders
    // the list; it does not shrink it.
    const prolific = Array.from({ length: 10 }, (_, i) =>
      candidate(i + 1, { actors: ["Cillian Murphy"], weight: 90 })
    );
    const ids = rankCandidates(
      [...prolific, candidate(50, { actors: ["B"] })],
      profile,
      new Set(),
      8
    ).map((r) => r.showId);
    expect(ids).toHaveLength(8);
    expect(ids.slice(0, 4)).toContain(50);
  });

  it("still fills the rail when every candidate shares one source", () => {
    // A narrow library must not be punished with three posters.
    const many = Array.from({ length: 20 }, (_, i) =>
      candidate(i + 1, { actors: ["A"] })
    );
    expect(rankCandidates(many, profile, new Set(), 12)).toHaveLength(12);
  });
});
