/**
 * Which upcoming episodes get a locally-scheduled notification.
 * Pure so it's unit-testable: future-only, lower `priority` first (so shows
 * you're actively watching win the limited slots), then soonest, capped at the
 * iOS pending-notification budget.
 */
export function pickUpcomingForScheduling<
  T extends { airstamp: string | null; priority?: number },
>(episodes: T[], now: Date, limit = 60): T[] {
  const nowIso = now.toISOString();
  return episodes
    .filter((e) => e.airstamp && e.airstamp > nowIso)
    .sort(
      (a, b) =>
        (a.priority ?? 0) - (b.priority ?? 0) ||
        a.airstamp!.localeCompare(b.airstamp!)
    )
    .slice(0, limit);
}
