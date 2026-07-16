import { StyleSheet } from "react-native";
import { Tabs } from "expo-router";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/lib/theme";

/** Floating glass tab bar — headers are rendered in-screen (ScreenHeader). */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.ink },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.faint,
        tabBarLabelStyle: { fontSize: 10, fontWeight: "600" },
        tabBarItemStyle: { paddingTop: 8, paddingBottom: 8 },
        // Rounded, bordered pill with a real drop shadow. The container owns
        // the rounded background/border/shadow (no overflow:hidden so the
        // shadow renders); the BlurView frost clips to its own rounded corners
        // on top (iOS native blur ignores a parent's overflow:hidden).
        tabBarStyle: {
          position: "absolute",
          left: 20,
          right: 20,
          bottom: 28,
          height: 60,
          borderRadius: 30,
          borderTopWidth: 0,
          borderWidth: 1,
          borderColor: colors.lineStrong,
          backgroundColor: "rgba(18,20,32,0.72)",
          elevation: 12,
          shadowColor: "#000",
          shadowOpacity: 0.4,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
        },
        tabBarBackground: () => (
          <BlurView
            tint="dark"
            intensity={40}
            style={{
              ...StyleSheet.absoluteFillObject,
              borderRadius: 30,
              overflow: "hidden",
            }}
          />
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Watch Next",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="play" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="upcoming"
        options={{
          title: "Upcoming",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="shows"
        options={{
          title: "My Shows",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="grid" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: "Discover",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="search" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
