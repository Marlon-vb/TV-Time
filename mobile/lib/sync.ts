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

export async function syncAndReschedule(): Promise<{
  synced: number;
  failed: number;
}> {
  const result = await repo.syncStaleShows();
  await rescheduleAll();
  syncUpNextWidget();
  return result;
}

TaskManager.defineTask(TASK_NAME, async () => {
  try {
    await syncAndReschedule();
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
