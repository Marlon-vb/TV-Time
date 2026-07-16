import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "@/lib/theme";

/**
 * Large in-screen title (tab headers are hidden) with the settings
 * control on the right — the app's editorial masthead.
 */
export default function ScreenHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string | null;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View
      style={{
        paddingTop: insets.top + 14,
        paddingHorizontal: 18,
        paddingBottom: 6,
        flexDirection: "row",
        alignItems: "flex-end",
        justifyContent: "space-between",
      }}
    >
      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: colors.fg,
            fontSize: 30,
            fontFamily: fonts.display,
            letterSpacing: -0.5,
          }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text style={{ color: colors.faint, fontSize: 12, marginTop: 3 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Pressable
        onPress={() => router.push("/settings")}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Settings"
        style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.line,
          marginBottom: 4,
        }}
      >
        <Ionicons name="settings-sharp" size={17} color={colors.muted} />
      </Pressable>
    </View>
  );
}
