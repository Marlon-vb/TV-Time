import { useCallback, useState } from "react";
import { FlatList, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import Poster from "@/components/Poster";
import { CATEGORY_LABELS, EmptyState, ProgressBar } from "@/components/ui";
import { colors } from "@/lib/theme";
import { relativeDay } from "@/lib/format";
import * as repo from "@/lib/repo";
import { useFocusData } from "@/lib/useFocusData";
import type { ShowCategory, ShowWithProgress } from "@/lib/types";

const TAB_ORDER: (ShowCategory | "all")[] = [
  "all",
  "watching",
  "up_to_date",
  "not_started",
  "finished",
  "archived",
];

export default function MyShowsScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<ShowCategory | "all">("all");
  const loader = useCallback(() => repo.listShowsWithProgress(), []);
  const { data } = useFocusData(loader);
  const shows = data ?? [];

  const counts = new Map<string, number>();
  for (const s of shows)
    counts.set(s.category, (counts.get(s.category) ?? 0) + 1);

  const visible =
    tab === "all"
      ? shows.filter((s) => s.category !== "archived")
      : shows.filter((s) => s.category === tab);

  return (
    <View style={{ flex: 1 }}>
      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 10, gap: 8 }}
        >
          {TAB_ORDER.map((t) => {
            const count =
              t === "all"
                ? shows.filter((s) => s.category !== "archived").length
                : (counts.get(t) ?? 0);
            if (t === "archived" && count === 0) return null;
            const active = tab === t;
            return (
              <Pressable
                key={t}
                onPress={() => setTab(t)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 7,
                  borderRadius: 999,
                  backgroundColor: active ? colors.accent : colors.surface,
                }}
              >
                <Text
                  style={{
                    color: active ? colors.ink : colors.muted,
                    fontWeight: "700",
                    fontSize: 13,
                  }}
                >
                  {t === "all" ? "All" : CATEGORY_LABELS[t]}{" "}
                  <Text style={{ opacity: 0.6 }}>{count}</Text>
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        data={visible}
        keyExtractor={(s) => String(s.id)}
        numColumns={3}
        contentContainerStyle={{ padding: 10 }}
        columnWrapperStyle={{ gap: 10, paddingHorizontal: 4 }}
        ListEmptyComponent={
          <View style={{ padding: 8 }}>
            <EmptyState
              title="No shows yet"
              body="Follow shows from Discover, or import your TV Time history from Settings."
            />
          </View>
        }
        renderItem={({ item }) => <ShowCard show={item} onPress={() => router.push(`/show/${item.id}` as never)} />}
      />
    </View>
  );
}

function ShowCard({
  show,
  onPress,
}: {
  show: ShowWithProgress;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1 / 3,
        marginBottom: 12,
        backgroundColor: colors.surface,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.line,
        overflow: "hidden",
      }}
    >
      <View>
        <Poster
          src={show.poster_url}
          name={show.name}
          width={"100%"}
          height={150}
          radius={0}
        />
        {show.aired_unwatched > 0 && (
          <View
            style={{
              position: "absolute",
              top: 6,
              right: 6,
              backgroundColor: colors.accent,
              borderRadius: 999,
              paddingHorizontal: 7,
              paddingVertical: 1,
            }}
          >
            <Text style={{ color: colors.ink, fontSize: 10, fontWeight: "800" }}>
              {show.aired_unwatched}
            </Text>
          </View>
        )}
      </View>
      <View style={{ padding: 7, gap: 4 }}>
        <Text
          style={{ color: colors.fg, fontWeight: "700", fontSize: 12 }}
          numberOfLines={1}
        >
          {show.name}
        </Text>
        <Text style={{ color: colors.faint, fontSize: 10 }} numberOfLines={1}>
          {show.category === "up_to_date" && show.next_airstamp
            ? `Next ${relativeDay(show.next_airstamp)}`
            : `${show.watched_count}/${show.total_episodes} watched`}
        </Text>
        <ProgressBar value={show.watched_count} max={show.total_episodes} height={4} />
      </View>
    </Pressable>
  );
}
