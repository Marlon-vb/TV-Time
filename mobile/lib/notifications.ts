import * as Notifications from "expo-notifications";
import { epCode } from "./format";
import * as repo from "./repo";
import { getSetting, setSetting } from "./db";

/**
 * "New episode is out" alerts via locally-scheduled notifications: whenever
 * the library changes or a sync runs, we (re)schedule one notification per
 * upcoming episode at its exact air time. No server involved — iOS delivers
 * them even when the app is closed. iOS caps pending notifications at 64,
 * so the nearest ~60 are scheduled and the set refreshes on every app open
 * and background sync.
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
    return true;
  }
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
  if (!notificationsEnabled()) return 0;
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
    new Date()
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
