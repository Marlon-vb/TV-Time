import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AgreementLine from "@/components/AgreementLine";
import Avatar from "@/components/Avatar";
import Bouncy from "@/components/Bouncy";
import Poster from "@/components/Poster";
import ScreenHeader from "@/components/ScreenHeader";
import UserRow from "@/components/UserRow";
import { EmptyState, card } from "@/components/ui";
import { colors, fonts, radius, TAB_BAR_CLEARANCE } from "@/lib/theme";
import { useAuth } from "@/lib/social/auth";
import { useFollowing } from "@/lib/social/useFollowing";
import * as social from "@/lib/social/api";
import * as repo from "@/lib/repo";
import { feedActivityText, shortAgo } from "@/lib/format-social";
import { groupActivityText, groupFeed } from "@/lib/social/feed-group";
import type { FeedItem, Profile } from "@/lib/social/types";

type Tab = "friends" | "feed";

const TABS: { key: Tab; label: string }[] = [
  { key: "friends", label: "Friends" },
  { key: "feed", label: "Activity" },
];

export default function FriendsScreen() {
  const { session, profile, ready } = useAuth();
  const router = useRouter();
  // Friends first, and the default: the tab is named after the people, so
  // opening it should answer "who do I follow" before "what have they done".
  const [tab, setTab] = useState<Tab>("friends");

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!session) {
    return (
      <View>
        <ScreenHeader title="Friends" />
        <View style={{ padding: 16 }}>
          <EmptyState
            icon="people-outline"
            title="Sign in to connect"
            body="Head to your Profile tab and sign in with Apple to follow friends, see what they're watching, and comment together."
          />
          {/* Secondary mention; the primary one is at the sign-in button
              itself, in AccountCard on the Profile tab. */}
          <AgreementLine style={{ marginTop: 14 }} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader
        title="Friends"
        subtitle={profile ? `@${profile.username}` : undefined}
        action={{
          icon: "person-add",
          label: "Add friends",
          onPress: () => router.push("/find-friends" as never),
        }}
      />
      <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 16, marginBottom: 8 }}>
        {TABS.map((t) => (
          <Pressable
            key={t.key}
            onPress={() => setTab(t.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t.key }}
            style={{
              flex: 1,
              paddingVertical: 9,
              borderRadius: radius.sm,
              alignItems: "center",
              backgroundColor: tab === t.key ? colors.accent : colors.surface,
              borderWidth: 1,
              borderColor: tab === t.key ? colors.accent : colors.line,
            }}
          >
            <Text style={{ color: tab === t.key ? colors.ink : colors.muted, fontWeight: "800", fontSize: 13 }}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>
      {tab === "friends" ? (
        <FriendsList
          onOpenUser={(u) => router.push(`/u/${u}` as never)}
          onAdd={() => router.push("/find-friends" as never)}
        />
      ) : (
        <FeedList onOpenUser={(u) => router.push(`/u/${u}` as never)} />
      )}
    </View>
  );
}

/**
 * The people you follow. Searchable, because the point of this list is
 * checking on one specific person, and scanning for them stops working
 * somewhere well before a hundred rows.
 */
function FriendsList({
  onOpenUser,
  onAdd,
}: {
  onOpenUser: (username: string) => void;
  onAdd: () => void;
}) {
  const { profiles, ids, toggle, reload } = useFollowing();
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !profiles) return profiles ?? [];
    return profiles.filter(
      (p) =>
        p.username.toLowerCase().includes(q) ||
        (p.display_name ?? "").toLowerCase().includes(q)
    );
  }, [profiles, query]);

  if (profiles === null) {
    return <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />;
  }

  return (
    <FlatList
      data={visible}
      keyExtractor={(p) => p.id}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: TAB_BAR_CLEARANCE }}
      ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void reload().finally(() => setRefreshing(false));
          }}
          tintColor={colors.accent}
        />
      }
      ListHeaderComponent={
        // Only worth the space once there is enough here to lose someone in.
        profiles.length >= 8 ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.line,
              borderRadius: radius.md,
              paddingHorizontal: 14,
              marginBottom: 10,
            }}
          >
            <Ionicons name="search" size={15} color={colors.faint} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search your friends"
              placeholderTextColor={colors.faint}
              autoCapitalize="none"
              autoCorrect={false}
              style={{ flex: 1, paddingVertical: 11, color: colors.fg, fontSize: 14 }}
            />
            {query.length > 0 && (
              <Pressable
                onPress={() => setQuery("")}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
              >
                <Ionicons name="close-circle" size={16} color={colors.faint} />
              </Pressable>
            )}
          </View>
        ) : null
      }
      ListEmptyComponent={
        query.trim() ? (
          <Text style={{ color: colors.muted, fontSize: 13, marginTop: 8 }}>
            No friends match “{query.trim()}”.
          </Text>
        ) : (
          <View style={{ marginTop: 8, gap: 12 }}>
            <EmptyState
              icon="people-outline"
              title="No friends yet"
              body="Follow people to see them here and to get their watches in your Activity feed."
            />
            <Bouncy
              onPress={onAdd}
              scaleTo={0.96}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 7,
                paddingVertical: 12,
                borderRadius: radius.sm,
                backgroundColor: colors.accent,
              }}
            >
              <Ionicons name="person-add" size={15} color={colors.ink} />
              <Text style={{ color: colors.ink, fontWeight: "800", fontSize: 13 }}>
                Add friends
              </Text>
            </Bouncy>
          </View>
        )
      }
      renderItem={({ item }) => (
        <UserRow
          profile={item}
          following={ids ? ids.has(item.id) : null}
          onToggle={() => toggle(item.id)}
          onOpen={onOpenUser}
        />
      )}
    />
  );
}

function FeedList({ onOpenUser }: { onOpenUser: (username: string) => void }) {
  const router = useRouter();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // Bumped on every fresh load; an in-flight loadMore whose generation is
  // stale by the time it resolves must not append its page onto the new
  // list (duplicate rows, skipped activities, wrong hasMore).
  const feedGen = useRef(0);

  const load = useCallback(async () => {
    const gen = ++feedGen.current;
    try {
      const feed = await social.getFeed();
      if (gen !== feedGen.current) return;
      setItems(feed);
      setHasMore(feed.length >= 50);
      setError(false);
    } catch {
      if (gen !== feedGen.current) return;
      setError(true); // offline/error must not masquerade as "no activity"
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  // Infinite scroll via the feed's (created_at, id) cursor.
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || items.length === 0) return;
    const gen = feedGen.current;
    setLoadingMore(true);
    try {
      const last = items[items.length - 1];
      const older = await social.getFeed({
        createdAt: last.created_at,
        id: last.id,
      });
      if (gen === feedGen.current) {
        setItems((prev) => [...prev, ...older]);
        setHasMore(older.length >= 50);
      }
    } catch {
      /* transient — the next scroll retries */
    }
    setLoadingMore(false);
  }, [loadingMore, hasMore, items]);

  useEffect(() => {
    void load();
  }, [load]);

  // Not on every render: the list grows with each page, and refreshing or
  // loading more must not re-walk it.
  const groups = useMemo(() => groupFeed(items), [items]);

  if (loading) {
    return <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />;
  }

  return (
    <FlatList
      // Grouped over the whole accumulated list, not per page, so a burst
      // that straddles a pagination boundary still collapses into one row.
      data={groups}
      keyExtractor={(g) => g.key}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: TAB_BAR_CLEARANCE, gap: 8 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load();
          }}
          tintColor={colors.accent}
        />
      }
      onEndReachedThreshold={0.4}
      onEndReached={() => void loadMore()}
      ListFooterComponent={
        loadingMore ? (
          <ActivityIndicator color={colors.accent} style={{ marginVertical: 12 }} />
        ) : null
      }
      ListEmptyComponent={
        error ? (
          <EmptyState
            icon="cloud-offline-outline"
            title="Couldn't load the feed"
            body="Check your connection and pull down to try again."
          />
        ) : (
          <EmptyState
            icon="pulse-outline"
            title="No activity yet"
            body="When you and the people you follow watch and rate episodes, it shows up here. Tap the add-friends button to get started."
          />
        )
      }
      renderItem={({ item: group }) => {
        const item = group.item;
        const name = item.display_name || item.username;
        // The whole row links somewhere useful: the episode when we have it
        // locally, otherwise the show.
        const openTarget = () => {
          if (item.show_id == null) return;
          // A collapsed run is about the show, not any one episode in it.
          if (group.count === 1 && item.season != null && item.episode != null) {
            const epId = repo.findEpisodeId(item.show_id, item.season, item.episode);
            if (epId != null) {
              router.push(`/episode/${epId}` as never);
              return;
            }
          }
          router.push(`/show/${item.show_id}` as never);
        };
        return (
          <Pressable
            onPress={openTarget}
            style={{ ...card, flexDirection: "row", gap: 12, padding: 12, alignItems: "center" }}
          >
            <Pressable onPress={() => onOpenUser(item.username)}>
              <Avatar name={name} url={item.avatar_url} size={40} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.fg, fontSize: 13 }} numberOfLines={2}>
                <Text style={{ fontFamily: fonts.displayMedium }} onPress={() => onOpenUser(item.username)}>
                  {name}
                </Text>{" "}
                <Text style={{ color: colors.muted }}>
                  {group.count > 1 ? groupActivityText(group) : feedActivityText(item)}
                </Text>
              </Text>
              <Text style={{ color: colors.faint, fontSize: 11, marginTop: 2 }}>
                {shortAgo(item.created_at)}
              </Text>
            </View>
            {item.show_id != null && (
              <Poster src={item.poster_url} name={item.show_name ?? ""} width={34} height={50} radius={6} />
            )}
          </Pressable>
        );
      }}
    />
  );
}
