import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/lib/theme";

/**
 * What sits in place of spoiler-y content until the episode is watched. Used by
 * both the comment thread and the best-character vote, so the two read as one
 * behaviour rather than two coincidences.
 */
export default function SpoilerNotice({
  message,
  onReveal,
}: {
  message: string;
  /** Omit to render the notice with no way past it (nothing to reveal yet). */
  onReveal?: () => void;
}) {
  return (
    <View style={{ alignItems: "center", gap: 10, paddingVertical: 10 }}>
      <Ionicons name="eye-off-outline" size={24} color={colors.faint} />
      <Text
        style={{
          color: colors.muted,
          fontSize: 13,
          textAlign: "center",
          lineHeight: 19,
        }}
      >
        {message}
      </Text>
      {onReveal && (
        <Pressable
          onPress={onReveal}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Show anyway, which may contain spoilers"
        >
          <Text
            style={{ color: colors.accent, fontSize: 13, fontWeight: "700" }}
          >
            Show it anyway
          </Text>
        </Pressable>
      )}
    </View>
  );
}
