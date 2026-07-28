import { getSetting, setSetting } from "@/lib/db";

/**
 * Versioned on purpose. Bumping the number re-shows the intro to everyone,
 * which is the only sane way to introduce a later revision of it — an
 * unversioned flag would silently hide it from every existing install.
 */
const KEY = "onboarded_v1";

export function hasOnboarded(): boolean {
  return getSetting(KEY) === "1";
}

export function markOnboarded(): void {
  setSetting(KEY, "1");
}

/**
 * The intro is rendered by the root layout in place of the navigator, so
 * Settings can't just flip the flag and expect anything to happen — the layout
 * has to be told. One listener, set up by that layout.
 */
const listeners = new Set<() => void>();

export function subscribeOnboarding(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Settings → "Show the intro again". Unmounts the navigator, by design. */
export function replayOnboarding(): void {
  setSetting(KEY, "0");
  for (const fn of listeners) fn();
}
