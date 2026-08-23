import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { MaterialTopTabBarProps } from "@react-navigation/material-top-tabs";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/lib/theme";

/**
 * The floating glass tab bar, rebuilt for the swipeable navigator.
 *
 * Bottom tabs cannot swipe, so the tabs are a top-tab navigator wearing a
 * bottom bar. That means owning the bar rather than configuring one: this
 * reproduces the pill exactly — the container holds the rounded background,
 * border and shadow (no overflow:hidden, or the shadow would be clipped), and
 * the BlurView frosts on top, clipping to its own corners because iOS's native
 * blur ignores a parent's overflow:hidden.
 */
export default function SwipeTabBar({
  state,
  descriptors,
  navigation,
}: MaterialTopTabBarProps) {
  // Measured, not assumed. This bar is positioned from the bottom of the
  // window, and it used to sit at a hardcoded 28 — a number picked by looking
  // at one iPhone. An iPhone-only app is still installable on iPad and runs
  // there in compatibility mode, where the window geometry is not an iPhone's,
  // and a fixed offset has nothing to keep it on screen.
  //
  // The arithmetic reproduces the old 28 exactly on a modern iPhone (34pt home
  // indicator inset), so the look is unchanged where it was already right, and
  // falls back to a safe constant where there is no inset to work from.
  const insets = useSafeAreaInsets();
  const bottom = insets.bottom > 0 ? Math.max(insets.bottom - 6, 12) : 20;

  return (
    <View style={[styles.bar, { bottom }]}>
      <BlurView tint="dark" intensity={40} style={styles.frost} />
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const focused = state.index === index;
        const color = focused ? colors.accent : colors.faint;
        const label =
          typeof options.title === "string" ? options.title : route.name;

        return (
          <Pressable
            key={route.key}
            onPress={() => {
              // Emitted even when this tab is already focused: screens listen
              // for a repeat press to reset themselves (Discover clears its
              // search), which only works if the event fires every time.
              const event = navigation.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name, route.params);
              }
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={label}
            style={styles.item}
          >
            {options.tabBarIcon?.({ focused, color })}
            <Text
              style={[styles.label, { color }]}
              numberOfLines={1}
              // Chrome, not content. At 10pt inside a fixed pill, Dynamic Type
              // at iPad's larger default sizes pushes the label past the
              // bottom edge and clips it mid-glyph — which is exactly what
              // review saw. Bounded rather than disabled, so the setting still
              // does something for people who need it.
              maxFontSizeMultiplier={1.2}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    left: 20,
    right: 20,
    // Minimum, not fixed, and padded rather than relying on the children
    // fitting inside a number measured on one device.
    minHeight: 62,
    paddingVertical: 6,
    flexDirection: "row",
    // Stretch, not centre: items fill the bar's height and centre their own
    // contents, so an item can never be taller than the thing drawing it.
    alignItems: "stretch",
    borderRadius: 30,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: "rgba(18,20,32,0.72)",
    elevation: 12,
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  frost: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 30,
    overflow: "hidden",
  },
  item: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    minHeight: 44,
  },
  // Explicit lineHeight: without one the text box is whatever the platform
  // decides the font needs, which is the number that differs between an
  // iPhone and the same layout scaled onto an iPad.
  label: { fontSize: 10, lineHeight: 13, fontWeight: "600" },
});
