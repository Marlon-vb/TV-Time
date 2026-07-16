import { Text, View } from "react-native";
import { Image } from "expo-image";
import { colors, fonts } from "@/lib/theme";

/** Circular avatar from a photo, falling back to a colored initial. */
export default function Avatar({
  name,
  url,
  size = 40,
}: {
  name: string;
  url?: string | null;
  size?: number;
}) {
  if (url) {
    return (
      <Image
        source={{ uri: url }}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.raised }}
        contentFit="cover"
        cachePolicy="disk"
      />
    );
  }
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  const hue = Math.abs(hash) % 360;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: `hsl(${hue}, 40%, 28%)`,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: "#fff", fontFamily: fonts.display, fontSize: size * 0.42 }}>
        {(name || "?").charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}
