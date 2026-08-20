import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Avatar from "@/components/Avatar";
import Bouncy from "@/components/Bouncy";
import Poster from "@/components/Poster";
import { EmptyState } from "@/components/ui";
import { colors, radius } from "@/lib/theme";
import { useAuth } from "@/lib/social/auth";
import * as repo from "@/lib/repo";
import * as tvmaze from "@/lib/tvmaze";
import { filterShows } from "@/lib/show-sort";
import type { CastMember } from "@/lib/tvmaze";
import type { ShowWithProgress } from "@/lib/types";

/**
 * Pick a profile picture from a show you follow, or from one of its
 * characters.
 *
 * Both are TVmaze URLs, stored as-is. Nothing is uploaded, nothing sits in our
 * storage and nothing is served from it, so an avatar costs the same at a
 * million accounts as at ten — where a photo per account would be a bucket,
 * an upload path and egress on every profile anyone opens.
 */
type Mode = "shows" | "characters";

type Cell =
  | { kind: "show"; key: string; url: string; label: string; show: ShowWithProgress }
  | { kind: "character"; key: string; url: string; label: string; sub: string };

export default function ChooseAvatarScreen() {
  const router = useRouter();
  const { profile, setAvatar } = useAuth();
  const { width } = useWindowDimensions();
  const [mode, setMode] = useState<Mode>("shows");
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  // Characters need a show first: TVmaze serves a cast per show, and fetching
  // every followed show's cast to build one flat list would be dozens of
  // requests to fill a grid nobody asked for yet.
  const [castShow, setCastShow] = useState<ShowWithProgress | null>(null);
  const [cast, setCast] = useState<CastMember[] | null>(null);
  const [castFailed, setCastFailed] = useState(false);
  // One fetch per show per visit; flicking between two shows should not
  // re-request either of them.
  const castCache = useRef(new Map<number, CastMember[]>());

  // Three across, matching the Library grid: 16pt outer padding, two 10pt gaps.
  const cell = (width - 32 - 20) / 3;

  const shows = useMemo(() => repo.listShowsWithProgress(), []);
  const withPosters = useMemo(
    () => shows.filter((s) => s.poster_url),
    [shows]
  );

  useEffect(() => {
    if (!castShow) return;
    const cached = castCache.current.get(castShow.id);
    if (cached) {
      setCast(cached);
      return;
    }
    let alive = true;
    setCast(null);
    setCastFailed(false);
    tvmaze
      .getCast(castShow.id)
      .then((members) => {
        if (!alive) return;
        castCache.current.set(castShow.id, members);
        setCast(members);
      })
      .catch(() => {
        if (alive) setCastFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [castShow]);

  const choose = useCallback(
    async (url: string | null) => {
      setSaving(url ?? "none");
      const ok = await setAvatar(url);
      setSaving(null);
      if (ok) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.back();
      }
    },
    [setAvatar, router]
  );

  const pickingCast = mode === "characters" && castShow != null;

  const cells: Cell[] = useMemo(() => {
    if (pickingCast) {
      return (cast ?? [])
        // No image means nothing to use — a name alone cannot be an avatar.
        .filter((m) => m.image)
        .filter((m) => {
          const q = query.trim().toLowerCase();
          if (!q) return true;
          return (
            m.characterName.toLowerCase().includes(q) ||
            m.personName.toLowerCase().includes(q)
          );
        })
        .map((m) => ({
          kind: "character" as const,
          key: `c${m.characterId}`,
          url: m.image as string,
          label: m.characterName,
          sub: m.personName,
        }));
    }
    return filterShows(withPosters, query).map((s) => ({
      kind: "show" as const,
      key: `s${s.id}`,
      url: s.poster_url as string,
      label: s.name,
      show: s,
    }));
  }, [pickingCast, cast, withPosters, query]);

  const onCell = (item: Cell) => {
    // In character mode a show is a step, not a choice.
    if (mode === "characters" && item.kind === "show") {
      setCastShow(item.show);
      setQuery("");
      return;
    }
    void choose(item.url);
  };

  const name = profile?.display_name || profile?.username || "You";
  const searchPlaceholder = pickingCast
    ? "Search characters"
    : "Search your shows";

  return (
    <FlatList
      // Remounts between grids: React Native forbids changing numColumns on
      // the fly, and it also drops the scroll position from the previous grid,
      // which would otherwise start you halfway down a new one.
      key={pickingCast ? `cast-${castShow.id}` : "shows"}
      data={cells}
      keyExtractor={(c) => c.key}
      numColumns={3}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
      columnWrapperStyle={{ gap: 10, marginBottom: 10 }}
      ListHeaderComponent={
        <View style={{ gap: 14, paddingTop: 6, paddingBottom: 14 }}>
          <View style={{ alignItems: "center", gap: 10 }}>
            <Avatar name={name} url={profile?.avatar_url} size={84} />
            {profile?.avatar_url ? (
              <Bouncy
                onPress={() => void choose(null)}
                scaleTo={0.94}
                accessibilityRole="button"
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: radius.sm,
                  borderWidth: 1,
                  borderColor: colors.line,
                }}
              >
                {saving === "none" ? (
                  <ActivityIndicator color={colors.muted} size="small" />
                ) : (
                  <Ionicons name="close-circle-outline" size={15} color={colors.muted} />
                )}
                <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>
                  Use my initial instead
                </Text>
              </Bouncy>
            ) : null}
          </View>

          <View style={{ flexDirection: "row", gap: 8 }}>
            {(["shows", "characters"] as Mode[]).map((m) => (
              <Pressable
                key={m}
                onPress={() => {
                  setMode(m);
                  setQuery("");
                  if (m === "shows") setCastShow(null);
                }}
                accessibilityRole="tab"
                accessibilityState={{ selected: mode === m }}
                style={{
                  flex: 1,
                  paddingVertical: 9,
                  borderRadius: radius.sm,
                  alignItems: "center",
                  backgroundColor: mode === m ? colors.accent : colors.surface,
                  borderWidth: 1,
                  borderColor: mode === m ? colors.accent : colors.line,
                }}
              >
                <Text
                  style={{
                    color: mode === m ? colors.ink : colors.muted,
                    fontWeight: "800",
                    fontSize: 13,
                  }}
                >
                  {m === "shows" ? "Shows" : "Characters"}
                </Text>
              </Pressable>
            ))}
          </View>

          {mode === "characters" && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ color: colors.faint, fontSize: 12, flex: 1 }}>
                {castShow
                  ? `Characters in ${castShow.name}`
                  : "Pick a show to see its characters"}
              </Text>
              {castShow && (
                <Bouncy
                  onPress={() => {
                    setCastShow(null);
                    setQuery("");
                  }}
                  scaleTo={0.94}
                  accessibilityRole="button"
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: radius.sm,
                    borderWidth: 1,
                    borderColor: colors.line,
                  }}
                >
                  <Ionicons name="swap-horizontal" size={13} color={colors.accent} />
                  <Text style={{ color: colors.accent, fontSize: 12, fontWeight: "700" }}>
                    Change show
                  </Text>
                </Bouncy>
              )}
            </View>
          )}

          {(pickingCast ? (cast ?? []).length >= 8 : shows.length >= 8) && (
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
              <Ionicons name="search" size={15} color={colors.faint} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={searchPlaceholder}
                placeholderTextColor={colors.faint}
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
          )}

          {pickingCast && cast === null && !castFailed && (
            <ActivityIndicator color={colors.accent} />
          )}
        </View>
      }
      ListEmptyComponent={
        castFailed ? (
          <EmptyState
            icon="cloud-offline-outline"
            title="Couldn't load the cast"
            body="Check your connection and pick the show again."
          />
        ) : pickingCast && cast === null ? null : query.trim() ? (
          <Text style={{ color: colors.muted, fontSize: 13 }}>
            Nothing matches “{query.trim()}”.
          </Text>
        ) : pickingCast ? (
          <EmptyState
            icon="people-outline"
            title="No character photos"
            body="TVmaze doesn't have cast images for this show yet. Try another one."
          />
        ) : (
          <EmptyState
            icon="tv-outline"
            title="No posters yet"
            body="Follow a few shows and any of their posters can be your picture."
          />
        )
      }
      renderItem={({ item }) => {
        const chosen = profile?.avatar_url === item.url;
        const stepping = mode === "characters" && item.kind === "show";
        return (
          <Bouncy
            onPress={() => onCell(item)}
            scaleTo={0.95}
            accessibilityRole="button"
            accessibilityState={{ selected: chosen && !stepping }}
            accessibilityLabel={
              stepping
                ? `See characters in ${item.label}`
                : item.kind === "character"
                  ? `Use ${item.label} as your profile picture`
                  : `Use the ${item.label} poster as your profile picture`
            }
            style={{ width: cell }}
          >
            <View
              style={{
                borderRadius: item.kind === "character" ? cell / 2 : radius.sm + 2,
                overflow: "hidden",
                borderWidth: 2,
                // Always present, transparent when unselected — appearing on
                // selection would shift every cell in the grid by two points.
                borderColor: chosen && !stepping ? colors.accent : "transparent",
              }}
            >
              {item.kind === "character" ? (
                // Square and circular: a character portrait is a face, and the
                // grid is showing it as the avatar it is about to become.
                <Image
                  source={{ uri: item.url }}
                  style={{
                    width: cell - 4,
                    height: cell - 4,
                    borderRadius: (cell - 4) / 2,
                    backgroundColor: colors.raised,
                  }}
                  contentFit="cover"
                  cachePolicy="disk"
                />
              ) : (
                <Poster
                  src={item.url}
                  name={item.label}
                  width={cell - 4}
                  height={(cell - 4) * 1.45}
                  radius={radius.sm}
                />
              )}
            </View>
            <Text
              style={{
                color: chosen && !stepping ? colors.accent : colors.muted,
                fontSize: 11,
                marginTop: 4,
                textAlign: item.kind === "character" ? "center" : "left",
              }}
              numberOfLines={1}
            >
              {item.label}
            </Text>
            {item.kind === "character" && item.sub ? (
              <Text
                style={{ color: colors.faint, fontSize: 10, textAlign: "center" }}
                numberOfLines={1}
              >
                {item.sub}
              </Text>
            ) : null}
            {saving === item.url && (
              <ActivityIndicator color={colors.accent} size="small" style={{ marginTop: 2 }} />
            )}
          </Bouncy>
        );
      }}
    />
  );
}
