import { getSetting, setSetting } from "./db";

/**
 * Comments on an episode are the most reliable way to get spoiled, so they
 * stay hidden until you've marked the episode watched. This preference is the
 * escape hatch for people who don't mind, and it lives on the device — it's a
 * reading preference, not something worth syncing.
 */
const KEY = "always_show_comments";

export function alwaysShowComments(): boolean {
  return getSetting(KEY) === "1";
}

export function setAlwaysShowComments(on: boolean): void {
  setSetting(KEY, on ? "1" : "0");
}
