import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "@/lib/theme";

export interface HeaderAction {
  icon: keyof typeof Ionicons.glyphMap;
  /** Spoken by VoiceOver, so name the destination, not the glyph. */
  label: string;
  onPress: () => void;
  /** Unread dot. The count stays out of it — the number is on the screen. */
  badge?: boolean;
}

/**
 * Large in-screen title (tab headers are hidden) with one optional control on
 * the right — the app's editorial masthead.
 *
 * Controls are passed in rather than named by a flag. Each tab that has one
 * has a different one (Profile opens Settings, Friends opens notifications and
 * the add-friends screen), and a header that grows a boolean per destination
 * ends up knowing about every screen in the app. Tabs without one pass
 * nothing: repeating a control on all six made it furniture rather than a
 * destination.
 */
export default function ScreenHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string | null;
  actions?: HeaderAction[];
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
      {actions && actions.length > 0 ? (
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 4 }}>
          {actions.map((action) => (
            <Pressable
              key={action.icon}
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
              }}
            >
              <Ionicons name={action.icon} size={17} color={colors.muted} />
              {action.badge ? (
                <View
                  style={{
                    position: "absolute",
                    top: 7,
                    right: 8,
                    width: 9,
                    height: 9,
                    borderRadius: 5,
                    backgroundColor: colors.accent,
                    borderWidth: 1.5,
                    borderColor: colors.surface,
                  }}
                />
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
