import * as Notifications from "expo-notifications";
import { epCode } from "./format";
import * as repo from "./repo";
import { getSetting, setSetting } from "./db";
import { disableRemoteEpisodeAlerts, syncEpisodeAlerts } from "./episode-alerts";

/**
 * "New episode is out" alerts.
 *
 * Signed in, with a push token registered: the server sends them. Air dates
 * are checked when the episode actually airs, there is no 64-notification
 * cap, and the push arrives even if the app has not been opened. The show
 * list is the same one the calendar uses.
 *
 * Signed out, or whenever that upload fails: fall back to scheduling on the
 * device. iOS caps pending notifications at 64, so only the nearest ~60 are
 * queued and the set refreshes on every app open and background sync.
 */

const MAX_SCHEDULED = 60;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export function notificationsEnabled(): boolean {
  return getSetting("notifications_enabled") === "1";
}

export async function setNotificationsEnabled(on: boolean): Promise<boolean> {
  if (!on) {
    setSetting("notifications_enabled", "0");
    await Notifications.cancelAllScheduledNotificationsAsync();
    await disableRemoteEpisodeAlerts().catch(() => {});
    return true;
  }
  // Asked here, from the Settings switch. Never at first launch.
  const perms = await Notifications.requestPermissionsAsync();
  if (!perms.granted) return false;
  setSetting("notifications_enabled", "1");
  await rescheduleAll();
  return true;
}

import { pickUpcomingForScheduling } from "./schedulePick";
export { pickUpcomingForScheduling };

/** Drop and re-create the scheduled set from the current library. */
export async function rescheduleAll(): Promise<number> {
  if (!notificationsEnabled()) {
    await Notifications.cancelAllScheduledNotificationsAsync();
    await disableRemoteEpisodeAlerts().catch(() => {});
    return 0;
  }

  // Prefer the server. Only cancel the on-device queue once that upload
  // stuck, so a missing table or a signed-out phone still gets alerts.
  const remote = await syncEpisodeAlerts().catch(() => false);
  if (remote) {
    await Notifications.cancelAllScheduledNotificationsAsync();
    return 0;
  }

  await Notifications.cancelAllScheduledNotificationsAsync();

  const items = repo.upcoming(180);
  // Shows you're actively watching win the limited notification budget over
  // ones you follow but haven't started (or have finished).
  const activeShowIds = new Set(
    repo
      .listShowsWithProgress()
      .filter((s) => s.watched_count > 0 && s.category !== "finished")
      .map((s) => s.id)
  );
  const picked = pickUpcomingForScheduling(
    items.map((i) => ({
      ...i,
      airstamp: i.episode.airstamp,
      priority: activeShowIds.has(i.show.id) ? 0 : 1,
    })),
    new Date(),
    MAX_SCHEDULED
  );

  for (const { show, episode } of picked) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: show.name,
        body: `${epCode(episode.season, episode.number)} · ${episode.name || "New episode"} is out now`,
        data: { url: `/show/${show.id}` },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(episode.airstamp!),
      },
    });
  }
  return picked.length;
}

/** Fire a test notification a few seconds out so the user sees the shape. */
export async function sendTestNotification(): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "TV App",
      body: "Test notification — new episodes will show up like this.",
      data: { url: "/upcoming" },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 3,
    },
  });
}
