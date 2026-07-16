import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import Avatar from "@/components/Avatar";
import { card } from "@/components/ui";
import { colors } from "@/lib/theme";
import { useAuth } from "@/lib/social/auth";
import * as social from "@/lib/social/api";
import type { Profile } from "@/lib/social/types";

/** "Alex, Sam and 2 more watched this" avatar row. Renders nothing if none. */
export default function FriendsWatchedRow({
  showId,
  season,
  episode,
  verb = "watched this",
}: {
  showId: number;
  season?: number;
  episode?: number;
  verb?: string;
}) {
  const { session } = useAuth();
  const router = useRouter();
  const [friends, setFriends] = useState<Profile[]>([]);

  useEffect(() => {
    if (!session) return;
    void social.friendsWhoWatched(showId, season, episode).then(setFriends);
  }, [session, showId, season, episode]);

  if (!session || friends.length === 0) return null;

  const names = friends.map((f) => f.display_name || f.username);
  const text =
    names.length === 1
      ? `${names[0]} ${verb}`
      : names.length === 2
        ? `${names[0]} and ${names[1]} ${verb}`
        : `${names[0]}, ${names[1]} and ${friends.length - 2} more ${verb}`;

  return (
    <Pressable
      onPress={() => friends[0] && router.push(`/u/${friends[0].username}` as never)}
      style={{ ...card, flexDirection: "row", alignItems: "center", gap: 10, padding: 12 }}
    >
      <View style={{ flexDirection: "row" }}>
        {friends.slice(0, 5).map((f, i) => (
          <View key={f.id} style={{ marginLeft: i === 0 ? 0 : -8 }}>
            <Avatar name={f.display_name || f.username} url={f.avatar_url} size={28} />
          </View>
        ))}
      </View>
      <Text style={{ color: colors.muted, fontSize: 13, flex: 1 }} numberOfLines={2}>
        {text}
      </Text>
    </Pressable>
  );
}
