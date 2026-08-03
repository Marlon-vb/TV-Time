import { describe, expect, it } from "vitest";
import { normalizeTitle, rankByTitle, titleScore } from "../search-rank";

describe("normalizeTitle", () => {
  it("folds case, accents, curly quotes and spacing", () => {
    expect(normalizeTitle("  Amélie  ")).toBe("amelie");
    expect(normalizeTitle("The Queen’s Gambit")).toBe("queen's gambit");
    expect(normalizeTitle("Star   Wars")).toBe("star wars");
  });

  it("drops a leading article so 'The Office' and 'Office' agree", () => {
    expect(normalizeTitle("The Office")).toBe("office");
    expect(normalizeTitle("A Quiet Place")).toBe("quiet place");
    // ...but only as a whole word — this is a title, not an article.
    expect(normalizeTitle("Theodore")).toBe("theodore");
  });
});

describe("titleScore", () => {
  it("ranks exact over prefix over word-start over substring", () => {
    expect(titleScore("Oppenheimer", "oppenheimer")).toBe(4);
    expect(titleScore("Oppenheimer: The Interviews", "oppenheimer")).toBe(3);
    expect(titleScore("American Prometheus: Oppenheimer", "oppenheimer")).toBe(2);
    expect(titleScore("Oppenheimers", "oppenheimer")).toBe(1);
    expect(titleScore("Chernobyl", "oppenheimer")).toBe(0);
  });

  it("does not treat a mid-word hit as a word match", () => {
    expect(titleScore("Supernatural", "up")).toBe(1);
    expect(titleScore("Up", "up")).toBe(4);
    expect(titleScore("Up in the Air", "up")).toBe(3);
  });

  it("scores an empty query as no signal rather than a match", () => {
    expect(titleScore("Anything", "")).toBe(0);
    expect(titleScore("", "anything")).toBe(0);
  });
});

describe("rankByTitle", () => {
  const id = (s: string) => s;

  it("lifts an exact match above fuzzy hits from the other source", () => {
    // What TVmaze + iTunes actually return for "oppenheimer": a pile of
    // loosely-matching series, then the film. Ranked, the film comes first.
    const merged = ["Oppenheimer's Cut", "The Day After", "Manhattan", "Oppenheimer"];
    expect(rankByTitle(merged, "oppenheimer", id)[0]).toBe("Oppenheimer");
  });

  it("keeps incoming order within one score, preserving source ranking", () => {
    const merged = ["Fargo", "Fargo (1996)", "Fargo: Year One"];
    // "Fargo" is exact; the other two are prefix hits and keep their order.
    expect(rankByTitle(merged, "fargo", id)).toEqual([
      "Fargo",
      "Fargo (1996)",
      "Fargo: Year One",
    ]);
  });

  it("never drops a result, only reorders", () => {
    const merged = ["Alpha", "Beta", "Gamma"];
    const ranked = rankByTitle(merged, "nothing matches this", id);
    expect([...ranked].sort()).toEqual([...merged].sort());
  });

  it("leaves the list untouched for a blank query", () => {
    const merged = ["Alpha", "Beta"];
    expect(rankByTitle(merged, "   ", id)).toEqual(merged);
  });
});
