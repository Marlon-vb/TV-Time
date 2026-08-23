import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Poster from "@/components/Poster";
import ReorderList from "@/components/ReorderList";
import { EmptyState, card } from "@/components/ui";
import { colors, fonts, radius } from "@/lib/theme";
import * as repo from "@/lib/repo";
import * as movies from "@/lib/movies";
import * as social from "@/lib/social/api";
import { useFocusData } from "@/lib/useFocusData";

/** Fixed, because the drag maths is arithmetic on one row pitch. */
const ROW_H = 78;

interface Item {
  id: number;
  title: string;
  posterUrl: string | null;
}

/**
 * Arrange the favourites shelf.
 *
 * Drag the handle to reorder. ReorderList does it on PanResponder rather than
 * a drag library, so this costs no native modules.
 *
 * The whole order is written on every drop. Ten rows is nothing to rewrite,
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
  // A drag and a page scroll are the same gesture; the list wins while one is
  // in progress.
  const [dragging, setDragging] = useState(false);

  const commit = (next: Item[]) => {
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
    <ScrollView
      scrollEnabled={!dragging}
      contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
    >
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
        <ReorderList
          items={items}
          keyOf={(i) => i.id}
          rowHeight={ROW_H}
          gap={10}
          onReorder={commit}
          onDragStateChange={setDragging}
          renderRow={(item, i, handle, isDragging) => (
            <View
              style={{
                ...card,
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                padding: 10,
                height: ROW_H,
                // Lifted off the page while in the air, so it reads as held
                // rather than as a row that happens to be moving.
                backgroundColor: isDragging ? colors.overlay : colors.surface,
                borderColor: isDragging ? colors.accent : colors.line,
              }}
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
              {/* The handle owns the gesture, so the poster stays tappable and
                  a drag started anywhere else scrolls the page instead. */}
              <View
                {...handle}
                accessible
                accessibilityRole="adjustable"
                accessibilityLabel={`Reorder ${item.title}, position ${i + 1} of ${items.length}`}
                style={{
                  width: 44,
                  height: 44,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="reorder-three" size={22} color={colors.muted} />
              </View>
            </View>
          )}
        />
      )}
    </ScrollView>
  );
}
