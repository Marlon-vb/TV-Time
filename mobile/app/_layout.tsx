import { useEffect } from "react";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import { colors } from "@/lib/theme";
import { getDb } from "@/lib/db";
import { registerBackgroundSync, syncAndReschedule } from "@/lib/sync";

export default function RootLayout() {
  const router = useRouter();

  useEffect(() => {
    getDb(); // create tables on first launch

    // Refresh air dates + notification schedule shortly after launch.
    const timer = setTimeout(() => {
      void syncAndReschedule().catch(() => {});
    }, 1500);
    void registerBackgroundSync();

    // Tapping a notification deep-links to the show it's about.
    const sub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const url = response.notification.request.content.data?.url;
        if (typeof url === "string") {
          router.push(url as never);
        }
      }
    );
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, [router]);

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.ink },
          headerTintColor: colors.fg,
          headerTitleStyle: { fontWeight: "800" },
          contentStyle: { backgroundColor: colors.ink },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="show/[id]" options={{ title: "" }} />
        <Stack.Screen name="settings" options={{ title: "Settings" }} />
      </Stack>
    </>
  );
}
