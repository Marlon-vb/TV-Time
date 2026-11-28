import { getSetting } from "./db";
import * as repo from "./repo";
import { registerPushTokenIfAllowed } from "./social/api";
import { supabase } from "./supabase";

/**
 * Signed-in episode alerts.
 *
 * The phone uploads the shows the calendar already uses (followed, not
 * archived). The server refreshes air dates from TVmaze and sends one push
 * per episode. This returns false when that upload did not stick, so the
 * caller keeps scheduling notifications on the device instead.
 */

const CHUNK = 200;

async function userId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user.id ?? null;
  } catch {
    return null;
  }
}

/** Turn the server copy off and drop the show list. No-op when signed out. */
export async function disableRemoteEpisodeAlerts(): Promise<void> {
  const id = await userId();
  if (!id) return;
  await supabase.from("notification_prefs").upsert({
    user_id: id,
    episode_alerts: false,
  });
  await supabase.from("tracked_shows").delete().eq("user_id", id);
}

/**
 * True only when the preference, the show list, and a push token all landed.
 * Anything short of that leaves delivery on the device.
 */
export async function syncEpisodeAlerts(): Promise<boolean> {
  if (getSetting("notifications_enabled") !== "1") return false;
  const id = await userId();
  if (!id) return false;

  const tokenOk = await registerPushTokenIfAllowed();
  if (!tokenOk) return false;

  const shows = repo.listAlertShows();
  for (let i = 0; i < shows.length; i += CHUNK) {
    const chunk = shows.slice(i, i + CHUNK).map((show) => ({
      user_id: id,
      show_id: show.id,
      name: show.name.slice(0, 300) || "Show",
      tracked_at: show.followed_at || new Date().toISOString(),
    }));
    const { error } = await supabase
      .from("tracked_shows")
      .upsert(chunk, { onConflict: "user_id,show_id" });
    if (error) return false;
  }

  const ids = shows.map((show) => show.id);
  const removal =
    ids.length === 0
      ? await supabase.from("tracked_shows").delete().eq("user_id", id)
      : await supabase
          .from("tracked_shows")
          .delete()
          .eq("user_id", id)
          .not("show_id", "in", `(${ids.join(",")})`);
  if (removal.error) return false;

  // Last, so a failed show upload cannot turn the server path on while the
  // phone is still scheduling locally. enabled_at is stamped by a trigger.
  const { error: prefError } = await supabase.from("notification_prefs").upsert({
    user_id: id,
    episode_alerts: true,
  });
  return !prefError;
}
