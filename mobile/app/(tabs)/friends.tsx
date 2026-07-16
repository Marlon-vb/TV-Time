import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  Share,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Avatar from "@/components/Avatar";
import Bouncy from "@/components/Bouncy";
import Poster from "@/components/Poster";
import ScreenHeader from "@/components/ScreenHeader";
import { EmptyState, card } from "@/components/ui";
import { colors, fonts, radius, TAB_BAR_CLEARANCE } from "@/lib/theme";
import { useAuth } from "@/lib/social/auth";
import * as social from "@/lib/social/api";
import * as repo from "@/lib/repo";
import { feedActivityText, shortAgo } from "@/lib/format-social";
import type { FeedItem, Profile } from "@/lib/social/types";

type Tab = "feed" | "find";

export default function FriendsScreen() {
  const { session, profile, ready } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("feed");

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
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader
        title="Friends"
        subtitle={profile ? `@${profile.username}` : undefined}
      />
      <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 16, marginBottom: 8 }}>
        {(["feed", "find"] as Tab[]).map((t) => (
          <Pressable
            key={t}
            onPress={() => setTab(t)}
            style={{
              flex: 1,
              paddingVertical: 9,
              borderRadius: radius.sm,
              alignItems: "center",
              backgroundColor: tab === t ? colors.accent : colors.surface,
              borderWidth: 1,
              borderColor: tab === t ? colors.accent : colors.line,
            }}
          >
            <Text style={{ color: tab === t ? colors.ink : colors.muted, fontWeight: "800", fontSize: 13 }}>
              {t === "feed" ? "Activity" : "Find friends"}
            </Text>
          </Pressable>
        ))}
      </View>
      {tab === "feed" ? (
        <FeedList onOpenUser={(u) => router.push(`/u/${u}` as never)} />
      ) : (
        <FindFriends
          myUsername={profile?.username}
          onOpenUser={(u) => router.push(`/u/${u}` as never)}
        />
      )}
    </View>
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

  if (loading) {
    return <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />;
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(i) => i.id}
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
            body="When you and the people you follow watch and rate episodes, it shows up here. Find friends to get started."
          />
        )
      }
      renderItem={({ item }) => {
        const name = item.display_name || item.username;
        // The whole row links somewhere useful: the episode when we have it
        // locally, otherwise the show.
        const openTarget = () => {
          if (item.show_id == null) return;
          if (item.season != null && item.episode != null) {
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
                <Text style={{ color: colors.muted }}>{feedActivityText(item)}</Text>
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

function FindFriends({
  myUsername,
  onOpenUser,
}: {
  myUsername?: string;
  onOpenUser: (username: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [contacts, setContacts] = useState<
    Profile[] | "scanning" | "denied" | null
  >(null);
  const [searching, setSearching] = useState(false);
  // Who I already follow, fetched ONCE — not one round trip per result row.
  // The set is the single source of truth for every row and is updated
  // optimistically on toggle, so remounts/late fetches can't show stale state.
  const [followingIds, setFollowingIds] = useState<Set<string> | null>(null);
  const gen = useRef(0);

  useEffect(() => {
    void social.getFollowing().then((list) =>
      setFollowingIds((prev) => {
        const ids = new Set(list.map((p) => p.id));
        // A toggle may have landed while the fetch was in flight — keep it.
        if (prev) for (const id of prev) ids.add(id);
        return ids;
      })
    );
  }, []);

  const toggleFollow = (profileId: string) => {
    if (!followingIds) return;
    const isFollowing = followingIds.has(profileId);
    const next = new Set(followingIds);
    if (isFollowing) next.delete(profileId);
    else next.add(profileId);
    setFollowingIds(next);
    void (isFollowing ? social.unfollow(profileId) : social.follow(profileId)).then(
      (ok) => {
        if (ok) return;
        // Revert the optimistic flip — a silent no-op reads as a broken app.
        setFollowingIds((prev) => {
          const reverted = new Set(prev ?? []);
          if (isFollowing) reverted.add(profileId);
          else reverted.delete(profileId);
          return reverted;
        });
        Alert.alert(
          isFollowing ? "Couldn't unfollow" : "Couldn't follow",
          "Check your connection and try again."
        );
      }
    );
  };

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const g = ++gen.current;
    const timer = setTimeout(async () => {
      setSearching(true);
      const r = await social.searchProfiles(q);
      if (g === gen.current) {
        setResults(r);
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const invite = async () => {
    await Share.share({
      message: myUsername
        ? `Follow me on TV Time — I'm @${myUsername}. Got the app? Tap tvtime://u/${myUsername} — otherwise search @${myUsername} once you're in.`
        : "Join me on TV Time!",
    });
  };

  const scanContacts = async () => {
    setContacts("scanning");
    try {
      const { granted, profiles } = await social.findFriendsFromContacts();
      setContacts(granted ? profiles : "denied");
    } catch {
      setContacts(null);
      Alert.alert("Couldn't scan contacts", "Please try again.");
    }
  };

  return (
    <FlatList
      data={results}
      keyExtractor={(p) => p.id}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: TAB_BAR_CLEARANCE }}
      ListHeaderComponent={
        <View style={{ gap: 12, marginBottom: 8 }}>
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
            }}
          >
            <Ionicons name="at" size={16} color={colors.faint} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search by username"
              placeholderTextColor={colors.faint}
              autoCapitalize="none"
              autoCorrect={false}
              style={{ flex: 1, paddingVertical: 12, color: colors.fg, fontSize: 15 }}
            />
            {searching && <ActivityIndicator color={colors.accent} />}
          </View>

          <View style={{ flexDirection: "row", gap: 8 }}>
            <ActionChip icon="share-outline" label="Invite link" onPress={invite} />
            <ActionChip icon="people-outline" label="From contacts" onPress={scanContacts} />
          </View>

          {contacts === "scanning" && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <ActivityIndicator color={colors.accent} size="small" />
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                Scanning your contacts…
              </Text>
            </View>
          )}
          {contacts === "denied" && (
            <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>
              Contacts access is off. Allow it in Settings → TV Time to find
              friends from your address book.
            </Text>
          )}
          {Array.isArray(contacts) && (
            <View style={{ gap: 8 }}>
              <Text style={{ color: colors.muted, fontSize: 12, fontFamily: fonts.displayMedium }}>
                {contacts.length > 0
                  ? "In your contacts"
                  : "No contacts are on TV Time yet — invite someone!"}
              </Text>
              {contacts.map((p) => (
                <UserRow
                  key={p.id}
                  profile={p}
                  following={followingIds ? followingIds.has(p.id) : null}
                  onToggle={() => toggleFollow(p.id)}
                  onOpen={onOpenUser}
                />
              ))}
            </View>
          )}

          {query.trim().length >= 2 && results.length > 0 && (
            <Text style={{ color: colors.muted, fontSize: 12, fontFamily: fonts.displayMedium, marginTop: 4 }}>
              Results
            </Text>
          )}
        </View>
      }
      renderItem={({ item }) => (
        <UserRow
          profile={item}
          following={followingIds ? followingIds.has(item.id) : null}
          onToggle={() => toggleFollow(item.id)}
          onOpen={onOpenUser}
        />
      )}
      ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
    />
  );
}

function ActionChip({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Bouncy
      onPress={onPress}
      scaleTo={0.95}
      style={{
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        paddingVertical: 11,
        borderRadius: radius.sm,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.line,
      }}
    >
      <Ionicons name={icon} size={15} color={colors.accent} />
      <Text style={{ color: colors.fg, fontSize: 12, fontWeight: "700" }}>{label}</Text>
    </Bouncy>
  );
}

/**
 * Fully controlled: follow state lives in the parent's followingIds set, so
 * row remounts and late-resolving fetches can never show stale state or
 * clobber an optimistic toggle.
 */
function UserRow({
  profile,
  following,
  onToggle,
  onOpen,
}: {
  profile: Profile;
  /** null while the following set is still loading. */
  following: boolean | null;
  onToggle: () => void;
  onOpen: (username: string) => void;
}) {
  return (
    <View style={{ ...card, flexDirection: "row", alignItems: "center", gap: 12, padding: 10 }}>
      <Pressable onPress={() => onOpen(profile.username)}>
        <Avatar name={profile.display_name || profile.username} url={profile.avatar_url} size={40} />
      </Pressable>
      <Pressable style={{ flex: 1 }} onPress={() => onOpen(profile.username)}>
        <Text style={{ color: colors.fg, fontFamily: fonts.displayMedium, fontSize: 14 }} numberOfLines={1}>
          {profile.display_name || profile.username}
        </Text>
        <Text style={{ color: colors.faint, fontSize: 12 }}>@{profile.username}</Text>
      </Pressable>
      <Bouncy
        onPress={onToggle}
        disabled={following == null}
        scaleTo={0.92}
        accessibilityRole="button"
        accessibilityLabel={
          following ? `Unfollow ${profile.username}` : `Follow ${profile.username}`
        }
        style={{
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: radius.sm,
          backgroundColor: following ? colors.overlay : colors.accent,
          minWidth: 84,
          alignItems: "center",
          opacity: following == null ? 0.5 : 1,
        }}
      >
        <Text style={{ color: following ? colors.muted : colors.ink, fontWeight: "800", fontSize: 12 }}>
          {following == null ? "…" : following ? "Following" : "Follow"}
        </Text>
      </Bouncy>
    </View>
  );
}
