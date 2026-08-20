import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
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
import * as Haptics from "expo-haptics";
import Bouncy from "@/components/Bouncy";
import Poster from "@/components/Poster";
import FavoritesRail from "@/components/FavoritesRail";
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
import * as movies from "@/lib/movies";
import * as itunes from "@/lib/itunes";
import { useFocusData } from "@/lib/useFocusData";
import { useTabTop } from "@/lib/useTabTop";
import {
  filterShows,
  SHOW_SORTS,
  sortLabel,
  sortShows,
  type ShowSort,
} from "@/lib/show-sort";
import type {
  MovieRow,
  RemoteMovie,
  ShowCategory,
  ShowWithProgress,
} from "@/lib/types";

type LibMode = "shows" | "movies";

const TAB_ORDER: (ShowCategory | "all")[] = [
  "all",
  "watching",
  "up_to_date",
  "not_started",
  "finished",
  "archived",
];

export default function LibraryScreen() {
  const [mode, setMode] = useState<LibMode>("shows");
  return mode === "shows" ? (
    <ShowsLibrary mode={mode} onMode={setMode} />
  ) : (
    <MoviesLibrary mode={mode} onMode={setMode} />
  );
}

/* ------------------------------------------------------- Shows / Movies toggle */

function LibraryToggle({
  mode,
  onMode,
}: {
  mode: LibMode;
  onMode: (m: LibMode) => void;
}) {
  const seg = (m: LibMode, label: string, icon: "tv" | "film") => {
    const active = mode === m;
    return (
      <Pressable
        onPress={() => onMode(m)}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        accessibilityLabel={`${label} library`}
        style={{
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          paddingVertical: 8,
          borderRadius: radius.sm,
          backgroundColor: active ? colors.overlay : "transparent",
        }}
      >
        <Ionicons name={icon} size={14} color={active ? colors.fg : colors.faint} />
        <Text
          style={{
            color: active ? colors.fg : colors.faint,
            fontSize: 13,
            fontFamily: fonts.displayMedium,
          }}
        >
          {label}
        </Text>
      </Pressable>
    );
  };
  return (
    <View
      style={{
        flexDirection: "row",
        marginHorizontal: 16,
        marginTop: 6,
        gap: 3,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: radius.sm + 3,
        padding: 3,
      }}
    >
      {seg("shows", "Shows", "tv")}
      {seg("movies", "Movies", "film")}
    </View>
  );
}

/* ------------------------------------------------------------------- shows */

function ShowsLibrary({ mode, onMode }: { mode: LibMode; onMode: (m: LibMode) => void }) {
  const router = useRouter();
  const listRef = useRef<FlatList<ShowWithProgress>>(null);
  useTabTop(() =>
    listRef.current?.scrollToOffset({ offset: 0, animated: true })
  );
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

  // Derived from the shows already loaded rather than a second query: the
  // grid holds every followed show, and favourites are a subset of it.
  const favorites = shows
    .filter((s) => s.favorited_at != null)
    .sort((a, b) => (b.favorited_at ?? "").localeCompare(a.favorited_at ?? ""));

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
      ref={listRef}
      data={visible}
      keyExtractor={(s) => String(s.id)}
      numColumns={3}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
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
          <ScreenHeader title="Library" subtitle={`${shows.length} shows`} />
          <LibraryToggle mode={mode} onMode={onMode} />
          {/* Above the filters, not inside them: this shelf is a fixed answer
              to "what do you love", so a category tab or a search should not
              silently change it out from under you. Hidden until there is one,
              rather than teaching an empty rail. */}
          {favorites.length > 0 && (
            <View style={{ paddingHorizontal: 16, marginTop: 14 }}>
              <FavoritesRail
                items={favorites.map((s) => ({
                  id: s.id,
                  name: s.name,
                  posterUrl: s.poster_url,
                }))}
                onOpen={(id) => router.push(`/show/${id}` as never)}
              />
            </View>
          )}
          <View
            style={{
              flexDirection: "row",
              gap: 8,
              paddingHorizontal: 16,
              marginTop: 10,
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

/* ------------------------------------------------------------------ movies */

function MoviesLibrary({ mode, onMode }: { mode: LibMode; onMode: (m: LibMode) => void }) {
  const router = useRouter();
  const movieListRef = useRef<FlatList<RemoteMovie | MovieRow>>(null);
  useTabTop(() =>
    movieListRef.current?.scrollToOffset({ offset: 0, animated: true })
  );
  const loader = useCallback(() => movies.listMovies(), []);
  const { data, reload } = useFocusData(loader);
  const mine = data ?? [];

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RemoteMovie[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle"
  );
  const generation = useRef(0);
  const searching = query.trim().length > 0;

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      generation.current++; // invalidate any in-flight search so a late
      setResults([]); //        response can't repopulate a cleared box
      setStatus("idle");
      return;
    }
    const gen = ++generation.current;
    const timer = setTimeout(async () => {
      setStatus("loading");
      try {
        const found = await itunes.searchMovies(q);
        if (gen !== generation.current) return;
        setResults(found);
        setStatus("done");
      } catch {
        if (gen === generation.current) setStatus("error");
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [query]);

  const addedIds = new Set(mine.map((m) => m.id));

  const add = (m: RemoteMovie) => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    movies.addMovie(m);
    reload();
  };

  const watchedCount = mine.filter((m) => m.watched_at).length;

  return (
    <FlatList
      ref={movieListRef}
      data={(searching ? results : mine) as (RemoteMovie | MovieRow)[]}
      keyExtractor={(item) => String(item.id)}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingBottom: TAB_BAR_CLEARANCE,
        gap: 8,
      }}
      ListHeaderComponent={
        <View>
          <View style={{ marginHorizontal: -16 }}>
            <ScreenHeader
              title="Library"
              subtitle={
                mine.length > 0
                  ? `${mine.length} movie${mine.length === 1 ? "" : "s"} · ${watchedCount} watched`
                  : null
              }
            />
            <LibraryToggle mode={mode} onMode={onMode} />
          </View>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.line,
              borderRadius: radius.md,
              paddingHorizontal: 12,
              marginTop: 10,
              marginBottom: 4,
            }}
          >
            <Ionicons name="search" size={15} color={colors.faint} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search movies & documentaries to add…"
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
          {searching && status === "loading" && (
            <ActivityIndicator color={colors.accent} style={{ marginTop: 14 }} />
          )}
          {searching && status === "error" && (
            <Text style={{ color: colors.danger, fontSize: 13, marginTop: 10 }}>
              Search failed — check your connection and try again.
            </Text>
          )}
          {searching && status === "done" && results.length === 0 && (
            <Text style={{ color: colors.muted, fontSize: 13, marginTop: 10 }}>
              No movies found for “{query.trim()}”.
            </Text>
          )}
        </View>
      }
      ListEmptyComponent={
        searching ? null : (
          <EmptyState
            icon="film-outline"
            title="No movies yet"
            body="Search above to add movies and documentaries to your library. Track what you've watched and want to watch."
          />
        )
      }
      renderItem={({ item }) =>
        searching ? (
          <SearchResultRow
            movie={item as RemoteMovie}
            added={addedIds.has(item.id)}
            onAdd={() => add(item as RemoteMovie)}
            onOpen={() => router.push(`/movie/${item.id}` as never)}
          />
        ) : (
          <MovieRowCard
            movie={item as MovieRow}
            onPress={() => router.push(`/movie/${item.id}` as never)}
          />
        )
      }
    />
  );
}

/** A movie already in your library. */
function MovieRowCard({
  movie,
  onPress,
}: {
  movie: MovieRow;
  onPress: () => void;
}) {
  const watched = Boolean(movie.watched_at);
  const meta = [movie.year ? String(movie.year) : null, movie.genre]
    .filter(Boolean)
    .join("  ·  ");
  return (
    <Bouncy
      onPress={onPress}
      style={{
        ...card,
        flexDirection: "row",
        gap: 12,
        alignItems: "center",
        padding: 10,
      }}
    >
      <Poster src={movie.poster_url} name={movie.title} width={46} height={68} radius={8} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.fg, fontFamily: fonts.display, fontSize: 14 }} numberOfLines={1}>
          {movie.title}
        </Text>
        {meta ? (
          <Text style={{ color: colors.muted, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
        <Text
          style={{
            color: watched ? colors.ok : colors.faint,
            fontSize: 11,
            marginTop: 3,
            fontFamily: fonts.displayMedium,
          }}
        >
          {watched ? "✓ Watched" : "Watchlist"}
        </Text>
      </View>
      {movie.rating != null && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
          <Ionicons name="star" size={12} color={colors.accent} />
          <Text style={{ color: colors.accent, fontSize: 12, fontWeight: "700" }}>
            {Number.isInteger(movie.rating) ? movie.rating : movie.rating.toFixed(1)}
          </Text>
        </View>
      )}
    </Bouncy>
  );
}

/** An iTunes search result you can add. */
function SearchResultRow({
  movie,
  added,
  onAdd,
  onOpen,
}: {
  movie: RemoteMovie;
  added: boolean;
  onAdd: () => void;
  onOpen: () => void;
}) {
  const meta = [
    movie.year ? String(movie.year) : null,
    movie.genre,
    movie.runtime ? `${movie.runtime} min` : null,
  ]
    .filter(Boolean)
    .join("  ·  ");
  return (
    <Bouncy
      onPress={added ? onOpen : onAdd}
      style={{
        ...card,
        flexDirection: "row",
        gap: 12,
        alignItems: "center",
        padding: 10,
      }}
    >
      <Poster src={movie.posterUrl} name={movie.title} width={50} height={74} radius={8} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.fg, fontFamily: fonts.display, fontSize: 14 }} numberOfLines={1}>
          {movie.title}
        </Text>
        {meta ? (
          <Text style={{ color: colors.muted, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
        {movie.overview ? (
          <Text style={{ color: colors.faint, fontSize: 11, marginTop: 3, lineHeight: 15 }} numberOfLines={2}>
            {movie.overview}
          </Text>
        ) : null}
      </View>
      <View
        style={{
          paddingHorizontal: 13,
          paddingVertical: 10,
          borderRadius: radius.sm,
          backgroundColor: added ? colors.overlay : colors.accent,
        }}
      >
        <Text
          style={{
            color: added ? colors.muted : colors.ink,
            fontWeight: "800",
            fontSize: 12,
          }}
        >
          {added ? "Added ✓" : "+ Add"}
        </Text>
      </View>
    </Bouncy>
  );
}
