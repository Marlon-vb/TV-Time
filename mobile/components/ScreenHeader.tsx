import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "@/lib/theme";

export interface HeaderAction {
  icon: keyof typeof Ionicons.glyphMap;
  /** Spoken by VoiceOver, so name the destination, not the glyph. */
  label: string;
  onPress: () => void;
}

/**
 * Large in-screen title (tab headers are hidden) with one optional control on
 * the right — the app's editorial masthead.
 *
 * The control is passed in rather than named by a flag. Each tab that has one
 * has a different one (Profile opens Settings, Friends opens the add-friends
 * screen), and a header that grows a boolean per destination ends up knowing
 * about every screen in the app. Tabs without one pass nothing: repeating a
 * control on all six made it furniture rather than a destination.
 */
export default function ScreenHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string | null;
  action?: HeaderAction;
}) {
  const insets = useSafeAreaInsets();

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
      {action ? (
        <Pressable
          onPress={action.onPress}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={action.label}
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
          <Ionicons name={action.icon} size={17} color={colors.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}
