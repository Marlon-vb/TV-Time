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
        tabBarStyle: {
          position: "absolute",
          left: 16,
          right: 16,
          bottom: 24,
          height: 64,
          borderRadius: 32,
          borderTopWidth: 0,
          borderWidth: 1,
          borderColor: colors.lineStrong,
          backgroundColor: "rgba(20,22,35,0.62)",
          overflow: "hidden",
          paddingTop: 6,
          paddingBottom: 8,
        },
        tabBarBackground: () => (
          <BlurView
            tint="dark"
            intensity={50}
            style={StyleSheet.absoluteFill}
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
