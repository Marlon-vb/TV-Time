import { describe, expect, it } from "vitest";
import { adjustTally } from "../character-votes";
import type { CharacterVoteTally } from "../social/types";

const tally = (
  entries: [id: number, name: string, votes: number][]
): CharacterVoteTally[] =>
  entries.map(([character_id, character_name, votes]) => ({
    character_id,
    character_name,
    votes,
  }));

describe("adjustTally", () => {
  it("adds a first-ever vote for a character", () => {
    const next = adjustTally([], null, { characterId: 7, characterName: "Rio" });
    expect(next).toEqual(tally([[7, "Rio", 1]]));
  });

  it("increments an existing character and keeps it sorted", () => {
    const start = tally([
      [1, "Alex", 3],
      [2, "Rio", 3],
    ]);
    const next = adjustTally(start, null, { characterId: 2, characterName: "Rio" });
    expect(next.map((t) => [t.character_id, t.votes])).toEqual([
      [2, 4],
      [1, 3],
    ]);
  });

  it("moves a vote from one character to another", () => {
    const start = tally([
      [1, "Alex", 2],
      [2, "Rio", 1],
    ]);
    const next = adjustTally(start, 1, { characterId: 2, characterName: "Rio" });
    expect(next.map((t) => [t.character_id, t.votes])).toEqual([
      [2, 2],
      [1, 1],
    ]);
  });

  it("drops a character that falls to zero votes when cleared", () => {
    const start = tally([
      [1, "Alex", 3],
      [2, "Rio", 1],
    ]);
    const next = adjustTally(start, 2, null);
    expect(next).toEqual(tally([[1, "Alex", 3]]));
  });

  it("does not mutate the input tally", () => {
    const start = tally([[1, "Alex", 1]]);
    adjustTally(start, 1, { characterId: 2, characterName: "Rio" });
    expect(start).toEqual(tally([[1, "Alex", 1]]));
  });
});
