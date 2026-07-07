/**
 * Background loop, started once per server process from instrumentation.ts.
 * Each tick refreshes stale shows from the provider (so air dates stay
 * current) and then sends "new episode" pushes for anything that just aired.
 */

declare global {
  // eslint-disable-next-line no-var
  var __tvtime_scheduler: NodeJS.Timeout | undefined;
}

export function startScheduler(): void {
  if (globalThis.__tvtime_scheduler) return;

  const minutes = Number(process.env.PUSH_CHECK_MINUTES) || 5;
  const tick = async () => {
    try {
      const repo = await import("./repo");
      await repo.syncStaleShows(); // no-op for anything refreshed recently
      const notifier = await import("./notifier");
      await notifier.checkAndNotify();
    } catch (err) {
      console.error("[tvtime] scheduler tick failed:", (err as Error).message);
    }
  };

  globalThis.__tvtime_scheduler = setInterval(() => void tick(), minutes * 60_000);
  globalThis.__tvtime_scheduler.unref?.();
  console.log(
    `[tvtime] episode notification scheduler running (every ${minutes} min)`
  );
}
