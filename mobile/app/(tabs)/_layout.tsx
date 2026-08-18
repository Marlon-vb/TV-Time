import { useWindowDimensions } from "react-native";
import type { ParamListBase, TabNavigationState } from "@react-navigation/native";
import {
  createMaterialTopTabNavigator,
  type MaterialTopTabNavigationEventMap,
  type MaterialTopTabNavigationOptions,
} from "@react-navigation/material-top-tabs";
import { withLayoutContext } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import SwipeTabBar from "@/components/SwipeTabBar";
import { colors } from "@/lib/theme";

/**
 * Swipeable tabs with the floating glass bar. Headers are rendered in-screen
 * (ScreenHeader).
 *
 * This is a top-tab navigator, not a bottom-tab one, because bottom tabs
 * cannot swipe between screens — they mount one child at a time with no pager
 * underneath. Top tabs give the horizontal pager; the bar is drawn by
 * SwipeTabBar and absolutely positioned at the bottom, so it stays the same
 * pill it always was.
 */
const { Navigator } = createMaterialTopTabNavigator();

const Tabs = withLayoutContext<
  MaterialTopTabNavigationOptions,
  typeof Navigator,
  TabNavigationState<ParamListBase>,
  MaterialTopTabNavigationEventMap
>(Navigator);

export default function TabsLayout() {
  const { width } = useWindowDimensions();
  return (
    <Tabs
      // The pager measures itself on layout; without a starting width the
      // first frame renders at zero and the initial tab flashes blank.
      initialLayout={{ width }}
      // Rendered after the pager so the bar paints over the screens rather
      // than reserving a strip of layout above them.
      tabBarPosition="bottom"
      tabBar={(props) => <SwipeTabBar {...props} />}
      screenOptions={{
        sceneStyle: { backgroundColor: colors.ink },
        // Six screens: mounting them all on launch would pay for five tabs
        // nobody has opened yet. The neighbours still mount ahead of time,
        // or a swipe would drag a blank pane into view and only fill it once
        // the gesture ended.
        lazy: true,
        lazyPreloadDistance: 1,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Next",
          tabBarIcon: ({ color }) => (
            <Ionicons name="play" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="upcoming"
        options={{
          title: "Upcoming",
          tabBarIcon: ({ color }) => (
            <Ionicons name="calendar" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="shows"
        options={{
          title: "Library",
          tabBarIcon: ({ color }) => (
            <Ionicons name="grid" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: "Discover",
          tabBarIcon: ({ color }) => (
            <Ionicons name="search" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="friends"
        options={{
          title: "Friends",
          tabBarIcon: ({ color }) => (
            <Ionicons name="people" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "You",
          tabBarIcon: ({ color }) => (
            <Ionicons name="person" size={22} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
