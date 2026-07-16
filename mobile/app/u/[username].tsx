import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Share,
  Text,
  View,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";
import Avatar from "@/components/Avatar";
import Bouncy from "@/components/Bouncy";
import { card } from "@/components/ui";
import { colors, fonts, radius } from "@/lib/theme";
import { useAuth } from "@/lib/social/auth";
import * as social from "@/lib/social/api";
import type { Profile } from "@/lib/social/types";

export default function UserProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const router = useRouter();
  const { profile: me } = useAuth();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [counts, setCounts] = useState({ followers: 0, following: 0 });
  const [following, setFollowing] = useState<boolean | null>(null);
  const [qr, setQr] = useState(false);

  const isMe = me?.username === username;

  const load = useCallback(async () => {
    const p = await social.getProfileByUsername(username);
    setProfile(p);
    if (!p) return;
    setCounts(await social.followCounts(p.id));
    if (!isMe) setFollowing(await social.isFollowing(p.id));
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
    if (following) {
      setFollowing(false);
      await social.unfollow(profile.id);
    } else {
      setFollowing(true);
      await social.follow(profile.id);
    }
    setCounts(await social.followCounts(profile.id));
  };

  const deepLink = `tvtime://u/${profile.username}`;

  return (
    <>
      <Stack.Screen options={{ title: `@${profile.username}` }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingTop: 90 }}>
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
                      message: `Follow me on TV Time — @${profile.username}: ${deepLink}`,
                    })
                  }
                  scaleTo={0.94}
                  style={btn(false)}
                >
                  <Ionicons name="share-outline" size={15} color={colors.fg} />
                  <Text style={btnText(false)}>Share</Text>
                </Bouncy>
              </>
            ) : (
              <Bouncy onPress={toggleFollow} scaleTo={0.94} style={btn(!following)}>
                <Text style={btnText(!following)}>
                  {following == null ? "…" : following ? "Following" : "Follow"}
                </Text>
              </Bouncy>
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
              Have a friend scan this in the app to follow you.
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
