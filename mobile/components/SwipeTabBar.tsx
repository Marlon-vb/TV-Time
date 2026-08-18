import { Pressable, StyleSheet, Text, View } from "react-native";
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
  return (
    <View style={styles.bar}>
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
            <Text style={[styles.label, { color }]} numberOfLines={1}>
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
    bottom: 28,
    height: 60,
    flexDirection: "row",
    alignItems: "center",
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
    paddingTop: 8,
    paddingBottom: 8,
  },
  label: { fontSize: 10, fontWeight: "600" },
});
