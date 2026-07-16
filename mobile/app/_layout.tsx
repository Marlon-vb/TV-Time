import { useEffect } from "react";
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

export default function RootLayout() {
  const router = useRouter();
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
        <Stack.Screen name="settings" options={{ title: "Settings" }} />
      </Stack>
    </AuthProvider>
  );
}
