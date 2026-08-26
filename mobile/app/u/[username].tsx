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
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";
import Avatar from "@/components/Avatar";
import Bouncy from "@/components/Bouncy";
import FavoritesRail from "@/components/FavoritesRail";
import Poster from "@/components/Poster";
import { card, sectionLabel } from "@/components/ui";
import { colors, fonts, radius } from "@/lib/theme";
import { useAuth } from "@/lib/social/auth";
import * as social from "@/lib/social/api";
import { confirmBlock, reportWithFeedback } from "@/lib/social/moderation";
import { watchTimeCompact } from "@/lib/format";
import * as repo from "@/lib/repo";
import * as tvmaze from "@/lib/tvmaze";
import type { FavoriteMovie, FavoriteShow, Profile } from "@/lib/social/types";

interface ShowSummary {
  showId: number;
  episodes: number;
  name: string;
  posterUrl: string | null;
  inMyLibrary: boolean;
}

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
  const [favorites, setFavorites] = useState<FavoriteShow[]>([]);
  const [favoriteFilms, setFavoriteFilms] = useState<FavoriteMovie[]>([]);
  const [summary, setSummary] = useState<{
    totalEpisodes: number;
    totalShows: number;
    totalMinutes: number;
    top: ShowSummary[];
    inCommon: ShowSummary[];
  } | null>(null);

  const isMe = me?.username === username;

  const loadSummary = useCallback(async (userId: string) => {
    // Follower-scoped by RLS: returns [] for profiles you don't follow.
    const rows = await social.profileWatchSummary(userId);
    if (rows.length === 0) {
      setSummary(null);
      return;
    }
    const myShowIds = new Set(repo.listFollowedShowIds());
    const hydrate = async (r: { show_id: number; episodes: number }) => {
      const local = repo.getShowRow(r.show_id);
      if (local) {
        return {
          showId: r.show_id,
          episodes: r.episodes,
          name: local.name,
          posterUrl: local.poster_url,
          inMyLibrary: true,
        };
      }
      const remote = await tvmaze.getShow(r.show_id).catch(() => null);
      return {
        showId: r.show_id,
        episodes: r.episodes,
        name: remote?.name ?? "Unknown show",
        posterUrl: remote?.posterUrl ?? null,
        inMyLibrary: false,
      };
    };
    // Recency, not volume: what someone is watching now says more about them
    // than what they have accumulated the most of over the years. The counts
    // still come from the summary above — only the order changes.
    const counts = new Map(rows.map((r) => [r.show_id, r.episodes]));
    const recentIds = await social.recentlyWatchedShows(userId);
    const recentRows = recentIds
      .map((id) => ({ show_id: id, episodes: counts.get(id) ?? 0 }))
      .slice(0, 8);
    // A profile whose whole history predates the mirror has no recent rows to
    // order; fall back to the summary rather than showing an empty shelf.
    const top = await Promise.all(
      (recentRows.length > 0 ? recentRows : rows.slice(0, 8)).map(hydrate)
    );
    const inCommon = rows
      .filter((r) => myShowIds.has(r.show_id))
      .slice(0, 8)
      .map((r) => {
        const local = repo.getShowRow(r.show_id)!;
        return {
          showId: r.show_id,
          episodes: r.episodes,
          name: local.name,
          posterUrl: local.poster_url,
          inMyLibrary: true,
        };
      });
    setSummary({
      totalEpisodes: rows.reduce((n, r) => n + r.episodes, 0),
      totalShows: rows.length,
      totalMinutes: rows.reduce((n, r) => n + (r.minutes ?? 0), 0),
      top,
      inCommon,
    });
  }, []);

  const load = useCallback(async () => {
    const p = await social.getProfileByUsername(username);
    setProfile(p);
    if (!p) return;
    setCounts(await social.followCounts(p.id));
    // Not follower-scoped, unlike the watch summary below: favourites are
    // a showcase, so they read for anyone who reaches the profile.
    void social.getFavorites(p.id).then(setFavorites);
    void social.getFavoriteMovies(p.id).then(setFavoriteFilms);
    if (!isMe) {
      setFollowing(await social.isFollowing(p.id));
      setBlocked((await social.getBlockedIds()).has(p.id));
    }
    void loadSummary(p.id);
  }, [username, isMe, loadSummary]);

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
    // This screen is reachable signed-out via invite links; follow() would
    // fail with a misleading "check your connection" — point at the real fix.
    if (!me) {
      Alert.alert(
        "Sign in to follow",
        "Sign in with Apple from your Profile tab, then come back to follow friends."
      );
      return;
    }
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
  // Their number one, and only if it has wide art — a 2:3 poster cropped to a
  // header band is unusable, so no backdrop means no header rather than a bad
  // one.
  const header = favorites.find((f) => f.backdrop_url)?.backdrop_url ?? null;

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
          {/* The one picture that is genuinely theirs: whatever they put first
              on their shelf. Escapes the ScrollView's padding to run to the
              edges and up under the transparent nav bar. */}
          {header ? (
            <View
              style={{
                position: "absolute",
                left: -16,
                right: -16,
                top: -(insets.top + 56),
                height: insets.top + 56 + 150,
              }}
              pointerEvents="none"
            >
              <Image
                source={{ uri: header }}
                style={{ width: "100%", height: "100%" }}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={200}
              />
              {/* Opaque well before the name, so the type never depends on how
                  bright somebody's favourite show happens to be. */}
              <LinearGradient
                colors={["rgba(11,12,20,0.35)", "rgba(11,12,20,0.85)", colors.ink]}
                locations={[0, 0.55, 1]}
                style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
              />
            </View>
          ) : null}
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
                      message: `Follow me on TV App — I'm @${profile.username}. Got the app? Tap ${deepLink} — otherwise search @${profile.username} once you're in.`,
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

        {/* Above the watch stats: this is the part they chose to show, and
            the stats below it are only visible to followers anyway. */}
        {favorites.length > 0 && (
          <FavoritesRail
            title={isMe ? "Your favourites" : "Favourites"}
            items={favorites.map((f) => ({
              id: f.show_id,
              name: f.name,
              posterUrl: f.poster_url,
            }))}
            onOpen={(id) => router.push(`/show/${id}` as never)}
          />
        )}

        {/* Its own shelf rather than merged into the one above: tapping a
            poster has to reach the right screen, and a mixed row gives no
            hint which is which. */}
        {favoriteFilms.length > 0 && (
          <FavoritesRail
            title={isMe ? "Your favourite films" : "Favourite films"}
            items={favoriteFilms.map((f) => ({
              id: f.movie_id,
              name: f.title,
              posterUrl: f.poster_url,
            }))}
            onOpen={(id) => router.push(`/movie/${id}` as never)}
          />
        )}

        {summary ? (
          <>
            {/* Watch stats */}
            <View style={{ ...card, flexDirection: "row", padding: 14 }}>
              <ProfileStat
                value={summary.totalEpisodes.toLocaleString()}
                label="episodes"
              />
              <ProfileStat value={summary.totalShows.toLocaleString()} label="shows" />
              <ProfileStat
                value={watchTimeCompact(summary.totalMinutes)}
                label="watched"
              />
            </View>

            {/* Shows in common */}
            {summary.inCommon.length > 0 && (
              <View style={{ ...card, padding: 14, gap: 10 }}>
                <Text style={sectionLabel}>YOU BOTH WATCH</Text>
                <ShowRail shows={summary.inCommon} onOpen={(id) => router.push(`/show/${id}` as never)} />
              </View>
            )}

            {/* Top shows */}
            <View style={{ ...card, padding: 14, gap: 10 }}>
              <Text style={sectionLabel}>
                {isMe ? "YOU RECENTLY WATCHED" : "RECENTLY WATCHED"}
              </Text>
              <ShowRail shows={summary.top} onOpen={(id) => router.push(`/show/${id}` as never)} />
            </View>
          </>
        ) : !isMe && !blocked ? (
          <View style={{ ...card, padding: 16, alignItems: "center" }}>
            <Text style={{ color: colors.muted, fontSize: 12, textAlign: "center" }}>
              {following
                ? "No shared watch history yet."
                : "Follow to see their shows and watch stats."}
            </Text>
          </View>
        ) : null}
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

function ShowRail({
  shows,
  onOpen,
}: {
  shows: ShowSummary[];
  onOpen: (showId: number) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 12, paddingRight: 4 }}
    >
      {shows.map((s) => (
        <Bouncy
          key={s.showId}
          onPress={() => onOpen(s.showId)}
          scaleTo={0.94}
          accessibilityRole="button"
          accessibilityLabel={`Open ${s.name}`}
          style={{ width: 86 }}
        >
          <Poster src={s.posterUrl} name={s.name} width={86} height={124} radius={10} />
          <Text
            numberOfLines={1}
            style={{ color: colors.fg, fontSize: 11, fontFamily: fonts.displayMedium, marginTop: 5 }}
          >
            {s.name}
          </Text>
          <Text style={{ color: colors.faint, fontSize: 10 }}>
            {s.episodes} ep{s.episodes === 1 ? "" : "s"}
          </Text>
        </Bouncy>
      ))}
    </ScrollView>
  );
}

/** Formatted by the caller: one of these is a duration, not a count. */
function ProfileStat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Text
        style={{
          color: colors.fg,
          fontFamily: fonts.display,
          fontSize: 20,
          fontVariant: ["tabular-nums"],
        }}
      >
        {value}
      </Text>
      <Text style={{ color: colors.faint, fontSize: 11 }}>{label}</Text>
    </View>
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
