import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Haptics from "expo-haptics";
import AgreementLine from "@/components/AgreementLine";
import Avatar from "@/components/Avatar";
import Bouncy from "@/components/Bouncy";
import { accentGradient, colors, fonts, radius } from "@/lib/theme";
import { useAuth } from "@/lib/social/auth";
import * as social from "@/lib/social/api";
import type { Profile } from "@/lib/social/types";

const SHOTS = {
  watchNext: require("@/assets/onboarding/watch-next.webp"),
  upcoming: require("@/assets/onboarding/upcoming.webp"),
  profile: require("@/assets/onboarding/profile.webp"),
} as const;

/**
 * First-run intro: three screens, skippable from any of them, and it never
 * gates the app behind an account. The third screen is where sign-in and
 * contact matching are offered — both optional, both with the explanation in
 * front of the system prompt rather than after it, which is what Apple's
 * review guidance on permission requests asks for.
 */
export default function Onboarding({ onDone }: { onDone: () => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scroller = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [page, setPage] = useState(0);
  // Each page is its own vertical scroller, and a scroller nested in a
  // horizontal one has no height to inherit — measure the pager and hand it
  // down rather than hoping the cross-axis stretch resolves.
  const [pagerHeight, setPagerHeight] = useState(0);
  const last = 2;

  // Small phones (SE) can't afford the full device frame; the copy matters more.
  const shotHeight = Math.min(height * 0.42, 340);

  const goTo = useCallback(
    (next: number) => {
      scroller.current?.scrollTo({ x: next * width, animated: true });
      setPage(next);
    },
    [width]
  );

  const finish = useCallback(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onDone();
  }, [onDone]);

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / width);
    if (next !== page) setPage(next);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink }}>
      {/* One warm wash behind everything, so the three pages read as one place
          rather than three unrelated screens. */}
      <LinearGradient
        colors={["#1b1d38", colors.ink]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 0.7 }}
        style={{ position: "absolute", inset: 0 }}
      />

      <View
        style={{
          flexDirection: "row",
          justifyContent: "flex-end",
          paddingHorizontal: 8,
          paddingTop: insets.top,
        }}
      >
        <Pressable
          onPress={finish}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Skip the intro"
          style={{ padding: 12 }}
        >
          <Text style={{ color: colors.muted, fontSize: 15 }}>Skip</Text>
        </Pressable>
      </View>

      <Animated.ScrollView
        ref={scroller as never}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumEnd}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
        onLayout={(e) => setPagerHeight(e.nativeEvent.layout.height)}
      >
        <Page
          width={width}
          height={pagerHeight}
          index={0}
          scrollX={scrollX}
          shot={SHOTS.watchNext}
          shotHeight={shotHeight}
          title="Everything you watch, in one place"
          body="TV shows, movies and documentaries. Your library lives on your phone and works without an account."
        />
        <Page
          width={width}
          height={pagerHeight}
          index={1}
          scrollX={scrollX}
          shot={SHOTS.upcoming}
          shotHeight={shotHeight}
          title="Never lose your place"
          body="Watch Next always knows the next episode. Upcoming shows what airs tonight, and a home-screen widget keeps it a glance away."
        />
        <FriendsPage
          width={width}
          height={pagerHeight}
          index={2}
          scrollX={scrollX}
          shotHeight={shotHeight}
        />
      </Animated.ScrollView>

      <View
        style={{
          paddingHorizontal: 24,
          paddingBottom: Math.max(insets.bottom, 16),
          paddingTop: 8,
          gap: 18,
        }}
      >
        <Dots count={3} page={page} />
        <Bouncy
          onPress={() => (page === last ? finish() : goTo(page + 1))}
          accessibilityRole="button"
          accessibilityLabel={page === last ? "Start watching" : "Next"}
          style={{ borderRadius: radius.md, overflow: "hidden" }}
        >
          <LinearGradient
            colors={accentGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ paddingVertical: 15, alignItems: "center" }}
          >
            <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 16 }}>
              {page === last ? "Start watching" : "Next"}
            </Text>
          </LinearGradient>
        </Bouncy>
      </View>
    </View>
  );
}

// --------------------------------------------------------------------- pages

function Page({
  width,
  height,
  index,
  scrollX,
  shot,
  shotHeight,
  title,
  body,
}: {
  width: number;
  height: number;
  index: number;
  scrollX: Animated.Value;
  shot: number;
  shotHeight: number;
  title: string;
  body: string;
}) {
  return (
    <PageFrame width={width} height={height} gap={26}>
      <DeviceShot
        shot={shot}
        height={shotHeight}
        width={width}
        index={index}
        scrollX={scrollX}
      />
      <Copy title={title} body={body} />
    </PageFrame>
  );
}

/**
 * Each page scrolls vertically inside the horizontal pager. Centred when it
 * fits, scrollable when it doesn't — which it won't on a 4.7" screen at the
 * larger Dynamic Type sizes, and a page that silently clips its sign-in button
 * is worse than one that scrolls.
 */
function PageFrame({
  width,
  height,
  gap,
  children,
}: {
  width: number;
  height: number;
  gap: number;
  children: React.ReactNode;
}) {
  return (
    <ScrollView
      // 0 only on the very first pass, before the pager has been measured.
      style={{ width, height: height || undefined }}
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: 28,
        paddingVertical: 12,
        gap,
      }}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}

function FriendsPage({
  width,
  height,
  index,
  scrollX,
  shotHeight,
}: {
  width: number;
  height: number;
  index: number;
  scrollX: Animated.Value;
  shotHeight: number;
}) {
  const { configured, session, signInWithApple } = useAuth();
  const [busy, setBusy] = useState(false);
  const [scan, setScan] = useState<"idle" | "scanning" | "denied" | "done">("idle");
  const [found, setFound] = useState<Profile[]>([]);
  const [followed, setFollowed] = useState(false);

  const scanContacts = async () => {
    setScan("scanning");
    try {
      const { granted, profiles } = await social.findFriendsFromContacts();
      if (!granted) {
        setScan("denied");
        return;
      }
      setFound(profiles);
      setScan("done");
      if (profiles.length) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {
      // Offline or a transient Supabase error — offer the button again rather
      // than stranding them on a spinner.
      setScan("idle");
    }
  };

  const followAll = async () => {
    setBusy(true);
    // Sequential on purpose: a handful of rows, and one failure shouldn't
    // abort the rest the way Promise.all would.
    for (const p of found) {
      try {
        await social.follow(p.id);
      } catch {
        /* skip and continue */
      }
    }
    setBusy(false);
    setFollowed(true);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  return (
    <PageFrame width={width} height={height} gap={22}>
      <DeviceShot
        shot={SHOTS.profile}
        height={shotHeight * 0.72}
        width={width}
        index={index}
        scrollX={scrollX}
      />
      <Copy
        title="Watch together, if you want"
        body="Follow friends, see what they're watching and talk about episodes. Everything here is optional — the app is complete without it."
      />

      {!configured ? null : !session ? (
        <View style={{ alignItems: "center", gap: 10, alignSelf: "stretch" }}>
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
            cornerRadius={radius.sm}
            style={{ width: 230, height: 44 }}
            onPress={async () => {
              if (busy) return;
              setBusy(true);
              try {
                await signInWithApple();
              } catch {
                /* cancelled or unavailable — stay on the page */
              } finally {
                setBusy(false);
              }
            }}
          />
          <AgreementLine />
        </View>
      ) : scan === "done" ? (
        <ContactResults
          found={found}
          followed={followed}
          busy={busy}
          onFollowAll={() => void followAll()}
        />
      ) : (
        <View style={{ alignSelf: "stretch", gap: 10 }}>
          <Bouncy
            onPress={() => {
              if (scan === "scanning") return;
              // iOS never re-prompts once contacts have been denied, so a
              // second tap on the same button would do nothing at all.
              if (scan === "denied") void Linking.openSettings();
              else void scanContacts();
            }}
            accessibilityRole="button"
            accessibilityLabel={
              scan === "denied"
                ? "Open iOS Settings to allow contacts"
                : "Find friends from your contacts"
            }
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              paddingVertical: 13,
              borderRadius: radius.md,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.lineStrong,
            }}
          >
            {scan === "scanning" ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <Ionicons
                name={scan === "denied" ? "settings-outline" : "people-outline"}
                size={17}
                color={colors.accent}
              />
            )}
            <Text style={{ color: colors.fg, fontFamily: fonts.display, fontSize: 15 }}>
              {scan === "scanning"
                ? "Checking…"
                : scan === "denied"
                  ? "Open Settings"
                  : "Find friends from contacts"}
            </Text>
          </Bouncy>
          <Text style={fine}>
            {scan === "denied"
              ? "No problem — you can allow contacts later in iOS Settings, or search for people by username in the Friends tab."
              : "Email addresses are hashed on your phone; only the hashes are checked. Nothing readable leaves the device, and phone numbers are never read."}
          </Text>
        </View>
      )}
    </PageFrame>
  );
}

function ContactResults({
  found,
  followed,
  busy,
  onFollowAll,
}: {
  found: Profile[];
  followed: boolean;
  busy: boolean;
  onFollowAll: () => void;
}) {
  if (!found.length) {
    return (
      <Text style={fine}>
        Nobody from your contacts is here yet. You can invite them, or search by
        username, from the Friends tab.
      </Text>
    );
  }

  return (
    <View style={{ alignSelf: "stretch", gap: 10 }}>
      {/* Overlapped by the children's negative margin — a stack, not a row of
          gaps, so it stays compact however many matched. */}
      <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center" }}>
        {found.slice(0, 5).map((p) => (
          <View key={p.id} style={{ marginLeft: -8, borderWidth: 2, borderColor: colors.ink, borderRadius: 999 }}>
            <Avatar name={p.display_name || p.username} url={p.avatar_url} size={38} />
          </View>
        ))}
      </View>
      {followed ? (
        <Text style={[fine, { color: colors.ok }]}>
          Following {found.length} {found.length === 1 ? "person" : "people"} — their episodes
          will show up in your feed.
        </Text>
      ) : (
        <>
          <Bouncy
            onPress={() => !busy && onFollowAll()}
            accessibilityRole="button"
            accessibilityLabel={`Follow all ${found.length} contacts found`}
            style={{
              alignItems: "center",
              paddingVertical: 13,
              borderRadius: radius.md,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.lineStrong,
            }}
          >
            {busy ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <Text style={{ color: colors.fg, fontFamily: fonts.display, fontSize: 15 }}>
                Follow all {found.length}
              </Text>
            )}
          </Bouncy>
          <Text style={fine}>Or pick individually in the Friends tab.</Text>
        </>
      )}
    </View>
  );
}

// ----------------------------------------------------------------- furniture

/** The screenshot in a device frame, drifting slightly as the page turns. */
function DeviceShot({
  shot,
  height,
  width,
  index,
  scrollX,
}: {
  shot: number;
  height: number;
  width: number;
  index: number;
  scrollX: Animated.Value;
}) {
  // Moves at ~0.4x the page, so the art trails the copy instead of travelling
  // locked to it — the depth cue that makes a pager feel built rather than
  // assembled.
  const translateX = scrollX.interpolate({
    inputRange: [(index - 1) * width, index * width, (index + 1) * width],
    outputRange: [60, 0, -60],
    extrapolate: "clamp",
  });
  const scale = scrollX.interpolate({
    inputRange: [(index - 1) * width, index * width, (index + 1) * width],
    outputRange: [0.9, 1, 0.9],
    extrapolate: "clamp",
  });

  return (
    <Animated.View
      style={{
        height,
        aspectRatio: 320 / 629,
        borderRadius: 30,
        padding: 7,
        backgroundColor: "#181c33",
        borderWidth: 1,
        borderColor: colors.lineStrong,
        shadowColor: "#000",
        shadowOpacity: 0.6,
        shadowRadius: 26,
        shadowOffset: { width: 0, height: 18 },
        transform: [{ translateX }, { scale }],
      }}
    >
      <Image
        source={shot}
        // Concentric with the frame: outer radius minus the bezel it sits in.
        style={{ flex: 1, borderRadius: 23 }}
        contentFit="cover"
        contentPosition="top"
        accessible={false}
      />
    </Animated.View>
  );
}

function Copy({ title, body }: { title: string; body: string }) {
  return (
    <View style={{ gap: 10, alignItems: "center" }}>
      <Text
        style={{
          color: colors.fg,
          fontFamily: fonts.display,
          fontSize: 26,
          lineHeight: 32,
          textAlign: "center",
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          color: colors.muted,
          fontSize: 15,
          lineHeight: 22,
          textAlign: "center",
        }}
      >
        {body}
      </Text>
    </View>
  );
}

function Dots({ count, page }: { count: number; page: number }) {
  return (
    <View
      style={{ flexDirection: "row", justifyContent: "center", gap: 7 }}
      accessibilityRole="tablist"
      accessibilityLabel={`Step ${page + 1} of ${count}`}
    >
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={{
            width: i === page ? 20 : 7,
            height: 7,
            borderRadius: 999,
            backgroundColor: i === page ? colors.accent : colors.overlay,
          }}
        />
      ))}
    </View>
  );
}

const fine = {
  color: colors.faint,
  fontSize: 12,
  lineHeight: 17,
  textAlign: "center",
} as const;
