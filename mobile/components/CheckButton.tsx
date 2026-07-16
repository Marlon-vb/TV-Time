import { useRef } from "react";
import { Animated, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { accentGradient, colors } from "@/lib/theme";

/**
 * The mark-watched control: a circle that pops with a spring and a light
 * haptic tap when toggled; filled with the accent gradient once watched.
 */
export default function CheckButton({
  checked,
  onToggle,
  size = 44,
  disabled = false,
}: {
  checked: boolean;
  onToggle: (next: boolean) => void;
  size?: number;
  disabled?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const press = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.sequence([
      Animated.spring(scale, {
        toValue: 1.25,
        useNativeDriver: true,
        speed: 50,
        bounciness: 12,
      }),
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        speed: 40,
        bounciness: 8,
      }),
    ]).start();
    onToggle(!checked);
  };

  return (
    <Pressable
      onPress={press}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={checked ? "Watched" : "Mark as watched"}
    >
      <Animated.View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          transform: [{ scale }],
          opacity: disabled ? 0.35 : 1,
        }}
      >
        {checked ? (
          <LinearGradient
            colors={accentGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              flex: 1,
              borderRadius: size / 2,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="checkmark-sharp" size={size * 0.5} color={colors.ink} />
          </LinearGradient>
        ) : (
          <Animated.View
            style={{
              flex: 1,
              borderRadius: size / 2,
              borderWidth: 1.5,
              borderColor: colors.lineStrong,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {/* Deliberately near-invisible: a hint of where the mark will
                land, not a mark — colors.faint got brightened for text and
                would read as "already watched" here. */}
            <Ionicons
              name="checkmark-sharp"
              size={size * 0.5}
              color={colors.lineStrong}
            />
          </Animated.View>
        )}
      </Animated.View>
    </Pressable>
  );
}
