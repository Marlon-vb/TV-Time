import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import * as repo from "./repo";
import { rescheduleAll } from "./notifications";
import { syncUpNextWidget } from "./widget";

/**
 * Keeping air dates fresh: a full pass refreshes stale shows from TVmaze and
 * rebuilds the scheduled-notification set. Runs on app launch and — where iOS
 * allows — periodically in the background.
 */

const TASK_NAME = "tvtime-background-sync";

export async function syncAndReschedule(opts?: {
  limit?: number;
}): Promise<{ synced: number; failed: number }> {
  const result = await repo.syncStaleShows(12, {
    concurrency: 4,
    limit: opts?.limit,
  });
  // Starred shows missing wide art, a few per pass. Separate from the sweep
  // above because that one is bounded by staleness and this one by a hole in
  // the data — a show synced an hour ago can still have no backdrop.
  await repo.backfillFavoriteArtwork().catch(() => 0);
  await rescheduleAll();
  syncUpNextWidget();
  return result;
}

TaskManager.defineTask(TASK_NAME, async () => {
  try {
    // iOS gives background tasks ~30s — cap the pass so it finishes inside
    // the budget instead of being killed mid-sync and reported Failed.
    await syncAndReschedule({ limit: 25 });
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerBackgroundSync(): Promise<void> {
  try {
    await BackgroundTask.registerTaskAsync(TASK_NAME, {
      minimumInterval: 60 * 12, // minutes — iOS treats this as a hint
    });
  } catch {
    // Background tasks aren't available in Expo Go — launch-time sync
    // still keeps everything fresh.
  }
}
