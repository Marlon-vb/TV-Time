import { Platform } from "react-native";
import { ExtensionStorage } from "@bacons/apple-targets";
import { watchNext } from "./repo";
import { buildWidgetPayload } from "./widget-data";
import type { WatchNextItem } from "./types";

/**
 * Bridge between the app's Up Next list and the iOS home-screen widget.
 *
 * The widget runs in its own process and can't read our SQLite DB, so we mirror
 * a tiny JSON snapshot into a shared App Group container; the WidgetKit target
 * reads it from UserDefaults. `ExtensionStorage` stubs to a no-op whenever the
 * native module is absent (Expo Go, Android, `expo export`), so this is always
 * safe to call.
 */

// Must match the App Group in app.json and targets/upnext/expo-target.config.js.
export const APP_GROUP = "group.app.tvtime.personal";
const KEY = "upNext";

const storage = new ExtensionStorage(APP_GROUP);

/** Push the current Up Next backlog to the widget and reload its timeline. */
export function syncUpNextWidget(
  items?: WatchNextItem[],
  now: Date = new Date()
): void {
  if (Platform.OS !== "ios") return;
  try {
    const list = items ?? watchNext();
    storage.set(KEY, JSON.stringify(buildWidgetPayload(list, now)));
    ExtensionStorage.reloadWidget();
  } catch {
    // The widget is best-effort; never let it break the app.
  }
}
