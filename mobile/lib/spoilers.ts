import { getSetting, setSetting } from "./db";

/**
 * Two things on an episode page give the episode away: the comment thread, and
 * the best-character vote (which names who is still in it). Both stay hidden
 * until you've marked the episode watched. This preference is the escape hatch
 * for people who don't mind, and it lives on the device — it's a reading
 * preference, not something worth syncing.
 */
const KEY = "always_show_spoilers";

export function alwaysShowSpoilers(): boolean {
  return getSetting(KEY) === "1";
}

export function setAlwaysShowSpoilers(on: boolean): void {
  setSetting(KEY, on ? "1" : "0");
}
