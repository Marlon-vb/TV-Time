import { useCallback, useRef } from "react";
import {
  PanResponder,
  Pressable,
  ScrollView,
  Share,
  Text,
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
import { findNeighbors } from "@/lib/episodeNav";
import { episodeShareMessage } from "@/lib/share";
import { useFocusData } from "@/lib/useFocusData";
import StarRating, { ratingLabel } from "@/components/StarRating";
import EpisodeSocial from "@/components/EpisodeSocial";
import CharacterVotes from "@/components/CharacterVotes";
import * as social from "@/lib/social/api";

export default function EpisodeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const episodeId = Number(id);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const loader = useCallback(() => {
    const episode = repo.getEpisode(episodeId);
    if (!episode) return null;
    const show = repo.getShowRow(episode.show_id);
    if (!show) return null;
    const neighbors = findNeighbors(repo.getEpisodes(show.id), episodeId);
    return { episode, show, ...neighbors };
  }, [episodeId]);
  const { data, reload } = useFocusData(loader);

  // Swipe the hero left/right to move between episodes. A ref holds the latest
  // neighbors so the (stable) PanResponder always sees the current episode.
  const navRef = useRef<{
    prev: { id: number } | null;
    next: { id: number } | null;
  }>({ prev: null, next: null });
  const go = (target: { id: number } | null) => {
    if (!target) return;
    void Haptics.selectionAsync();
    router.replace(`/episode/${target.id}` as never);
  };
  const heroPan = useRef(
    PanResponder.create({
      // Only claim clearly-horizontal swipes so vertical scrolling still works.
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 24 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6,
      onPanResponderRelease: (_, g) => {
        if (g.dx > 60) go(navRef.current.prev);
        else if (g.dx < -60) go(navRef.current.next);
      },
    })
  ).current;

  if (!data) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: colors.muted }}>Episode not found.</Text>
      </View>
    );
  }

  const { episode, show, prev, next } = data;
  navRef.current = { prev, next };
  const isAired = Boolean(
    episode.airstamp && episode.airstamp <= new Date().toISOString()
  );
  const isWatched = Boolean(episode.watched_at);
  const still = episode.image_url ?? show.backdrop_url ?? show.poster_url;

  const toggleWatched = (nextWatched: boolean) => {
    repo.markEpisode(episode.id, nextWatched);
    reload();
    // Mirror to the social layer (no-ops when signed out).
    if (nextWatched) {
      void social.recordWatchForEpisode(show, episode);
    } else {
      void social.unrecordWatch(show.id, episode.season, episode.number);
    }
  };

  const rate = (next: number | null) => {
    repo.setRating(episode.id, next);
    reload();
    if (next != null) {
      void social.recordWatchForEpisode(show, { ...episode, rating: next });
    } else if (isWatched) {
      // Clearing a rating must retract it from the community average too.
      void social.updateWatchRating(
        show.id,
        episode.season,
        episode.number,
        null
      );
    }
  };

  const rewatch = () => {
    repo.logRewatch(episode.id);
    reload();
    void social.recordWatchForEpisode(show, episode);
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
    <>
      <Stack.Screen options={{ title: "" }} />
      <ScrollView
        contentContainerStyle={{ paddingBottom: 48 }}
        // Keeps the comment composer visible above the keyboard.
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
      >
        {/* Hero still — swipe left/right (or tap the chevrons) to move between
            episodes. */}
        <View style={{ minHeight: 250 }} {...heroPan.panHandlers}>
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
              flex: 1,
              justifyContent: "flex-end",
              paddingHorizontal: 18,
              paddingBottom: 14,
              paddingTop: insets.top + 44,
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
          {prev && <HeroChevron side="left" onPress={() => go(prev)} />}
          {next && <HeroChevron side="right" onPress={() => go(next)} />}
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
              onToggle={toggleWatched}
            />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.fg, fontFamily: fonts.display, fontSize: 14 }}>
                {isWatched
                  ? "Watched"
                  : isAired
                    ? "Mark as watched"
                    : "Hasn't aired yet"}
              </Text>
              {isWatched && episode.watched_at && (
                <Text style={{ color: colors.faint, fontSize: 11, marginTop: 2 }}>
                  on {fmtDate(episode.watched_at)}
                  {episode.plays > 1 ? ` · watched ${episode.plays}×` : ""}
                </Text>
              )}
              {isWatched && (
                <Pressable
                  onPress={rewatch}
                  hitSlop={10}
                  accessibilityRole="button"
                  style={{ marginTop: 4 }}
                >
                  <Text style={{ color: colors.accent, fontSize: 12, fontWeight: "700" }}>
                    + Log a rewatch
                  </Text>
                </Pressable>
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
            <Poster
              src={show.poster_url}
              name={show.name}
              width={40}
              height={58}
              radius={8}
            />
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

          {/* Best character in this episode (vote + leaderboard) */}
          {isAired && (
            <CharacterVotes
              showId={show.id}
              season={episode.season}
              episode={episode.number}
            />
          )}

          {/* Social: community rating, friends who watched, comments */}
          <EpisodeSocial
            showId={show.id}
            season={episode.season}
            episode={episode.number}
          />

          {/* Prev / next */}
          <View style={{ flexDirection: "row", gap: 12 }}>
            <NeighborButton
              label={prev ? epCode(prev.season, prev.number) : null}
              direction="prev"
              onPress={() =>
                prev && router.replace(`/episode/${prev.id}` as never)
              }
            />
            <NeighborButton
              label={next ? epCode(next.season, next.number) : null}
              direction="next"
              onPress={() =>
                next && router.replace(`/episode/${next.id}` as never)
              }
            />
          </View>
        </View>
      </ScrollView>
    </>
  );
}

function NeighborButton({
  label,
  direction,
  onPress,
}: {
  label: string | null;
  direction: "prev" | "next";
  onPress: () => void;
}) {
  return (
    <Bouncy
      onPress={onPress}
      disabled={!label}
      style={{
        ...card,
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: direction === "prev" ? "flex-start" : "flex-end",
        gap: 10,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: radius.md,
        opacity: label ? 1 : 0.35,
      }}
    >
      {direction === "prev" && (
        <Ionicons name="chevron-back" size={16} color={colors.muted} />
      )}
      <View style={{ alignItems: direction === "prev" ? "flex-start" : "flex-end" }}>
        <Text
          style={{
            color: colors.faint,
            fontSize: 10,
            letterSpacing: 0.6,
            textTransform: "uppercase",
          }}
        >
          {direction === "prev" ? "Previous" : "Next"}
        </Text>
        <Text
          style={{
            color: colors.fg,
            fontFamily: fonts.displayMedium,
            fontSize: 14,
            marginTop: 1,
          }}
        >
          {label ?? "—"}
        </Text>
      </View>
      {direction === "next" && (
        <Ionicons name="chevron-forward" size={16} color={colors.muted} />
      )}
    </Bouncy>
  );
}

/** Tap target + affordance for episode paging, overlaid on the hero edges. */
function HeroChevron({
  side,
  onPress,
}: {
  side: "left" | "right";
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={side === "left" ? "Previous episode" : "Next episode"}
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        justifyContent: "center",
        ...(side === "left" ? { left: 8 } : { right: 8 }),
      }}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "rgba(11,12,20,0.5)",
          borderWidth: 1,
          borderColor: colors.lineStrong,
        }}
      >
        <Ionicons
          name={side === "left" ? "chevron-back" : "chevron-forward"}
          size={18}
          color={colors.fg}
        />
      </View>
    </Pressable>
  );
}
