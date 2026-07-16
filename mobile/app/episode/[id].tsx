import { useCallback, useState } from "react";
import {
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
import Bouncy from "@/components/Bouncy";
import CheckButton from "@/components/CheckButton";
import Poster from "@/components/Poster";
import { card } from "@/components/ui";
import { colors, fonts, radius, scrimGradient } from "@/lib/theme";
import { epCode, fmtDate, fmtTime, relativeDay } from "@/lib/format";
import * as repo from "@/lib/repo";
import { getSetting } from "@/lib/db";
import { findNeighbors } from "@/lib/episodeNav";
import { episodeShareMessage } from "@/lib/share";
import { useFocusData } from "@/lib/useFocusData";
import StarRating, { ratingLabel } from "@/components/StarRating";

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
  const [revealed, setRevealed] = useState(false);

  if (!data) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: colors.muted }}>Episode not found.</Text>
      </View>
    );
  }

  const { episode, show, prev, next } = data;
  const isAired = Boolean(
    episode.airstamp && episode.airstamp <= new Date().toISOString()
  );
  const isWatched = Boolean(episode.watched_at);
  const spoilers = getSetting("spoiler_protection") !== "0";
  const hideSummary = spoilers && !isWatched && !revealed;
  const still = episode.image_url ?? show.backdrop_url ?? show.poster_url;

  const toggleWatched = (nextWatched: boolean) => {
    repo.markEpisode(episode.id, nextWatched);
    reload();
  };

  const rate = (next: number | null) => {
    repo.setRating(episode.id, next);
    reload();
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
      <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
        {/* Hero still */}
        <View style={{ height: 250 }}>
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
                </Text>
              )}
            </View>
            <Bouncy
              onPress={() => void share()}
              scaleTo={0.9}
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
              <Text
                style={{
                  color: colors.muted,
                  fontSize: 11,
                  fontFamily: fonts.displayMedium,
                  letterSpacing: 1.2,
                }}
              >
                YOUR RATING
              </Text>
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
            <Pressable
              onPress={() => hideSummary && setRevealed(true)}
              style={{ ...card, padding: 14 }}
            >
              <Text
                style={{
                  color: colors.muted,
                  fontSize: 11,
                  fontFamily: fonts.displayMedium,
                  letterSpacing: 1.2,
                }}
              >
                SYNOPSIS
              </Text>
              <Text
                style={{
                  color: hideSummary ? colors.faint : colors.muted,
                  fontSize: 13,
                  lineHeight: 20,
                  marginTop: 8,
                  fontStyle: hideSummary ? "italic" : "normal",
                }}
              >
                {hideSummary
                  ? "Spoiler hidden — tap to reveal"
                  : episode.summary}
              </Text>
            </Pressable>
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

          {/* Prev / next */}
          <View style={{ flexDirection: "row", gap: 10 }}>
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
        justifyContent: "center",
        gap: 6,
        paddingVertical: 13,
        borderRadius: radius.md,
        opacity: label ? 1 : 0.35,
      }}
    >
      {direction === "prev" && (
        <Ionicons name="chevron-back" size={14} color={colors.muted} />
      )}
      <Text style={{ color: colors.fg, fontFamily: fonts.displayMedium, fontSize: 13 }}>
        {label ?? "—"}
      </Text>
      {direction === "next" && (
        <Ionicons name="chevron-forward" size={14} color={colors.muted} />
      )}
    </Bouncy>
  );
}
