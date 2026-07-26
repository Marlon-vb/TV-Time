import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Bouncy from "@/components/Bouncy";
import Poster from "@/components/Poster";
import ScreenHeader from "@/components/ScreenHeader";
import { card, sectionLabel } from "@/components/ui";
import { colors, fonts, radius, TAB_BAR_CLEARANCE } from "@/lib/theme";
import * as tvmaze from "@/lib/tvmaze";
import * as itunes from "@/lib/itunes";
import * as repo from "@/lib/repo";
import * as movies from "@/lib/movies";
import { getSetting, setSetting } from "@/lib/db";
import { rescheduleAll } from "@/lib/notifications";
import { recommendedShows, type Recommendation } from "@/lib/recommendations";
import type { RemoteMovie, RemoteShow } from "@/lib/types";

// A search hit — a TV show (TVmaze) or a movie/documentary (iTunes).
type SearchItem =
  | { kind: "show"; show: RemoteShow; followed: boolean }
  | { kind: "movie"; movie: RemoteMovie; added: boolean };

const AIRING_CACHE_KEY = "airing_today_cache_v1";

/** Tonight's popular US schedule, cached per calendar day. */
async function airingTonight(): Promise<RemoteShow[]> {
  const today = new Date().toDateString();
  try {
    const raw = getSetting(AIRING_CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw) as { date: string; shows: RemoteShow[] };
      if (cached.date === today && cached.shows.length > 0) return cached.shows;
    }
  } catch {
    // corrupt cache — refetch below
  }
  const shows = await tvmaze.getAiringToday(12);
  if (shows.length > 0) {
    setSetting(AIRING_CACHE_KEY, JSON.stringify({ date: today, shows }));
  }
  return shows;
}

/** "Premieres Sep 15" from a YYYY-MM-DD date (noon-anchored to dodge TZ drift). */
function premiereLabel(date: string | null): string | null {
  if (!date) return null;
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return `Premieres ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

const PREMIERING_CACHE_KEY = "premiering_soon_cache_v1";

/** Series premieres coming in the next couple weeks, cached per calendar day. */
async function premieringSoon(): Promise<RemoteShow[]> {
  const today = new Date().toDateString();
  try {
    const raw = getSetting(PREMIERING_CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw) as { date: string; shows: RemoteShow[] };
      if (cached.date === today && cached.shows.length > 0) return cached.shows;
    }
  } catch {
    // corrupt cache — refetch below
  }
  const shows = await tvmaze.getPremieringSoon();
  if (shows.length > 0) {
    setSetting(PREMIERING_CACHE_KEY, JSON.stringify({ date: today, shows }));
  }
  return shows;
}

// Bump when the IMDB_TOP canon changes to force clients to re-resolve.
const TOP_RATED_CACHE_KEY = "top_rated_cache_v1";
const TOP_RATED_VERSION = 1;

/** The IMDb top-rated canon. Static list → cache until the version changes. */
async function topRated(): Promise<tvmaze.RatedShow[]> {
  try {
    const raw = getSetting(TOP_RATED_CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw) as {
        version: number;
        shows: tvmaze.RatedShow[];
      };
      // Only trust a healthy cache — a rate-limited partial resolve refetches.
      if (cached.version === TOP_RATED_VERSION && cached.shows.length >= 10) {
        return cached.shows;
      }
    }
  } catch {
    // corrupt cache — refetch below
  }
  const shows = await tvmaze.getTopRated();
  if (shows.length >= 10) {
    setSetting(
      TOP_RATED_CACHE_KEY,
      JSON.stringify({ version: TOP_RATED_VERSION, shows })
    );
  }
  return shows;
}

export default function DiscoverScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchItem[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle"
  );
  const [busyId, setBusyId] = useState<number | null>(null);
  const generation = useRef(0);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [recsLoading, setRecsLoading] = useState(true);
  const [tonight, setTonight] = useState<RemoteShow[]>([]);
  const [best, setBest] = useState<tvmaze.RatedShow[]>([]);
  const [premieres, setPremieres] = useState<RemoteShow[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await recommendedShows();
      if (alive) {
        setRecs(r);
        setRecsLoading(false);
      }
    })();
    // Independent of recommendations — one cheap request, cached for the day.
    airingTonight()
      .then((shows) => {
        if (alive) setTonight(shows);
      })
      .catch(() => {
        // offline — the rail simply doesn't render
      });
    // The IMDb top-rated canon (cached long-term after the first resolve).
    topRated()
      .then((shows) => {
        if (alive) setBest(shows);
      })
      .catch(() => {
        // offline — the rail simply doesn't render
      });
    // Upcoming series premieres (cached per day).
    premieringSoon()
      .then((shows) => {
        if (alive) setPremieres(shows);
      })
      .catch(() => {
        // offline — the rail simply doesn't render
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setStatus("idle");
      return;
    }
    const gen = ++generation.current;
    const timer = setTimeout(async () => {
      setStatus("loading");
      // Search both sources at once; TV shows first, then movies/docs.
      const [showsRes, moviesRes] = await Promise.allSettled([
        tvmaze.searchShows(q),
        itunes.searchMovies(q),
      ]);
      if (gen !== generation.current) return;
      if (showsRes.status === "rejected" && moviesRes.status === "rejected") {
        setStatus("error");
        return;
      }
      const showItems: SearchItem[] =
        showsRes.status === "fulfilled"
          ? showsRes.value.map((s) => ({
              kind: "show",
              show: s,
              followed: repo.isFollowed(s.id),
            }))
          : [];
      const movieItems: SearchItem[] =
        moviesRes.status === "fulfilled"
          ? moviesRes.value.map((m) => ({
              kind: "movie",
              movie: m,
              added: movies.isMovieAdded(m.id),
            }))
          : [];
      setResults([...showItems, ...movieItems]);
      setStatus("done");
    }, 350);
    return () => clearTimeout(timer);
  }, [query]);

  const follow = async (show: RemoteShow) => {
    setBusyId(show.id);
    try {
      await repo.followShow(show.id);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // New episodes of this show should alert like everything else.
      void rescheduleAll().catch(() => {});
      setResults((rs) =>
        rs.map((r) =>
          r.kind === "show" && r.show.id === show.id
            ? { ...r, followed: true }
            : r
        )
      );
    } catch {
      // leave unfollowed; user can retry
    } finally {
      setBusyId(null);
    }
  };

  const addMovie = (m: RemoteMovie) => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    movies.addMovie(m); // instant, local
    setResults((rs) =>
      rs.map((r) =>
        r.kind === "movie" && r.movie.id === m.id ? { ...r, added: true } : r
      )
    );
  };

  return (
    <FlatList
      data={results}
      keyExtractor={(item) =>
        item.kind === "show" ? `show-${item.show.id}` : `movie-${item.movie.id}`
      }
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingBottom: TAB_BAR_CLEARANCE,
        gap: 10,
      }}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View>
          <View style={{ marginHorizontal: -16 }}>
            <ScreenHeader title="Discover" />
          </View>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.line,
              borderRadius: radius.md,
              paddingHorizontal: 14,
              marginTop: 10,
              marginBottom: 12,
            }}
          >
            <Ionicons name="search" size={16} color={colors.faint} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search shows, movies & documentaries…"
              placeholderTextColor={colors.faint}
              autoCorrect={false}
              style={{
                flex: 1,
                paddingVertical: 13,
                color: colors.fg,
                fontSize: 15,
              }}
            />
          </View>

          {status === "idle" && (
            <View style={{ gap: 14 }}>
              <Text style={{ color: colors.faint, fontSize: 13, lineHeight: 19 }}>
                Everything you follow is stored on this device — no account, no
                cloud.
              </Text>
              {recsLoading ? (
                <ActivityIndicator color={colors.accent} />
              ) : recs.length > 0 ? (
                <Rail
                  title="RECOMMENDED FOR YOU"
                  items={recs.map((r) => ({
                    id: r.showId,
                    name: r.name,
                    posterUrl: r.posterUrl,
                    sub: r.reason,
                  }))}
                  onOpen={(id) => router.push(`/show/${id}` as never)}
                />
              ) : null}
              {premieres.length > 0 && (
                <Rail
                  title="PREMIERING SOON"
                  items={premieres.map((s) => ({
                    id: s.id,
                    name: s.name,
                    posterUrl: s.posterUrl,
                    sub: premiereLabel(s.premiered) ?? s.network,
                  }))}
                  onOpen={(id) => router.push(`/show/${id}` as never)}
                />
              )}
              {best.length > 0 && (
                <Rail
                  title="TOP RATED OF ALL TIME"
                  items={best.map((r) => ({
                    id: r.show.id,
                    name: r.show.name,
                    posterUrl: r.show.posterUrl,
                    sub: `★ ${r.imdb.toFixed(1)} IMDb`,
                  }))}
                  onOpen={(id) => router.push(`/show/${id}` as never)}
                />
              )}
              {tonight.length > 0 && (
                <Rail
                  title="AIRING TONIGHT"
                  items={tonight.map((s) => ({
                    id: s.id,
                    name: s.name,
                    posterUrl: s.posterUrl,
                    sub: s.network,
                  }))}
                  onOpen={(id) => router.push(`/show/${id}` as never)}
                />
              )}
            </View>
          )}
          {status === "loading" && (
            <Text style={{ color: colors.muted, fontSize: 13 }}>Searching…</Text>
          )}
          {status === "error" && (
            <Text style={{ color: colors.danger, fontSize: 13 }}>
              Search failed — check your connection and try again.
            </Text>
          )}
          {status === "done" && results.length === 0 && (
            <Text style={{ color: colors.muted, fontSize: 13 }}>
              No shows or movies found for “{query.trim()}”.
            </Text>
          )}
        </View>
      }
      renderItem={({ item }) =>
        item.kind === "show" ? (
          <ShowResultRow
            show={item.show}
            followed={item.followed}
            busy={busyId === item.show.id}
            onOpen={() => router.push(`/show/${item.show.id}` as never)}
            onFollow={() => follow(item.show)}
          />
        ) : (
          <MovieResultRow
            movie={item.movie}
            added={item.added}
            onAdd={() => addMovie(item.movie)}
            onOpen={() => router.push(`/movie/${item.movie.id}` as never)}
          />
        )
      }
    />
  );
}

/** A TV-show search result with a Follow button. */
function ShowResultRow({
  show,
  followed,
  busy,
  onOpen,
  onFollow,
}: {
  show: RemoteShow;
  followed: boolean;
  busy: boolean;
  onOpen: () => void;
  onFollow: () => void;
}) {
  return (
    <Bouncy
      onPress={onOpen}
      style={{ ...card, flexDirection: "row", gap: 12, alignItems: "center", padding: 10 }}
    >
      <Poster src={show.posterUrl} name={show.name} width={54} height={78} radius={9} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.fg, fontFamily: fonts.display, fontSize: 14 }} numberOfLines={1}>
          {show.name}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
          {["TV", show.premiered?.slice(0, 4), show.network, show.status]
            .filter(Boolean)
            .join(" · ")}
        </Text>
        {show.summary && (
          <Text style={{ color: colors.faint, fontSize: 11, marginTop: 3, lineHeight: 15 }} numberOfLines={2}>
            {show.summary}
          </Text>
        )}
      </View>
      <Bouncy
        onPress={() => !followed && onFollow()}
        disabled={followed || busy}
        scaleTo={0.92}
        style={{
          paddingHorizontal: 13,
          paddingVertical: 10,
          borderRadius: radius.sm,
          backgroundColor: followed ? colors.overlay : colors.accent,
          opacity: busy ? 0.5 : 1,
        }}
      >
        <Text style={{ color: followed ? colors.muted : colors.ink, fontWeight: "800", fontSize: 12 }}>
          {followed ? "Following ✓" : "+ Follow"}
        </Text>
      </Bouncy>
    </Bouncy>
  );
}

/** A movie/documentary search result with an Add button. */
function MovieResultRow({
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
    movie.genre === "Documentary" ? "Documentary" : "Movie",
    movie.year ? String(movie.year) : null,
    movie.genre && movie.genre !== "Documentary" ? movie.genre : null,
    movie.runtime ? `${movie.runtime} min` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Bouncy
      onPress={added ? onOpen : onAdd}
      style={{ ...card, flexDirection: "row", gap: 12, alignItems: "center", padding: 10 }}
    >
      <Poster src={movie.posterUrl} name={movie.title} width={54} height={78} radius={9} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.fg, fontFamily: fonts.display, fontSize: 14 }} numberOfLines={1}>
          {movie.title}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
          {meta}
        </Text>
        {movie.overview && (
          <Text style={{ color: colors.faint, fontSize: 11, marginTop: 3, lineHeight: 15 }} numberOfLines={2}>
            {movie.overview}
          </Text>
        )}
      </View>
      <View
        style={{
          paddingHorizontal: 13,
          paddingVertical: 10,
          borderRadius: radius.sm,
          backgroundColor: added ? colors.overlay : colors.accent,
        }}
      >
        <Text style={{ color: added ? colors.muted : colors.ink, fontWeight: "800", fontSize: 12 }}>
          {added ? "Added ✓" : "+ Add"}
        </Text>
      </View>
    </Bouncy>
  );
}

/** Horizontal poster rail with a section label — recommendations, trending. */
function Rail({
  title,
  items,
  onOpen,
}: {
  title: string;
  items: { id: number; name: string; posterUrl: string | null; sub?: string | null }[];
  onOpen: (id: number) => void;
}) {
  return (
    <View style={{ gap: 10 }}>
      <Text style={sectionLabel}>{title}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 12, paddingRight: 8, paddingBottom: 2 }}
      >
        {items.map((r) => (
          <Bouncy
            key={r.id}
            onPress={() => onOpen(r.id)}
            scaleTo={0.94}
            accessibilityRole="button"
            accessibilityLabel={`Open ${r.name}`}
            style={{ width: 108 }}
          >
            <Poster src={r.posterUrl} name={r.name} width={108} height={156} radius={12} />
            <Text
              numberOfLines={1}
              style={{
                color: colors.fg,
                fontSize: 12,
                fontFamily: fonts.displayMedium,
                marginTop: 6,
              }}
            >
              {r.name}
            </Text>
            {r.sub ? (
              <Text
                numberOfLines={1}
                style={{ color: colors.faint, fontSize: 10, marginTop: 1 }}
              >
                {r.sub}
              </Text>
            ) : null}
          </Bouncy>
        ))}
      </ScrollView>
    </View>
  );
}
