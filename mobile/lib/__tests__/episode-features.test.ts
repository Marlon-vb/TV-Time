import { describe, expect, it } from "vitest";
import { findNeighbors } from "../episodeNav";
import { episodeShareMessage, showShareMessage } from "../share";

describe("findNeighbors", () => {
  const eps = [
    { id: 10, season: 1, number: 1 },
    { id: 11, season: 1, number: 2 },
    { id: 20, season: 2, number: 1 },
  ];

  it("walks broadcast order across season boundaries", () => {
    const mid = findNeighbors(eps, 11);
    expect(mid.prev?.id).toBe(10);
    expect(mid.next?.id).toBe(20);
  });

  it("returns null at the edges and for unknown ids", () => {
    expect(findNeighbors(eps, 10).prev).toBeNull();
    expect(findNeighbors(eps, 20).next).toBeNull();
    expect(findNeighbors(eps, 999)).toEqual({ prev: null, next: null });
  });

  it("does not rely on input ordering", () => {
    const shuffled = [eps[2], eps[0], eps[1]];
    expect(findNeighbors(shuffled, 11).next?.id).toBe(20);
  });
});

describe("share messages", () => {
  it("formats a watched episode with a star rating", () => {
    expect(
      episodeShareMessage({
        showName: "Midnight Signal",
        season: 3,
        number: 5,
        episodeName: "The Silent Wire",
        rating: 4.5,
        watched: true,
      })
    ).toBe("Just watched Midnight Signal S03E05 — “The Silent Wire” · rated ★★★★½");
  });

  it("formats an unwatched episode as up-next", () => {
    expect(
      episodeShareMessage({
        showName: "Deadline",
        season: 1,
        number: 1,
        episodeName: null,
        watched: false,
      })
    ).toBe("Up next for me: Deadline S01E01");
  });

  it("formats show progress states", () => {
    expect(
      showShareMessage({ showName: "Glasshouse", watched: 0, total: 8 })
    ).toContain("started following");
    expect(
      showShareMessage({ showName: "Paper Crowns", watched: 3, total: 24 })
    ).toBe("I'm 3/24 episodes into Paper Crowns 📺");
    expect(
      showShareMessage({ showName: "The Long Static", watched: 16, total: 16 })
    ).toContain("Finished");
  });
});
