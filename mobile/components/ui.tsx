import { Text, View } from "react-native";
import { colors } from "@/lib/theme";

export function ProgressBar({
  value,
  max,
  height = 5,
}: {
  value: number;
  max: number;
  height?: number;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <View
      style={{
        height,
        borderRadius: height / 2,
        backgroundColor: colors.overlay,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          width: `${pct}%`,
          height: "100%",
          borderRadius: height / 2,
          backgroundColor: colors.accent,
        }}
      />
    </View>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: colors.line,
        borderStyle: "dashed",
        borderRadius: 14,
        paddingVertical: 44,
        paddingHorizontal: 24,
        alignItems: "center",
        backgroundColor: colors.surface,
      }}
    >
      <Text style={{ color: colors.fg, fontSize: 17, fontWeight: "700" }}>
        {title}
      </Text>
      <Text
        style={{
          color: colors.muted,
          fontSize: 13,
          marginTop: 6,
          textAlign: "center",
          lineHeight: 19,
        }}
      >
        {body}
      </Text>
    </View>
  );
}

export const CATEGORY_LABELS: Record<string, string> = {
  watching: "Watching",
  up_to_date: "Up to date",
  not_started: "Not started",
  finished: "Finished",
  archived: "Archived",
};
