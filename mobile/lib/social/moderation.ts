import { Alert } from "react-native";
import * as api from "./api";

/**
 * The report/block flows shared by every surface (comment rows, profile
 * pages) so the App-Store-mandated moderation copy and behavior can't drift
 * between screens.
 */

/** File a report and tell the user how it went. */
export async function reportWithFeedback(input: {
  commentId?: string;
  userId?: string;
}): Promise<void> {
  const ok = await api.reportContent(input);
  Alert.alert(
    ok ? "Reported" : "Couldn't report",
    ok
      ? "Thanks — we'll review it."
      : "Check your connection and try again."
  );
}

/** Confirm-and-block; runs `onDone` after the block lands. */
export function confirmBlock(
  name: string,
  userId: string,
  onDone?: () => void | Promise<void>
): void {
  Alert.alert(
    `Block ${name}?`,
    "You won't see their comments or activity, and you'll stop following each other.",
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Block",
        style: "destructive",
        onPress: async () => {
          try {
            await api.blockUser(userId);
            await onDone?.();
          } catch {
            Alert.alert("Couldn't block", "Please try again.");
          }
        },
      },
    ]
  );
}
