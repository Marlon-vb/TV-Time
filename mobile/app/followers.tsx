import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import UserRow from "@/components/UserRow";
import { EmptyState } from "@/components/ui";
import { colors, fonts, TAB_BAR_CLEARANCE } from "@/lib/theme";
import { setSetting } from "@/lib/db";
import { FOLLOWERS_SEEN_KEY, seenMarker } from "@/lib/follow-inbox";
import { shortAgo } from "@/lib/format-social";
import { useFollowing } from "@/lib/social/useFollowing";
import * as social from "@/lib/social/api";

/**
 * Who followed you, newest first — the in-app half of the follow notification.
 *
 * The push already deep-links to the person's profile. This is for the times
 * you were in the app when it happened, or had notifications off, or want to
 * see the ones you have not answered yet. Each row carries the same follow
 * toggle the rest of the app uses, so following back is one tap from here
 * rather than a trip through someone's profile.
 */
export default function FollowersScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<social.FollowerRow[] | null>(null);
  const { ids: followingIds, toggle: toggleFollow } = useFollowing();

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      social
        .recentFollowers()
        .then((r) => {
          if (!alive) return;
          setRows(r);
          // Marked read on arrival, from the newest row we actually loaded —
          // a follow landing between the fetch and now stays unread rather
          // than being swallowed by a "now" stamp.
          setSetting(FOLLOWERS_SEEN_KEY, seenMarker(r));
        })
        .catch(() => {
          if (alive) setRows([]);
        });
      return () => {
        alive = false;
      };
    }, [])
  );

  return (
    <>
      {rows == null ? (
        <View style={{ padding: 24 }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: TAB_BAR_CLEARANCE,
          }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListEmptyComponent={
            <EmptyState
              icon="notifications-outline"
              title="No followers yet"
              body="When someone follows you they'll show up here, and you can follow them back."
            />
          }
          renderItem={({ item }) => (
            <View>
              <UserRow
                profile={item}
                note={
                  followingIds?.has(item.id)
                    ? "You follow each other"
                    : "Started following you"
                }
                following={followingIds ? followingIds.has(item.id) : null}
                onToggle={() => toggleFollow(item.id)}
                onOpen={(u) => router.push(`/u/${u}` as never)}
              />
              <Text
                style={{
                  color: colors.faint,
                  fontSize: 10,
                  fontFamily: fonts.displayMedium,
                  marginTop: 3,
                  marginLeft: 12,
                }}
              >
                {shortAgo(item.followed_at)}
              </Text>
            </View>
          )}
        />
      )}
    </>
  );
}
