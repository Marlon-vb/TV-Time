import { memo, useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Pressable,
  Share,
  Text,
  View,
} from "react-native";
import { useRef } from "react";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Bouncy from "@/components/Bouncy";
import CheckButton from "@/components/CheckButton";
import Poster from "@/components/Poster";
import { ratingLabel } from "@/components/StarRating";
import FriendsWatchedRow from "@/components/FriendsWatchedRow";
import { ProgressBar, card } from "@/components/ui";
import {
  colors,
  fonts,
  radius,
  scrimGradient,
} from "@/lib/theme";
import { epCode, fmtDate, relativeDay } from "@/lib/format";
import * as repo from "@/lib/repo";
import * as tvmaze from "@/lib/tvmaze";
import { rescheduleAll } from "@/lib/notifications";
import { showShareMessage } from "@/lib/share";
import * as social from "@/lib/social/api";
import * as mirror from "@/lib/social/mirror";
import { useFocusData } from "@/lib/useFocusData";
import type { EpisodeRow, RemoteShow, ShowRow } from "@/lib/types";

export default function ShowScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const showId = Number(id);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollY = useRef(new Animated.Value(0)).current;

  const loader = useCallback(() => {
    const show = repo.getShowRow(showId);
    return show ? { show, episodes: repo.getEpisodes(showId) } : null;
  }, [showId]);
  const { data, reload } = useFocusData(loader);

  const [preview, setPreview] = useState<RemoteShow | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const followed = data !== null;

  useEffect(() => {
    if (data === null && !preview && !previewFailed) {
      void tvmaze
        .getShowWithEpisodes(showId)
        .then((r) => (r ? setPreview(r.show) : setPreviewFailed(true)))
        .catch(() => setPreviewFailed(true));
    }
  }, [data, preview, previewFailed, showId]);

  const follow = async () => {
    setBusy(true);
    try {
      await repo.followShow(showId);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await rescheduleAll();
      reload();
    } finally {
      setBusy(false);
    }
  };

  const unfollow = () => {
    Alert.alert("Unfollow show?", "Your watch history for it will be deleted.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Unfollow",
        style: "destructive",
        onPress: () => {
          repo.unfollowShow(showId);
          // The promise above extends to the server: clear the mirrored
          // history and this show's feed rows (no-op signed out).
          void social.deleteWatchedForShow(showId);
          void rescheduleAll();
          router.back();
        },
      },
    ]);
  };

  // Plain local change (used by archive — no watch state touched).
  const change = (fn: () => void) => {
    fn();
    reload();
  };

  // Bulk watch-state change: also batch-sync this show to the social layer —
  // silent (no feed activities), so marking a season doesn't spam friends.
  const bulkChange = (fn: () => void) => {
    fn();
    reload();
    mirror.reconcileShow(showId);
  };


  const show: ShowRow | null =
    data?.show ?? (preview ? remoteToRow(preview) : null);

  if (!show) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        {previewFailed ? (
          <Text style={{ color: colors.muted }}>Show not found.</Text>
        ) : (
          <ActivityIndicator color={colors.accent} />
        )}
      </View>
    );
  }

  const episodes = data?.episodes ?? [];
  const nowIso = new Date().toISOString();
  const aired = episodes.filter((e) => e.airstamp && e.airstamp <= nowIso);
  const watched = episodes.filter((e) => e.watched_at).length;
  const behind = aired.filter((e) => !e.watched_at).length;

  // Renewal / next-episode line (the "is it coming back?" answer).
  const nextEp = episodes.find((e) => e.airstamp && e.airstamp > nowIso);
  const renewalLine = nextEp
    ? `Returning · next episode ${relativeDay(nextEp.airstamp)}`
    : show.status === "Ended"
      ? "This show has ended"
      : show.status === "Running" || show.status === "To Be Determined"
        ? "Awaiting a new episode date"
        : null;
  const genres = JSON.parse(show.genres || "[]") as string[];
  const backdrop = show.backdrop_url ?? show.poster_url;

  // Single episode toggle: mirrors like the episode screen (with a feed
  // activity) instead of a full-show reconcile.
  const toggleEpisode = (epId: number, isWatched: boolean) => {
    repo.markEpisode(epId, isWatched);
    reload();
    const ep = repo.getEpisode(epId);
    if (!ep) return;
    if (isWatched) {
      void social.recordWatchForEpisode(show, ep);
    } else {
      void social.unrecordWatch(show.id, ep.season, ep.number);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: "" }} />
      <Animated.ScrollView
        contentContainerStyle={{ paddingBottom: 48 }}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
      >
        {/* Cinematic hero: blurred artwork stretches on pull and drifts on scroll */}
        <View style={{ minHeight: 330 }}>
          <Animated.View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              transform: [
                {
                  translateY: scrollY.interpolate({
                    inputRange: [-330, 0, 330],
                    outputRange: [-165, 0, 165],
                  }),
                },
                {
                  scale: scrollY.interpolate({
                    inputRange: [-330, 0],
                    outputRange: [2, 1],
                    extrapolateRight: "clamp",
                  }),
                },
              ],
            }}
          >
            {backdrop && (
              <Image
                source={{ uri: backdrop }}
                blurRadius={26}
                contentFit="cover"
                cachePolicy="disk"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  opacity: 0.55,
                }}
              />
            )}
          </Animated.View>
          <LinearGradient
            colors={scrimGradient}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
            }}
          />
          <View
            style={{
              paddingTop: insets.top + 54,
              paddingHorizontal: 18,
              paddingBottom: 18,
              flexDirection: "row",
              gap: 16,
              alignItems: "flex-end",
              flex: 1,
            }}
          >
            <Poster
              src={show.poster_url}
              name={show.name}
              width={118}
              height={172}
              radius={radius.md}
            />
            <View style={{ flex: 1, gap: 6 }}>
              <Text
                style={{
                  color: colors.fg,
                  fontSize: 25,
                  fontFamily: fonts.display,
                  letterSpacing: -0.4,
                  lineHeight: 29,
                }}
              >
                {show.name}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                {[
                  show.premiered?.slice(0, 4),
                  show.network,
                  show.runtime ? `${show.runtime} min` : null,
                  show.status,
                ]
                  .filter(Boolean)
                  .join("  ·  ")}
              </Text>
              {genres.length > 0 && (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5 }}>
                  {genres.slice(0, 3).map((g) => (
                    <View
                      key={g}
                      style={{
                        backgroundColor: "rgba(255,255,255,0.08)",
                        borderWidth: 1,
                        borderColor: colors.line,
                        borderRadius: 999,
                        paddingHorizontal: 10,
                        paddingVertical: 3,
                      }}
                    >
                      <Text style={{ color: colors.fg, fontSize: 10, fontWeight: "600" }}>
                        {g}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
              {followed && episodes.length > 0 && (
                <View style={{ gap: 5, marginTop: 4 }}>
                  <Text style={{ color: colors.muted, fontSize: 11 }}>
                    <Text style={{ color: colors.fg, fontFamily: fonts.displayMedium }}>
                      {watched}
                    </Text>
                    {` / ${episodes.length} watched`}
                    {behind > 0 && (
                      <Text style={{ color: colors.accent, fontFamily: fonts.displayMedium }}>
                        {`   ${behind} to catch up`}
                      </Text>
                    )}
                  </Text>
                  <ProgressBar value={watched} max={episodes.length} />
                </View>
              )}
            </View>
          </View>
        </View>

        <View style={{ paddingHorizontal: 18, gap: 16 }}>
          {show.summary && (
            <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 20 }}>
              {show.summary}
            </Text>
          )}

          {/* Actions */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {!followed ? (
              <ActionButton
                label={busy ? "Following…" : "+ Follow this show"}
                primary
                disabled={busy}
                onPress={() => void follow()}
              />
            ) : (
              <>
                {behind > 0 && (
                  <ActionButton
                    label="Mark all watched"
                    primary
                    onPress={() => {
                      Alert.alert(
                        "Mark all watched?",
                        `This marks all ${behind} remaining aired episode${behind === 1 ? "" : "s"} as watched.`,
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Mark all",
                            onPress: () => {
                              void Haptics.impactAsync(
                                Haptics.ImpactFeedbackStyle.Medium
                              );
                              bulkChange(() => repo.markShow(showId, true));
                            },
                          },
                        ]
                      );
                    }}
                  />
                )}
                {behind === 0 && watched > 0 && (
                  <ActionButton
                    label="Log a rewatch"
                    onPress={() => {
                      Alert.alert(
                        "Log a rewatch?",
                        `This adds one more watch to every aired episode (${watched} episodes) and moves them to today.`,
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Log rewatch",
                            onPress: () => {
                              void Haptics.impactAsync(
                                Haptics.ImpactFeedbackStyle.Medium
                              );
                              bulkChange(() => repo.rewatchShow(showId));
                            },
                          },
                        ]
                      );
                    }}
                  />
                )}
                <ActionButton
                  label={show.archived === 1 ? "Unarchive" : "Archive"}
                  onPress={() =>
                    change(() => repo.setArchived(showId, show.archived !== 1))
                  }
                />
                <ActionButton
                  label="Share"
                  onPress={() =>
                    void Share.share({
                      message: showShareMessage({
                        showName: show.name,
                        watched,
                        total: episodes.length,
                      }),
                    })
                  }
                />
                <ActionButton label="Unfollow" danger onPress={unfollow} />
              </>
            )}
          </View>

          {/* Renewal / next episode */}
          {renewalLine && (
            <View style={{ ...card, flexDirection: "row", alignItems: "center", gap: 8, padding: 12 }}>
              <Ionicons
                name={nextEp ? "calendar" : show.status === "Ended" ? "checkmark-done" : "time"}
                size={16}
                color={colors.accent}
              />
              <Text style={{ color: colors.fg, fontSize: 13 }}>{renewalLine}</Text>
            </View>
          )}

          {/* Friends who watched this show */}
          {followed && <FriendsWatchedRow showId={show.id} />}

          {/* Seasons */}
          {followed ? (
            <SeasonList
              episodes={episodes}
              onToggle={toggleEpisode}
              onMarkSeason={(season, w) => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                bulkChange(() => repo.markSeason(showId, season, w));
              }}
              onMarkUpTo={(epId) => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                bulkChange(() => repo.markUpTo(showId, epId));
              }}
            />
          ) : (
            <Text style={{ color: colors.faint, fontSize: 12 }}>
              Follow this show to track episodes.
            </Text>
          )}
        </View>
      </Animated.ScrollView>
    </>
  );
}

function remoteToRow(r: RemoteShow): ShowRow {
  return {
    id: r.id,
    name: r.name,
    tvdb_id: r.tvdbId,
    imdb_id: r.imdbId,
    tmdb_id: null,
    poster_url: r.posterUrl,
    backdrop_url: r.backdropUrl,
    status: r.status,
    network: r.network,
    runtime: r.runtime,
    premiered: r.premiered,
    genres: JSON.stringify(r.genres),
    summary: r.summary,
    followed_at: "",
    archived: 0,
    last_synced_at: null,
  };
}

function ActionButton({
  label,
  onPress,
  primary = false,
  danger = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <Bouncy
      onPress={onPress}
      disabled={disabled}
      scaleTo={0.94}
      style={{
        paddingHorizontal: 15,
        paddingVertical: 11,
        borderRadius: radius.sm,
        backgroundColor: primary ? colors.accent : colors.surface,
        borderWidth: primary ? 0 : 1,
        borderColor: danger ? "rgba(255,92,114,0.4)" : colors.line,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text
        style={{
          color: primary ? colors.ink : danger ? colors.danger : colors.muted,
          fontWeight: "700",
          fontSize: 13,
        }}
      >
        {label}
      </Text>
    </Bouncy>
  );
}

function SeasonList({
  episodes,
  onToggle,
  onMarkSeason,
  onMarkUpTo,
}: {
  episodes: EpisodeRow[];
  onToggle: (episodeId: number, watched: boolean) => void;
  onMarkSeason: (season: number, watched: boolean) => void;
  onMarkUpTo: (episodeId: number) => void;
}) {
  const seasons = new Map<number, EpisodeRow[]>();
  for (const ep of episodes) {
    if (!seasons.has(ep.season)) seasons.set(ep.season, []);
    seasons.get(ep.season)!.push(ep);
  }
  const sorted = [...seasons.entries()].sort((a, b) => a[0] - b[0]);

  const nowIso = new Date().toISOString();
  let defaultOpen: number | null = null;
  for (const [num, eps] of sorted) {
    if (eps.some((e) => !e.watched_at && e.airstamp && e.airstamp <= nowIso)) {
      defaultOpen = num;
      break;
    }
  }
  if (defaultOpen === null && sorted.length) {
    defaultOpen = sorted[sorted.length - 1][0];
  }

  const [open, setOpen] = useState<Set<number> | null>(null);
  const openSet = open ?? new Set(defaultOpen != null ? [defaultOpen] : []);
  const toggleOpen = (season: number) => {
    const next = new Set(openSet);
    if (next.has(season)) next.delete(season);
    else next.add(season);
    setOpen(next);
  };
  // Long seasons render lazily: the ScrollView isn't virtualized, so a
  // 100-episode season would mount 100 rows at once and jank the open. The
  // window starts at the first unwatched aired episode (the row the user
  // came for), with incremental expanders in both directions.
  const EPISODE_PAGE = 30;
  const [extraRows, setExtraRows] = useState<Map<number, number>>(new Map());
  const [showEarlier, setShowEarlier] = useState<Set<number>>(new Set());

  return (
    <View style={{ gap: 10 }}>
      <Text style={{ color: colors.fg, fontSize: 18, fontFamily: fonts.display }}>
        Episodes
      </Text>
      {sorted.map(([seasonNum, eps]) => {
        const watchedCount = eps.filter((e) => e.watched_at).length;
        // "All watched" means all *aired* episodes are watched — a mid-air
        // season with future episodes announced can still be fully caught up.
        // A season with only phantom watches (unaired-but-marked rows from an
        // older build/import) counts as watched too, so UNMARK stays
        // reachable and can clear them.
        const airedEps = eps.filter((e) => e.airstamp && e.airstamp <= nowIso);
        const airedWatched = airedEps.filter((e) => e.watched_at).length;
        const allWatched =
          airedEps.length > 0
            ? airedWatched === airedEps.length
            : watchedCount > 0;
        const seasonEmpty = airedEps.length === 0 && watchedCount === 0;
        const isOpen = openSet.has(seasonNum);
        return (
          <View key={seasonNum} style={{ ...card, overflow: "hidden" }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 14,
                paddingVertical: 12,
                gap: 10,
              }}
            >
              <Pressable
                onPress={() => toggleOpen(seasonNum)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  flex: 1,
                }}
              >
                <Ionicons
                  name={isOpen ? "chevron-down" : "chevron-forward"}
                  size={14}
                  color={colors.muted}
                />
                <Text style={{ color: colors.fg, fontFamily: fonts.display, fontSize: 14 }}>
                  Season {seasonNum}
                </Text>
                <Text style={{ color: colors.faint, fontSize: 12, fontFamily: fonts.displayMedium }}>
                  {watchedCount}/{eps.length}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => onMarkSeason(seasonNum, !allWatched)}
                disabled={seasonEmpty}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={
                  allWatched
                    ? `Unmark season ${seasonNum}`
                    : `Mark season ${seasonNum} watched`
                }
                style={{
                  borderWidth: 1,
                  borderColor: allWatched ? colors.line : "rgba(251,215,55,0.35)",
                  borderRadius: 8,
                  paddingHorizontal: 9,
                  paddingVertical: 5,
                  opacity: seasonEmpty ? 0.35 : 1,
                }}
              >
                <Text
                  style={{
                    color: allWatched ? colors.muted : colors.accent,
                    fontSize: 10,
                    fontWeight: "700",
                  }}
                >
                  {allWatched ? "UNMARK" : "MARK SEASON"}
                </Text>
              </Pressable>
            </View>

            {isOpen &&
              (() => {
                // Window: start at the first unwatched aired episode (minus
                // a little context) so the actionable row is always visible.
                const firstUnwatched = eps.findIndex(
                  (e) => !e.watched_at && e.airstamp && e.airstamp <= nowIso
                );
                const anchor = firstUnwatched === -1 ? 0 : firstUnwatched;
                const start = showEarlier.has(seasonNum)
                  ? 0
                  : Math.max(
                      0,
                      Math.min(anchor - 3, eps.length - EPISODE_PAGE)
                    );
                const visibleCount =
                  EPISODE_PAGE + (extraRows.get(seasonNum) ?? 0);
                const end = Math.min(eps.length, start + visibleCount);
                const hiddenBelow = eps.length - end;
                return (
                  <>
                    {start > 0 && (
                      <SeasonExpander
                        label={`Show first ${start} episodes`}
                        onPress={() =>
                          setShowEarlier(new Set([...showEarlier, seasonNum]))
                        }
                      />
                    )}
                    {eps.slice(start, end).map((ep) => (
                      <EpisodeItem
                        key={ep.id}
                        ep={ep}
                        onToggle={onToggle}
                        onMarkUpTo={onMarkUpTo}
                      />
                    ))}
                    {hiddenBelow > 0 && (
                      <SeasonExpander
                        label={`Show ${Math.min(hiddenBelow, EPISODE_PAGE)} more (${hiddenBelow} left)`}
                        onPress={() =>
                          setExtraRows(
                            new Map(extraRows).set(
                              seasonNum,
                              (extraRows.get(seasonNum) ?? 0) + EPISODE_PAGE
                            )
                          )
                        }
                      />
                    )}
                  </>
                );
              })()}
          </View>
        );
      })}
      <Text style={{ color: colors.faint, fontSize: 11, textAlign: "center" }}>
        Tip: long-press an episode to mark everything up to it as watched
      </Text>
    </View>
  );
}

function SeasonExpander({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{
        paddingVertical: 12,
        alignItems: "center",
        borderTopWidth: 1,
        borderTopColor: colors.line,
      }}
    >
      <Text style={{ color: colors.accent, fontSize: 12, fontWeight: "700" }}>
        {label}
      </Text>
    </Pressable>
  );
}

// Memoized: expanding a season's window must not re-render every already-
// mounted row in every open season.
const EpisodeItem = memo(function EpisodeItem({
  ep,
  onToggle,
  onMarkUpTo,
}: {
  ep: EpisodeRow;
  onToggle: (episodeId: number, watched: boolean) => void;
  onMarkUpTo: (episodeId: number) => void;
}) {
  const isAired = Boolean(
    ep.airstamp && ep.airstamp <= new Date().toISOString()
  );
  const isWatched = Boolean(ep.watched_at);

  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push(`/episode/${ep.id}` as never)}
      onLongPress={() => isAired && !isWatched && onMarkUpTo(ep.id)}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderTopWidth: 1,
        borderTopColor: colors.line,
        opacity: isAired ? 1 : 0.5,
      }}
    >
      <CheckButton
        checked={isWatched}
        disabled={!isAired}
        size={32}
        onToggle={(next) => onToggle(ep.id, next)}
      />

      <View style={{ flex: 1 }}>
        <Text numberOfLines={1}>
          <Text
            style={{
              color: colors.faint,
              fontSize: 11,
              fontFamily: fonts.displayMedium,
            }}
          >
            {epCode(ep.season, ep.number)}
          </Text>
          <Text
            style={{
              color: isWatched ? colors.muted : colors.fg,
              fontSize: 13,
              fontWeight: "600",
            }}
          >
            {"   "}
            {ep.name || "TBA"}
          </Text>
        </Text>
        {ep.summary && (
          <Text
            style={{
              color: colors.faint,
              fontSize: 11,
              marginTop: 2,
              lineHeight: 15,
            }}
            numberOfLines={2}
          >
            {ep.summary}
          </Text>
        )}
      </View>

      <View style={{ alignItems: "flex-end", gap: 2 }}>
        {ep.rating != null && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
            <Ionicons name="star" size={11} color={colors.accent} />
            <Text style={{ color: colors.accent, fontSize: 11, fontWeight: "700" }}>
              {ratingLabel(ep.rating)}
            </Text>
          </View>
        )}
        <Text style={{ color: colors.faint, fontSize: 10 }}>
          {fmtDate(ep.airstamp)}
        </Text>
      </View>
    </Pressable>
  );
});
