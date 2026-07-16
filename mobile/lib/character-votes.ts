import type { CharacterVoteTally } from "./social/types";

/** A character you can cast a vote for (subset of TVmaze cast). */
export interface VoteTarget {
  characterId: number;
  characterName: string;
}

/**
 * Move a vote from `from` (the character id previously voted, or null) to `to`
 * (the newly chosen character, or null to clear) and return a re-sorted tally.
 * Pure so the episode UI can react optimistically before the server confirms.
 */
export function adjustTally(
  tally: CharacterVoteTally[],
  from: number | null,
  to: VoteTarget | null
): CharacterVoteTally[] {
  let next = tally.map((t) => ({ ...t }));
  if (from != null) {
    next = next
      .map((t) => (t.character_id === from ? { ...t, votes: t.votes - 1 } : t))
      .filter((t) => t.votes > 0);
  }
  if (to) {
    const existing = next.find((t) => t.character_id === to.characterId);
    if (existing) existing.votes += 1;
    else
      next.push({
        character_id: to.characterId,
        character_name: to.characterName,
        votes: 1,
      });
  }
  return next.sort((a, b) => b.votes - a.votes);
}
