import { useState } from "react";
import { Text, View, type DimensionValue } from "react-native";
import { Image } from "expo-image";
import { colors } from "@/lib/theme";

/**
 * Poster artwork: expo-image with fade-in and disk caching, falling back
 * to generated initials on a deterministic per-show tint.
 */
export default function Poster({
  src,
  name,
  width,
  height,
  radius = 12,
}: {
  src: string | null;
  name: string;
  width: DimensionValue;
  height: DimensionValue;
  radius?: number;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    const initials = name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("");
    let hash = 0;
    for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
    const hue = Math.abs(hash) % 360;
    // Scale the initials with the poster instead of a fixed 20pt that clips
    // tiny posters and gets lost on big ones. Either dimension is enough —
    // grids often pass width="100%" with a numeric height (posters are 2:3,
    // so the short side ≈ height * 2/3).
    const shortSide =
      typeof width === "number" && typeof height === "number"
        ? Math.min(width, height)
        : typeof width === "number"
          ? width
          : typeof height === "number"
            ? (height * 2) / 3
            : null;
    const fontSize =
      shortSide != null ? Math.max(11, Math.round(shortSide * 0.3)) : 20;
    return (
      <View
        style={{
          width,
          height,
          borderRadius: radius,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: `hsl(${hue}, 32%, 20%)`,
          borderWidth: 1,
          borderColor: colors.line,
        }}
      >
        <Text
          style={{
            color: "rgba(255,255,255,0.72)",
            fontSize,
            fontWeight: "800",
          }}
        >
          {initials}
        </Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri: src }}
      onError={() => setFailed(true)}
      contentFit="cover"
      transition={220}
      cachePolicy="disk"
      style={{
        width,
        height,
        borderRadius: radius,
        backgroundColor: colors.raised,
      }}
    />
  );
}
