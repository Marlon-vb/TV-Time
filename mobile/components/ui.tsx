import { useEffect, useRef } from "react";
import { Animated, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { accentGradient, colors, fonts, radius } from "@/lib/theme";

/** Gradient progress bar that animates to its value on mount and change. */
export function ProgressBar({
  value,
  max,
  height = 5,
}: {
  value: number;
  max: number;
  height?: number;
}) {
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: pct,
      duration: 500,
      useNativeDriver: false, // animating width
    }).start();
  }, [pct, anim]);

  return (
    <View
      style={{
        height,
        borderRadius: height / 2,
        backgroundColor: colors.overlay,
        overflow: "hidden",
      }}
    >
      <Animated.View
        style={{
          width: anim.interpolate({
            inputRange: [0, 1],
            outputRange: ["0%", "100%"],
          }),
          height: "100%",
        }}
      >
        <LinearGradient
          colors={accentGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ flex: 1, borderRadius: height / 2 }}
        />
      </Animated.View>
    </View>
  );
}

export function EmptyState({
  title,
  body,
  icon = "tv-outline",
}: {
  title: string;
  body: string;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View
      style={{
        borderRadius: radius.lg,
        paddingVertical: 48,
        paddingHorizontal: 28,
        alignItems: "center",
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.line,
      }}
    >
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.raised,
          borderWidth: 1,
          borderColor: colors.lineStrong,
          marginBottom: 16,
        }}
      >
        <Ionicons name={icon} size={28} color={colors.accent} />
      </View>
      <Text
        style={{
          color: colors.fg,
          fontSize: 17,
          fontFamily: fonts.display,
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          color: colors.muted,
          fontSize: 13,
          marginTop: 8,
          textAlign: "center",
          lineHeight: 20,
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

/** Card base style shared across screens. */
export const card = {
  backgroundColor: colors.surface,
  borderRadius: radius.lg,
  borderWidth: 1,
  borderColor: colors.line,
} as const;

/** Uppercase spaced section label ("COMMUNITY", "SYNOPSIS", …). */
export const sectionLabel = {
  color: colors.muted,
  fontSize: 11,
  fontFamily: fonts.displayMedium,
  letterSpacing: 1.2,
} as const;
