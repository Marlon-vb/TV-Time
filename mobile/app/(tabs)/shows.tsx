import { useCallback, useState } from "react";
import { FlatList, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Bouncy from "@/components/Bouncy";
import Poster from "@/components/Poster";
import ScreenHeader from "@/components/ScreenHeader";
import { CATEGORY_LABELS, EmptyState, ProgressBar, card } from "@/components/ui";
import {
  accentGradient,
  colors,
  fonts,
  radius,
  TAB_BAR_CLEARANCE,
} from "@/lib/theme";
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
    <FlatList
      data={visible}
      keyExtractor={(s) => String(s.id)}
      numColumns={3}
      contentContainerStyle={{
        paddingHorizontal: 12,
        paddingBottom: TAB_BAR_CLEARANCE,
      }}
      columnWrapperStyle={{ gap: 10, paddingHorizontal: 4 }}
      ListHeaderComponent={
        <View style={{ marginHorizontal: -12 }}>
          <ScreenHeader title="My Shows" subtitle={`${shows.length} followed`} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingVertical: 12,
              gap: 8,
            }}
          >
            {TAB_ORDER.map((t) => {
              const count =
                t === "all"
                  ? shows.filter((s) => s.category !== "archived").length
                  : (counts.get(t) ?? 0);
              if (t === "archived" && count === 0) return null;
              const active = tab === t;
              const label = t === "all" ? "All" : CATEGORY_LABELS[t];
              return (
                <Pressable key={t} onPress={() => setTab(t)}>
                  {active ? (
                    <LinearGradient
                      colors={accentGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={chipStyle}
                    >
                      <Text style={{ color: colors.ink, fontWeight: "800", fontSize: 12 }}>
                        {label} {count}
                      </Text>
                    </LinearGradient>
                  ) : (
                    <View
                      style={{
                        ...chipStyle,
                        backgroundColor: colors.surface,
                        borderWidth: 1,
                        borderColor: colors.line,
                      }}
                    >
                      <Text style={{ color: colors.muted, fontWeight: "600", fontSize: 12 }}>
                        {label} <Text style={{ color: colors.faint }}>{count}</Text>
                      </Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      }
      ListEmptyComponent={
        <View style={{ paddingHorizontal: 4 }}>
          <EmptyState
            icon="albums-outline"
            title="No shows yet"
            body="Follow shows from Discover, or import your TV Time history from Settings."
          />
        </View>
      }
      renderItem={({ item }) => (
        <ShowCard
          show={item}
          onPress={() => router.push(`/show/${item.id}` as never)}
        />
      )}
    />
  );
}

const chipStyle = {
  paddingHorizontal: 14,
  paddingVertical: 8,
  borderRadius: 999,
} as const;

function ShowCard({
  show,
  onPress,
}: {
  show: ShowWithProgress;
  onPress: () => void;
}) {
  return (
    <Bouncy
      onPress={onPress}
      style={{
        ...card,
        flex: 1 / 3,
        marginBottom: 12,
        borderRadius: radius.md,
        overflow: "hidden",
      }}
    >
      <View>
        <Poster
          src={show.poster_url}
          name={show.name}
          width={"100%"}
          height={152}
          radius={0}
        />
        {show.aired_unwatched > 0 && (
          <View style={{ position: "absolute", top: 6, right: 6, borderRadius: 999, overflow: "hidden" }}>
            <LinearGradient
              colors={accentGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ paddingHorizontal: 7, paddingVertical: 2 }}
            >
              <Text style={{ color: colors.ink, fontSize: 10, fontWeight: "800" }}>
                {show.aired_unwatched}
              </Text>
            </LinearGradient>
          </View>
        )}
      </View>
      <View style={{ padding: 8, gap: 4 }}>
        <Text
          style={{ color: colors.fg, fontFamily: fonts.displayMedium, fontSize: 12 }}
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
    </Bouncy>
  );
}
