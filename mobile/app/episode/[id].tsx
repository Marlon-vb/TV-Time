import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  ScrollView,
  Share,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Bouncy from "@/components/Bouncy";
import CheckButton from "@/components/CheckButton";
import Poster from "@/components/Poster";
import { card, sectionLabel } from "@/components/ui";
import { colors, fonts, radius, scrimGradient } from "@/lib/theme";
import { epCode, fmtDate, fmtTime, relativeDay } from "@/lib/format";
import * as repo from "@/lib/repo";
import { episodeShareMessage } from "@/lib/share";
import { useFocusData } from "@/lib/useFocusData";
import StarRating, { ratingLabel } from "@/components/StarRating";
import EpisodeSocial from "@/components/EpisodeSocial";
import CharacterVotes from "@/components/CharacterVotes";
import * as social from "@/lib/social/api";
import type { EpisodeRow, ShowRow } from "@/lib/types";

/**
 * A full-screen horizontal pager over the show's episodes — swipe anywhere to
 * move between episodes with native scroll-paging. Only the visible page mounts
 * its social/votes sections, so a long show stays cheap.
 */
export default function EpisodeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const episodeId = Number(id);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  // The show and its episodes in broadcast order — loaded once per arrival.
  const data = useMemo(() => {
    const episode = repo.getEpisode(episodeId);
    if (!episode) return null;
    const show = repo.getShowRow(episode.show_id);
    if (!show) return null;
    const episodes = [...repo.getEpisodes(show.id)].sort(
      (a, b) => a.season - b.season || a.number - b.number
    );
    const index = Math.max(
      0,
      episodes.findIndex((e) => e.id === episodeId)
    );
    return { show, episodes, index };
  }, [episodeId]);

  const listRef = useRef<FlatList<EpisodeRow>>(null);
  const [active, setActive] = useState(data?.index ?? 0);
  const lastId = useRef(episodeId);

  // Re-sync the pager when arriving at a different episode via the route.
  useEffect(() => {
    if (!data || lastId.current === episodeId) return;
    lastId.current = episodeId;
    setActive(data.index);
    requestAnimationFrame(() => {
      try {
        listRef.current?.scrollToIndex({ index: data.index, animated: false });
      } catch {
        /* index not laid out yet — initialScrollIndex covers first mount */
      }
    });
  }, [episodeId, data]);

  if (!data) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: colors.muted }}>Episode not found.</Text>
      </View>
    );
  }

  const { show, episodes, index } = data;

  const goTo = (target: number) => {
    if (target < 0 || target >= episodes.length) return;
    void Haptics.selectionAsync();
    listRef.current?.scrollToIndex({ index: target, animated: true });
  };

  return (
    <>
      <Stack.Screen options={{ title: "" }} />
      <FlatList
        ref={listRef}
        style={{ flex: 1 }}
        data={episodes}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(e) => String(e.id)}
        initialScrollIndex={index}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        windowSize={3}
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        onMomentumScrollEnd={(e) =>
          setActive(Math.round(e.nativeEvent.contentOffset.x / width))
        }
        renderItem={({ item, index: i }) => (
          <EpisodePage
            source={item}
            show={show}
            active={i === active}
            width={width}
            insetTop={insets.top}
            hasPrev={i > 0}
            hasNext={i < episodes.length - 1}
            onGoTo={(dir) => goTo(i + dir)}
          />
        )}
      />
    </>
  );
}

/* ------------------------------------------------------------- one episode */

function EpisodePage({
  source,
  show,
  active,
  width,
  insetTop,
  hasPrev,
  hasNext,
  onGoTo,
}: {
  source: EpisodeRow;
  show: ShowRow;
  active: boolean;
  width: number;
  insetTop: number;
  hasPrev: boolean;
  hasNext: boolean;
  onGoTo: (dir: -1 | 1) => void;
}) {
  const router = useRouter();
  const heroHeight = Math.round(width * 0.9);

  // Live copy of this episode's row so watched/rating changes reflect at once
  // (and it refreshes when the screen regains focus).
  const loader = useCallback(() => repo.getEpisode(source.id), [source.id]);
  const { data, reload } = useFocusData(loader);
  const episode = data ?? source;

  const isAired = Boolean(
    episode.airstamp && episode.airstamp <= new Date().toISOString()
  );
  const isWatched = Boolean(episode.watched_at);
  const still = episode.image_url ?? show.backdrop_url ?? show.poster_url;

  const toggleWatched = (nextWatched: boolean) => {
    repo.markEpisode(episode.id, nextWatched);
    reload();
    if (nextWatched) void social.recordWatchForEpisode(show, episode);
    else void social.unrecordWatch(show.id, episode.season, episode.number);
  };

  const rate = (next: number | null) => {
    repo.setRating(episode.id, next);
    reload();
    if (next != null) {
      void social.recordWatchForEpisode(show, { ...episode, rating: next });
    } else if (isWatched) {
      void social.updateWatchRating(show.id, episode.season, episode.number, null);
    }
  };

  const rewatch = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    repo.logRewatch(episode.id);
    reload();
    void social.recordWatchForEpisode(show, episode);
  };

  const undoRewatch = () => {
    void Haptics.selectionAsync();
    repo.removeRewatch(episode.id);
    reload();
  };

  // Tapping the check logs a watch; if already watched, that's a rewatch.
  const onCheckPress = (next: boolean) => {
    if (isWatched) rewatch();
    else toggleWatched(next);
  };

  const share = async () => {
    await Share.share({
      message: episodeShareMessage({
        showName: show.name,
        season: episode.season,
        number: episode.number,
        episodeName: episode.name,
        rating: episode.rating,
        watched: isWatched,
      }),
    });
  };

  return (
    <ScrollView
      style={{ width }}
      contentContainerStyle={{ paddingBottom: 48 }}
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      directionalLockEnabled
    >
      {/* Hero still */}
      <View style={{ minHeight: heroHeight }}>
        {still && (
          <Image
            source={{ uri: still }}
            contentFit="cover"
            cachePolicy="disk"
            blurRadius={episode.image_url ? 0 : 22}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              opacity: episode.image_url ? 0.9 : 0.5,
            }}
          />
        )}
        <LinearGradient
          colors={scrimGradient}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <View
          style={{
            flex: 1,
            justifyContent: "flex-end",
            paddingHorizontal: 18,
            paddingBottom: 14,
            paddingTop: insetTop + 44,
          }}
        >
          <Text
            style={{
              color: colors.accent,
              fontFamily: fonts.displayMedium,
              fontSize: 13,
              letterSpacing: 1,
            }}
          >
            {show.name.toUpperCase()} · {epCode(episode.season, episode.number)}
          </Text>
          <Text
            numberOfLines={2}
            style={{
              color: colors.fg,
              fontFamily: fonts.display,
              fontSize: 24,
              letterSpacing: -0.4,
              marginTop: 3,
            }}
          >
            {episode.name || "TBA"}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 12, marginTop: 5 }}>
            {[
              episode.airstamp
                ? `${isAired ? "Aired" : "Airs"} ${relativeDay(episode.airstamp)} (${fmtDate(episode.airstamp)}, ${fmtTime(episode.airstamp)})`
                : "Air date TBA",
              episode.runtime ? `${episode.runtime} min` : null,
              show.network,
            ]
              .filter(Boolean)
              .join("  ·  ")}
          </Text>
          {episode.community_rating != null && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                marginTop: 7,
              }}
            >
              <Ionicons name="star" size={13} color={colors.accent} />
              <Text
                style={{
                  color: colors.fg,
                  fontSize: 13,
                  fontFamily: fonts.displayMedium,
                }}
              >
                {episode.community_rating.toFixed(1)}
              </Text>
              <Text style={{ color: colors.faint, fontSize: 11 }}>
                / 10 · viewer rating
              </Text>
            </View>
          )}
        </View>
      </View>

      <View style={{ paddingHorizontal: 18, gap: 12, marginTop: 14 }}>
        {/* Watched + share row */}
        <View
          style={{
            ...card,
            flexDirection: "row",
            alignItems: "center",
            gap: 14,
            padding: 14,
          }}
        >
          <CheckButton
            checked={isWatched}
            disabled={!isAired}
            size={48}
            onToggle={onCheckPress}
          />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.fg, fontFamily: fonts.display, fontSize: 14 }}>
              {isWatched
                ? episode.plays > 1
                  ? `Watched ${episode.plays}×`
                  : "Watched"
                : isAired
                  ? "Mark as watched"
                  : "Hasn't aired yet"}
            </Text>
            {isWatched && episode.watched_at && (
              <Text style={{ color: colors.faint, fontSize: 11, marginTop: 2 }}>
                on {fmtDate(episode.watched_at)}
                {episode.plays > 1 ? "" : " · tap ✓ to log a rewatch"}
              </Text>
            )}
            {isWatched && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16, marginTop: 5 }}>
                {episode.plays > 1 && (
                  <Pressable
                    onPress={undoRewatch}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel="Undo a rewatch"
                  >
                    <Text style={{ color: colors.accent, fontSize: 12, fontWeight: "700" }}>
                      Undo a rewatch
                    </Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={() => toggleWatched(false)}
                  hitSlop={10}
                  accessibilityRole="button"
                >
                  <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>
                    Mark as unwatched
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
          <Bouncy
            onPress={() => void share()}
            scaleTo={0.9}
            accessibilityRole="button"
            accessibilityLabel="Share this episode"
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: colors.raised,
              borderWidth: 1,
              borderColor: colors.line,
            }}
          >
            <Ionicons name="share-outline" size={18} color={colors.fg} />
          </Bouncy>
        </View>

        {/* Your rating */}
        <View style={{ ...card, padding: 14 }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Text style={sectionLabel}>YOUR RATING</Text>
            {episode.rating != null && (
              <Text style={{ color: colors.accent, fontFamily: fonts.display, fontSize: 15 }}>
                {ratingLabel(episode.rating)}
                <Text style={{ color: colors.faint, fontSize: 12 }}> / 5</Text>
              </Text>
            )}
          </View>
          <View style={{ marginTop: 12, alignItems: "center" }}>
            <StarRating value={episode.rating} onChange={rate} size={38} />
          </View>
        </View>

        {/* Synopsis */}
        {episode.summary && (
          <View style={{ ...card, padding: 14 }}>
            <Text style={sectionLabel}>SYNOPSIS</Text>
            <Text
              style={{
                color: colors.muted,
                fontSize: 13,
                lineHeight: 20,
                marginTop: 8,
              }}
            >
              {episode.summary}
            </Text>
          </View>
        )}

        {/* View show */}
        <Bouncy
          onPress={() => router.push(`/show/${show.id}` as never)}
          style={{
            ...card,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            padding: 10,
          }}
        >
          <Poster src={show.poster_url} name={show.name} width={40} height={58} radius={8} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.fg, fontFamily: fonts.display, fontSize: 14 }}>
              {show.name}
            </Text>
            <Text style={{ color: colors.faint, fontSize: 11, marginTop: 1 }}>
              View show & all episodes
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.faint} />
        </Bouncy>

        {/* Heavy sections only mount for the page you're on. */}
        {active && isAired && (
          <CharacterVotes
            showId={show.id}
            season={episode.season}
            episode={episode.number}
          />
        )}
        {active && (
          <EpisodeSocial
            showId={show.id}
            season={episode.season}
            episode={episode.number}
            showName={show.name}
            posterUrl={show.poster_url}
            episodeName={episode.name}
          />
        )}

        {/* Prev / next */}
        <View style={{ flexDirection: "row", gap: 12 }}>
          <NeighborButton
            direction="prev"
            enabled={hasPrev}
            onPress={() => onGoTo(-1)}
          />
          <NeighborButton
            direction="next"
            enabled={hasNext}
            onPress={() => onGoTo(1)}
          />
        </View>
      </View>
    </ScrollView>
  );
}

function NeighborButton({
  direction,
  enabled,
  onPress,
}: {
  direction: "prev" | "next";
  enabled: boolean;
  onPress: () => void;
}) {
  return (
    <Bouncy
      onPress={onPress}
      disabled={!enabled}
      style={{
        ...card,
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: direction === "prev" ? "flex-start" : "flex-end",
        gap: 8,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: radius.md,
        opacity: enabled ? 1 : 0.35,
      }}
    >
      {direction === "prev" && (
        <Ionicons name="chevron-back" size={16} color={colors.muted} />
      )}
      <Text
        style={{
          color: colors.fg,
          fontFamily: fonts.displayMedium,
          fontSize: 14,
        }}
      >
        {direction === "prev" ? "Previous" : "Next"}
      </Text>
      {direction === "next" && (
        <Ionicons name="chevron-forward" size={16} color={colors.muted} />
      )}
    </Bouncy>
  );
}
