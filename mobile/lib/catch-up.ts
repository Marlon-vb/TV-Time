import { Alert } from "react-native";
import * as repo from "@/lib/repo";
import { catchUpPrompt } from "@/lib/catch-up-core";

/**
 * Offer to fill in the gap after a single episode is marked watched. Marking
 * episode 6 while 2–5 sit untouched almost always means the earlier ones were
 * watched somewhere this app didn't see, not that the show is being watched out
 * of order — but it is the user's call, so ask rather than assume.
 *
 * Silent when there is no gap, which is the overwhelmingly common case: an
 * in-order watch has nothing behind it, so the prompt stays out of the normal
 * flow entirely.
 *
 * `onCatchUp` runs only if they accept, and owns both the write and whatever
 * refresh and sync the calling screen needs — those differ per screen.
 */
export function offerCatchUp(
  showId: number,
  episodeId: number,
  onCatchUp: () => void
): void {
  const count = repo.countUnwatchedBefore(showId, episodeId);
  if (count === 0) return;
  const { title, message, confirm } = catchUpPrompt(count);
  Alert.alert(title, message, [
    { text: "Just this one", style: "cancel" },
    { text: confirm, onPress: onCatchUp },
  ]);
}
