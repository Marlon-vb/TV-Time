import { useState } from "react";
import { Image, Text, View, type DimensionValue } from "react-native";
import { colors } from "@/lib/theme";

/** Poster image with a generated-initials fallback when artwork is missing. */
export default function Poster({
  src,
  name,
  width,
  height,
  radius = 10,
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
    return (
      <View
        style={{
          width,
          height,
          borderRadius: radius,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: `hsl(${hue}, 35%, 22%)`,
        }}
      >
        <Text
          style={{
            color: "rgba(255,255,255,0.7)",
            fontSize: 20,
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
      style={{
        width,
        height,
        borderRadius: radius,
        backgroundColor: colors.raised,
      }}
      resizeMode="cover"
    />
  );
}
