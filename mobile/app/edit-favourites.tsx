import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Bouncy from "@/components/Bouncy";
import Poster from "@/components/Poster";
import { EmptyState, card } from "@/components/ui";
import { colors, fonts, radius } from "@/lib/theme";
import * as repo from "@/lib/repo";
import * as movies from "@/lib/movies";
import * as social from "@/lib/social/api";
import { useFocusData } from "@/lib/useFocusData";

interface Item {
  id: number;
  title: string;
  posterUrl: string | null;
}

/**
 * Arrange the favourites shelf.
 *
 * Move buttons rather than drag-and-drop: dragging in React Native needs
 * Reanimated and Gesture Handler, two native modules, to reorder a list that
 * is almost never longer than ten. Buttons also work under VoiceOver, which a
 * drag target does not.
 *
 * The whole order is written on every move. Ten rows is nothing to rewrite,
 * and a partial swap leaves gaps that the next insert quietly resolves wrong.
 */
export default function EditFavouritesScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<"shows" | "movies">("shows");

  const loader = useCallback(
    () => ({
      shows: repo.favorites().map((s) => ({
        id: s.id,
        title: s.name,
        posterUrl: s.poster_url,
      })),
      films: movies.favoriteMovies().map((m) => ({
        id: m.id,
        title: m.title,
        posterUrl: m.poster_url,
      })),
    }),
    []
  );
  const { data, reload } = useFocusData(loader);
  const items: Item[] = (tab === "shows" ? data?.shows : data?.films) ?? [];

  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = [...items];
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row);
    const ids = next.map((i) => i.id);
    if (tab === "shows") {
      repo.setFavoriteOrder(ids);
      void social.upsertFavorites(
        next.map((i, position) => ({
          id: i.id,
          name: i.title,
          posterUrl: i.posterUrl,
          position,
        }))
      );
    } else {
      movies.setFavoriteMovieOrder(ids);
      void social.upsertFavoriteMovies(
        next.map((i, position) => ({
          id: i.id,
          title: i.title,
          posterUrl: i.posterUrl,
          position,
        }))
      );
    }
    reload();
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}>
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 4 }}>
        {(["shows", "movies"] as const).map((t) => (
          <Pressable
            key={t}
            onPress={() => setTab(t)}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t }}
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
            <Text
              style={{
                color: tab === t ? colors.ink : colors.muted,
                fontWeight: "800",
                fontSize: 13,
              }}
            >
              {t === "shows" ? "Shows" : "Movies"}
            </Text>
          </Pressable>
        ))}
      </View>

      {items.length === 0 ? (
        <EmptyState
          icon="star-outline"
          title="Nothing starred yet"
          body={
            tab === "shows"
              ? "Star a show from its page and it lands here to arrange."
              : "Star a movie from its page and it lands here to arrange."
          }
        />
      ) : (
        items.map((item, i) => (
          <View
            key={item.id}
            style={{ ...card, flexDirection: "row", alignItems: "center", gap: 12, padding: 10 }}
          >
            <Text
              style={{
                color: colors.accent,
                fontFamily: fonts.display,
                fontSize: 16,
                width: 24,
                textAlign: "center",
                fontVariant: ["tabular-nums"],
              }}
            >
              {i + 1}
            </Text>
            <Pressable
              onPress={() =>
                router.push(
                  (tab === "shows" ? `/show/${item.id}` : `/movie/${item.id}`) as never
                )
              }
            >
              <Poster src={item.posterUrl} name={item.title} width={40} height={58} radius={7} />
            </Pressable>
            <Text style={{ color: colors.fg, flex: 1, fontSize: 13 }} numberOfLines={2}>
              {item.title}
            </Text>
            <View style={{ flexDirection: "row", gap: 6 }}>
              <MoveButton
                dir="up"
                disabled={i === 0}
                label={`Move ${item.title} up`}
                onPress={() => move(i, i - 1)}
              />
              <MoveButton
                dir="down"
                disabled={i === items.length - 1}
                label={`Move ${item.title} down`}
                onPress={() => move(i, i + 1)}
              />
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

function MoveButton({
  dir,
  disabled,
  label,
  onPress,
}: {
  dir: "up" | "down";
  disabled: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Bouncy
      onPress={disabled ? () => {} : onPress}
      disabled={disabled}
      scaleTo={0.9}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={{
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.raised,
        borderWidth: 1,
        borderColor: colors.line,
        opacity: disabled ? 0.3 : 1,
      }}
    >
      <Ionicons
        name={dir === "up" ? "chevron-up" : "chevron-down"}
        size={16}
        color={colors.fg}
      />
    </Bouncy>
  );
}
