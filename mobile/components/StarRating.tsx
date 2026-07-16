import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { colors } from "@/lib/theme";

/**
 * ½–5 star rating control. Tapping the left or right half of a star gives half
 * or full stars; tapping your current rating again clears it. Read-only mode
 * (onChange omitted) just displays a value, e.g. for a community average.
 */
export default function StarRating({
  value,
  onChange,
  size = 34,
  readOnly = false,
}: {
  value: number | null;
  onChange?: (next: number | null) => void;
  size?: number;
  readOnly?: boolean;
}) {
  const rating = value ?? 0;
  const gap = size * 0.12;

  const pick = (starIndex: number, half: boolean) => {
    if (!onChange) return;
    const next = starIndex + (half ? 0.5 : 1);
    if (next === value) {
      onChange(null); // tap current value to clear
    } else {
      void Haptics.selectionAsync();
      onChange(next);
    }
  };

  return (
    <View style={{ flexDirection: "row", gap, alignSelf: "flex-start" }}>
      {[0, 1, 2, 3, 4].map((i) => {
        const filled = rating - i; // >=1 full, 0.5 half, <=0 empty
        const name =
          filled >= 1 ? "star" : filled >= 0.5 ? "star-half" : "star-outline";
        const star = (
          <Ionicons
            name={name}
            size={size}
            color={filled > 0 ? colors.accent : colors.overlay}
          />
        );
        if (readOnly || !onChange) return <View key={i}>{star}</View>;
        return (
          <Pressable
            key={i}
            hitSlop={2}
            onPress={(e) => pick(i, e.nativeEvent.locationX < size / 2)}
          >
            {star}
          </Pressable>
        );
      })}
    </View>
  );
}

/** "4.5" style label; returns null for no rating. */
export function ratingLabel(value: number | null): string | null {
  if (value == null) return null;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
