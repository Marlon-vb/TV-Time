import { useEffect, useState } from "react";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import * as SplashScreen from "expo-splash-screen";
import {
  SpaceGrotesk_500Medium,
  SpaceGrotesk_700Bold,
  useFonts,
} from "@expo-google-fonts/space-grotesk";
import { colors, fonts } from "@/lib/theme";
import { getDb } from "@/lib/db";
import { registerBackgroundSync, syncAndReschedule } from "@/lib/sync";
import { AuthProvider } from "@/lib/social/auth";

void SplashScreen.preventAutoHideAsync().catch(() => {});

// Notification taps already navigated to, so a replayed launch response (the
// OS buffers it and can deliver it both via getLastNotificationResponse and
// the live listener) never double-pushes. Module-level so a RootLayout
// remount can't re-handle a stale tap either.
const handledNotificationTaps = new Set<string>();

export default function RootLayout() {
  const router = useRouter();
  // A tap's target URL parks here until the navigator exists — pushing
  // straight from the notification callback crashes on cold start when the
  // Stack hasn't mounted yet (fonts still loading).
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) void SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  useEffect(() => {
    getDb(); // create tables on first launch

    // Refresh air dates + notification schedule shortly after launch.
    const timer = setTimeout(() => {
      void syncAndReschedule().catch(() => {});
    }, 1500);
    void registerBackgroundSync();

    // Tapping a notification deep-links to the show it's about.
    const handleTap = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const id = response.notification.request.identifier;
      if (handledNotificationTaps.has(id)) return;
      handledNotificationTaps.add(id);
      const url = response.notification.request.content.data?.url;
      if (typeof url === "string") setPendingUrl(url);
    };
    const sub = Notifications.addNotificationResponseReceivedListener(handleTap);
    // The listener above misses taps that LAUNCHED the app (cold start) —
    // fetch that response explicitly or the tap lands on the home screen.
    handleTap(Notifications.getLastNotificationResponse());
    // Consumed — don't let a future remount replay it.
    Notifications.clearLastNotificationResponse();
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, []);

  // Navigate once the Stack below has actually rendered (child effects run
  // before this one, so the navigator is ready by the time this fires).
  useEffect(() => {
    if (!fontsLoaded || !pendingUrl) return;
    setPendingUrl(null);
    try {
      router.push(pendingUrl as never);
    } catch {
      // Navigator not ready after all (very slow first launch) — one retry.
      const url = pendingUrl;
      setTimeout(() => {
        try {
          router.push(url as never);
        } catch {}
      }, 600);
    }
  }, [fontsLoaded, pendingUrl, router]);

  if (!fontsLoaded) return null;

  return (
    <AuthProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.ink },
          headerTintColor: colors.fg,
          headerTitleStyle: { fontFamily: fonts.display, fontSize: 17 },
          headerShadowVisible: false,
          // Show only the chevron on the back button (no "(tabs)"/screen-title
          // text label next to it).
          headerBackButtonDisplayMode: "minimal",
          contentStyle: { backgroundColor: colors.ink },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="show/[id]"
          options={{
            title: "",
            headerTransparent: true,
            headerBlurEffect: "dark",
          }}
        />
        <Stack.Screen
          name="episode/[id]"
          options={{
            title: "",
            headerTransparent: true,
            headerBlurEffect: "dark",
          }}
        />
        <Stack.Screen
          name="u/[username]"
          options={{ title: "", headerTransparent: true, headerBlurEffect: "dark" }}
        />
        <Stack.Screen name="settings" options={{ title: "Settings" }} />
        <Stack.Screen name="history" options={{ title: "Watch history" }} />
      </Stack>
    </AuthProvider>
  );
}
