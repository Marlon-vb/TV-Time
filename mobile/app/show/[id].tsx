import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import {
  Stack,
  useLocalSearchParams,
  useRouter,
} from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Poster from "@/components/Poster";
import { ProgressBar } from "@/components/ui";
import { colors } from "@/lib/theme";
import { epCode, fmtDate } from "@/lib/format";
import * as repo from "@/lib/repo";
import * as tvmaze from "@/lib/tvmaze";
import { getSetting } from "@/lib/db";
import { rescheduleAll } from "@/lib/notifications";
import { useFocusData } from "@/lib/useFocusData";
import type { EpisodeRow, RemoteShow, ShowRow } from "@/lib/types";

export default function ShowScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const showId = Number(id);
  const router = useRouter();

  const loader = useCallback(() => {
    const show = repo.getShowRow(showId);
    return show ? { show, episodes: repo.getEpisodes(showId) } : null;
  }, [showId]);
  const { data, reload } = useFocusData(loader);

  // Not followed: fetch a live preview from TVmaze.
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

  const spoilers = getSetting("spoiler_protection") !== "0";

  const follow = async () => {
    setBusy(true);
    try {
      await repo.followShow(showId);
      await rescheduleAll();
      reload();
    } finally {
      setBusy(false);
    }
  };

  const unfollow = () => {
    Alert.alert(
      "Unfollow show?",
      "Your watch history for it will be deleted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unfollow",
          style: "destructive",
          onPress: () => {
            repo.unfollowShow(showId);
            void rescheduleAll();
            router.back();
          },
        },
      ]
    );
  };

  const change = (fn: () => void) => {
    fn();
    reload();
  };

  const show: ShowRow | null = data?.show ?? (preview ? remoteToRow(preview) : null);

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
  const genres = JSON.parse(show.genres || "[]") as string[];

  return (
    <>
      <Stack.Screen options={{ title: show.name }} />
      <ScrollView contentContainerStyle={{ padding: 14, gap: 14 }}>
        {/* Header card */}
        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: colors.line,
            padding: 14,
            flexDirection: "row",
            gap: 14,
          }}
        >
          <Poster src={show.poster_url} name={show.name} width={110} height={160} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.fg, fontSize: 19, fontWeight: "800" }}>
              {show.name}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 12, marginTop: 3 }}>
              {[
                show.premiered?.slice(0, 4),
                show.network,
                show.runtime ? `${show.runtime} min` : null,
                show.status,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
            {genres.length > 0 && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 7 }}>
                {genres.map((g) => (
                  <View
                    key={g}
                    style={{
                      backgroundColor: colors.overlay,
                      borderRadius: 999,
                      paddingHorizontal: 9,
                      paddingVertical: 2,
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
              <View style={{ marginTop: 10, gap: 4 }}>
                <Text style={{ color: colors.muted, fontSize: 11 }}>
                  <Text style={{ color: colors.fg, fontWeight: "700" }}>{watched}</Text>
                  {` / ${episodes.length} watched`}
                  {behind > 0 && (
                    <Text style={{ color: colors.accent, fontWeight: "700" }}>
                      {`   ${behind} to catch up`}
                    </Text>
                  )}
                </Text>
                <ProgressBar value={watched} max={episodes.length} />
              </View>
            )}
          </View>
        </View>

        {show.summary && (
          <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>
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
              onPress={follow}
            />
          ) : (
            <>
              {behind > 0 && (
                <ActionButton
                  label="Mark all watched"
                  primary
                  onPress={() => change(() => repo.markShow(showId, true))}
                />
              )}
              <ActionButton
                label={show.archived === 1 ? "Unarchive" : "Archive"}
                onPress={() =>
                  change(() => repo.setArchived(showId, show.archived !== 1))
                }
              />
              <ActionButton label="Unfollow" danger onPress={unfollow} />
            </>
          )}
        </View>

        {/* Seasons */}
        {followed && (
          <SeasonList
            episodes={episodes}
            spoilers={spoilers}
            onToggle={(epId, w) => change(() => repo.markEpisode(epId, w))}
            onMarkSeason={(season, w) =>
              change(() => repo.markSeason(showId, season, w))
            }
            onMarkUpTo={(epId) => change(() => repo.markUpTo(showId, epId))}
          />
        )}
        {!followed && (
          <Text style={{ color: colors.faint, fontSize: 12 }}>
            Follow this show to track episodes.
          </Text>
        )}
      </ScrollView>
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
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 10,
        backgroundColor: primary ? colors.accent : "transparent",
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
    </Pressable>
  );
}

function SeasonList({
  episodes,
  spoilers,
  onToggle,
  onMarkSeason,
  onMarkUpTo,
}: {
  episodes: EpisodeRow[];
  spoilers: boolean;
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

  return (
    <View style={{ gap: 10 }}>
      <Text style={{ color: colors.fg, fontSize: 16, fontWeight: "800" }}>
        Episodes
      </Text>
      {sorted.map(([seasonNum, eps]) => {
        const watchedCount = eps.filter((e) => e.watched_at).length;
        const allWatched = watchedCount === eps.length;
        const isOpen = openSet.has(seasonNum);
        return (
          <View
            key={seasonNum}
            style={{
              backgroundColor: colors.surface,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.line,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 12,
                paddingVertical: 11,
                gap: 10,
              }}
            >
              <Pressable
                onPress={() => toggleOpen(seasonNum)}
                style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}
              >
                <Ionicons
                  name={isOpen ? "chevron-down" : "chevron-forward"}
                  size={14}
                  color={colors.muted}
                />
                <Text style={{ color: colors.fg, fontWeight: "700", fontSize: 14 }}>
                  Season {seasonNum}
                </Text>
                <Text style={{ color: colors.faint, fontSize: 12 }}>
                  {watchedCount}/{eps.length}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => onMarkSeason(seasonNum, !allWatched)}
                style={{
                  borderWidth: 1,
                  borderColor: colors.line,
                  borderRadius: 8,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                }}
              >
                <Text style={{ color: allWatched ? colors.muted : colors.accent, fontSize: 10, fontWeight: "700" }}>
                  {allWatched ? "Unmark season" : "Mark season"}
                </Text>
              </Pressable>
            </View>

            {isOpen &&
              eps.map((ep) => (
                <EpisodeItem
                  key={ep.id}
                  ep={ep}
                  spoilers={spoilers}
                  onToggle={onToggle}
                  onMarkUpTo={onMarkUpTo}
                />
              ))}
          </View>
        );
      })}
    </View>
  );
}

function EpisodeItem({
  ep,
  spoilers,
  onToggle,
  onMarkUpTo,
}: {
  ep: EpisodeRow;
  spoilers: boolean;
  onToggle: (episodeId: number, watched: boolean) => void;
  onMarkUpTo: (episodeId: number) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const isAired = Boolean(ep.airstamp && ep.airstamp <= new Date().toISOString());
  const isWatched = Boolean(ep.watched_at);
  const hideSummary = spoilers && !isWatched && !revealed;

  return (
    <Pressable
      onLongPress={() => isAired && !isWatched && onMarkUpTo(ep.id)}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingHorizontal: 12,
        paddingVertical: 9,
        borderTopWidth: 1,
        borderTopColor: colors.line,
        opacity: isAired ? 1 : 0.55,
      }}
    >
      <Pressable
        onPress={() => isAired && onToggle(ep.id, !isWatched)}
        disabled={!isAired}
        hitSlop={6}
        style={{
          width: 30,
          height: 30,
          borderRadius: 15,
          borderWidth: 1.5,
          borderColor: isWatched ? colors.accent : colors.line,
          backgroundColor: isWatched ? colors.accent : "transparent",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons
          name="checkmark"
          size={16}
          color={isWatched ? colors.ink : colors.faint}
        />
      </Pressable>

      <View style={{ flex: 1 }}>
        <Text numberOfLines={1}>
          <Text style={{ color: colors.faint, fontSize: 11, fontWeight: "700" }}>
            {epCode(ep.season, ep.number)}
          </Text>
          <Text
            style={{
              color: isWatched ? colors.muted : colors.fg,
              fontSize: 13,
              fontWeight: "600",
            }}
          >
            {"  "}
            {ep.name || "TBA"}
          </Text>
        </Text>
        {ep.summary && (
          <Pressable onPress={() => hideSummary && setRevealed(true)}>
            <Text style={{ color: colors.faint, fontSize: 11, marginTop: 2 }} numberOfLines={2}>
              {hideSummary ? "Spoiler hidden — tap to reveal" : ep.summary}
            </Text>
          </Pressable>
        )}
      </View>

      <Text style={{ color: colors.faint, fontSize: 10 }}>
        {fmtDate(ep.airstamp)}
      </Text>
    </Pressable>
  );
}
