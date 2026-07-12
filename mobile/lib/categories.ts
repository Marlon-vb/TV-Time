import type { ShowCategory } from "./types";

/**
 * TV Time's show buckets:
 *  - watching:    started or behind — there are aired episodes left to watch
 *  - up_to_date:  seen every aired episode, show still going (or on break)
 *  - finished:    seen every episode of an ended show
 *  - not_started: followed but nothing watched yet
 *  - archived:    manually tucked away
 */
export function computeCategory(input: {
  archived: boolean;
  watchedCount: number;
  airedUnwatched: number;
  status: string;
}): ShowCategory {
  if (input.archived) return "archived";
  if (input.watchedCount === 0 && input.airedUnwatched > 0)
    return "not_started";
  if (input.airedUnwatched > 0) return "watching";
  // Everything aired has been watched (or nothing has aired yet).
  if (input.status === "Ended" && input.watchedCount > 0) return "finished";
  return "up_to_date";
}
