/**
 * Which upcoming episodes get a locally-scheduled notification.
 * Pure so it's unit-testable: soonest first, future-only, capped at the
 * iOS pending-notification budget.
 */
export function pickUpcomingForScheduling<
  T extends { airstamp: string | null },
>(episodes: T[], now: Date, limit = 60): T[] {
  const nowIso = now.toISOString();
  return episodes
    .filter((e) => e.airstamp && e.airstamp > nowIso)
    .sort((a, b) => a.airstamp!.localeCompare(b.airstamp!))
    .slice(0, limit);
}
