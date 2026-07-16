import { useCallback, useState } from "react";
import {
  ActionSheetIOS,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
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
import {
  filterShows,
  SHOW_SORTS,
  sortLabel,
  sortShows,
  type ShowSort,
} from "@/lib/show-sort";
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
  const { width } = useWindowDimensions();
  // Fixed 3-up card width so a long title can never stretch a card and break
  // the grid. Accounts for the list's 12pt side padding, the row's 4pt side
  // padding, and the two 10pt gaps between columns.
  const cardWidth = (width - 24 - 8 - 20) / 3;
  const [tab, setTab] = useState<ShowCategory | "all">("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ShowSort>("az");
  const [refreshing, setRefreshing] = useState(false);
  const loader = useCallback(() => repo.listShowsWithProgress(), []);
  const { data, reload } = useFocusData(loader);
  const shows = data ?? [];

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      // 15-min staleness floor: back-to-back pulls must not burn TVmaze's
      // ~20 req/10s budget re-fetching shows synced seconds ago.
      await repo.syncStaleShows(0.25, {
        limit: 20,
        concurrency: 4,
        prioritize: "activity",
      });
    } catch {
      // offline is fine
    }
    reload();
    setRefreshing(false);
  };

  const counts = new Map<string, number>();
  for (const s of shows)
    counts.set(s.category, (counts.get(s.category) ?? 0) + 1);

  const inCategory =
    tab === "all"
      ? shows.filter((s) => s.category !== "archived")
      : shows.filter((s) => s.category === tab);
  const visible = sortShows(filterShows(inCategory, query), sort);

  const chooseSort = () =>
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: "Sort shows by",
        options: [...SHOW_SORTS.map((s) => s.label), "Cancel"],
        cancelButtonIndex: SHOW_SORTS.length,
        userInterfaceStyle: "dark",
      },
      (i) => {
        if (i != null && i < SHOW_SORTS.length) setSort(SHOW_SORTS[i].key);
      }
    );

  return (
    <FlatList
      data={visible}
      keyExtractor={(s) => String(s.id)}
      numColumns={3}
      // 250-show grids: render a screenful fast, recycle aggressively.
      // (No removeClippedSubviews: it detaches the header's focused search
      // TextInput when scrolled offscreen and can blank grid cells.)
      initialNumToRender={12}
      windowSize={7}
      maxToRenderPerBatch={12}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void onRefresh()}
          tintColor={colors.accent}
        />
      }
      contentContainerStyle={{
        paddingHorizontal: 12,
        paddingBottom: TAB_BAR_CLEARANCE,
      }}
      columnWrapperStyle={{ gap: 10, paddingHorizontal: 4 }}
      ListHeaderComponent={
        <View style={{ marginHorizontal: -12 }}>
          <ScreenHeader title="My Shows" subtitle={`${shows.length} followed`} />
          <View
            style={{
              flexDirection: "row",
              gap: 8,
              paddingHorizontal: 16,
              marginTop: 6,
            }}
          >
            <View
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.line,
                borderRadius: radius.md,
                paddingHorizontal: 12,
              }}
            >
              <Ionicons name="search" size={15} color={colors.faint} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search your shows…"
                placeholderTextColor={colors.faint}
                autoCorrect={false}
                style={{ flex: 1, paddingVertical: 10, color: colors.fg, fontSize: 14 }}
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
            <Pressable
              onPress={chooseSort}
              accessibilityRole="button"
              accessibilityLabel={`Sort by ${sortLabel(sort)}`}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: 12,
                borderRadius: radius.md,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.line,
              }}
            >
              <Ionicons name="swap-vertical" size={15} color={colors.muted} />
              <Text style={{ color: colors.muted, fontSize: 12, fontFamily: fonts.displayMedium }}>
                {sortLabel(sort)}
              </Text>
            </Pressable>
          </View>
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
          {query.trim() ? (
            <EmptyState
              icon="search-outline"
              title="No matches"
              body={`No followed shows match “${query.trim()}”.`}
            />
          ) : (
            <EmptyState
              icon="albums-outline"
              title="No shows yet"
              body="Follow shows from Discover, or import your TV Time history from Settings."
            />
          )}
        </View>
      }
      renderItem={({ item }) => (
        <ShowCard
          show={item}
          width={cardWidth}
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
  width,
  onPress,
}: {
  show: ShowWithProgress;
  width: number;
  onPress: () => void;
}) {
  return (
    <Bouncy
      onPress={onPress}
      style={{
        ...card,
        width,
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
          // Real 2:3 poster aspect instead of a fixed height that cropped
          // artwork on larger devices.
          height={Math.round(width * 1.5)}
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
