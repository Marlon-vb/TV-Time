import { useCallback, useEffect, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Share,
  Text,
  View,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";
import Avatar from "@/components/Avatar";
import Bouncy from "@/components/Bouncy";
import { card } from "@/components/ui";
import { colors, fonts, radius } from "@/lib/theme";
import { useAuth } from "@/lib/social/auth";
import * as social from "@/lib/social/api";
import { confirmBlock, reportWithFeedback } from "@/lib/social/moderation";
import type { Profile } from "@/lib/social/types";

export default function UserProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile: me } = useAuth();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [counts, setCounts] = useState({ followers: 0, following: 0 });
  const [following, setFollowing] = useState<boolean | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [qr, setQr] = useState(false);

  const isMe = me?.username === username;

  const load = useCallback(async () => {
    const p = await social.getProfileByUsername(username);
    setProfile(p);
    if (!p) return;
    setCounts(await social.followCounts(p.id));
    if (!isMe) {
      setFollowing(await social.isFollowing(p.id));
      setBlocked((await social.getBlockedIds()).has(p.id));
    }
  }, [username, isMe]);

  useEffect(() => {
    void load();
  }, [load]);

  if (profile === undefined) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (profile === null) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Stack.Screen options={{ title: `@${username}` }} />
        <Text style={{ color: colors.muted }}>User @{username} not found.</Text>
      </View>
    );
  }

  const name = profile.display_name || profile.username;

  const toggleFollow = async () => {
    const wasFollowing = Boolean(following);
    setFollowing(!wasFollowing);
    const ok = wasFollowing
      ? await social.unfollow(profile.id)
      : await social.follow(profile.id);
    if (!ok) {
      setFollowing(wasFollowing); // revert — don't let a silent failure lie
      Alert.alert(
        wasFollowing ? "Couldn't unfollow" : "Couldn't follow",
        "Check your connection and try again."
      );
      return;
    }
    setCounts(await social.followCounts(profile.id));
  };

  const deepLink = `tvtime://u/${profile.username}`;

  return (
    <>
      <Stack.Screen options={{ title: `@${profile.username}` }} />
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          gap: 14,
          // Clear the transparent nav header on every device, Dynamic Island
          // included (was a hardcoded 90).
          paddingTop: insets.top + 56,
        }}
      >
        <View style={{ alignItems: "center", gap: 8 }}>
          <Avatar name={name} url={profile.avatar_url} size={84} />
          <Text style={{ color: colors.fg, fontFamily: fonts.display, fontSize: 20 }}>
            {name}
          </Text>
          <Text style={{ color: colors.faint, fontSize: 13 }}>@{profile.username}</Text>
          <View style={{ flexDirection: "row", gap: 20, marginTop: 4 }}>
            <Stat n={counts.followers} label="followers" />
            <Stat n={counts.following} label="following" />
          </View>

          <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
            {isMe ? (
              <>
                <Bouncy onPress={() => setQr(true)} scaleTo={0.94} style={btn(false)}>
                  <Ionicons name="qr-code" size={15} color={colors.fg} />
                  <Text style={btnText(false)}>My QR</Text>
                </Bouncy>
                <Bouncy
                  onPress={() =>
                    void Share.share({
                      message: `Follow me on TV Time — I'm @${profile.username}. Got the app? Tap ${deepLink} — otherwise search @${profile.username} once you're in.`,
                    })
                  }
                  scaleTo={0.94}
                  style={btn(false)}
                >
                  <Ionicons name="share-outline" size={15} color={colors.fg} />
                  <Text style={btnText(false)}>Share</Text>
                </Bouncy>
              </>
            ) : blocked ? (
              <Bouncy
                onPress={async () => {
                  await social.unblockUser(profile.id);
                  setBlocked(false);
                  await load();
                }}
                scaleTo={0.94}
                style={btn(false)}
              >
                <Text style={btnText(false)}>Unblock</Text>
              </Bouncy>
            ) : (
              <>
                <Bouncy onPress={toggleFollow} scaleTo={0.94} style={btn(!following)}>
                  <Text style={btnText(!following)}>
                    {following == null ? "…" : following ? "Following" : "Follow"}
                  </Text>
                </Bouncy>
                <Bouncy
                  onPress={() =>
                    ActionSheetIOS.showActionSheetWithOptions(
                      {
                        options: ["Report user", `Block @${profile.username}`, "Cancel"],
                        destructiveButtonIndex: 1,
                        cancelButtonIndex: 2,
                        userInterfaceStyle: "dark",
                      },
                      async (i) => {
                        if (i === 0) {
                          await reportWithFeedback({ userId: profile.id });
                        } else if (i === 1) {
                          confirmBlock(`@${profile.username}`, profile.id, async () => {
                            setFollowing(false);
                            setBlocked(true);
                            await load();
                          });
                        }
                      }
                    )
                  }
                  scaleTo={0.94}
                  accessibilityRole="button"
                  accessibilityLabel={`Report or block ${name}`}
                  style={{ ...btn(false), minWidth: 44, paddingHorizontal: 12 }}
                >
                  <Ionicons name="ellipsis-horizontal" size={16} color={colors.fg} />
                </Bouncy>
              </>
            )}
          </View>
        </View>
      </ScrollView>

      <Modal visible={qr} transparent animationType="fade" onRequestClose={() => setQr(false)}>
        <Pressable
          onPress={() => setQr(false)}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center", padding: 32 }}
        >
          <View style={{ ...card, padding: 24, alignItems: "center", gap: 14 }}>
            <Text style={{ color: colors.fg, fontFamily: fonts.display, fontSize: 16 }}>
              @{profile.username}
            </Text>
            <View style={{ backgroundColor: "#fff", padding: 14, borderRadius: 14 }}>
              <QRCode value={deepLink} size={200} backgroundColor="#fff" color="#0b0c14" />
            </View>
            <Text style={{ color: colors.muted, fontSize: 12, textAlign: "center" }}>
              Friends with the app can scan this with the iPhone camera to
              open your profile.
            </Text>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <View style={{ alignItems: "center" }}>
      <Text style={{ color: colors.fg, fontFamily: fonts.display, fontSize: 17 }}>{n}</Text>
      <Text style={{ color: colors.faint, fontSize: 11 }}>{label}</Text>
    </View>
  );
}

const btn = (primary: boolean) =>
  ({
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: radius.sm,
    backgroundColor: primary ? colors.accent : colors.surface,
    borderWidth: 1,
    borderColor: primary ? colors.accent : colors.line,
    minWidth: 110,
    justifyContent: "center",
  }) as const;

const btnText = (primary: boolean) =>
  ({
    color: primary ? colors.ink : colors.fg,
    fontWeight: "800",
    fontSize: 13,
  }) as const;
