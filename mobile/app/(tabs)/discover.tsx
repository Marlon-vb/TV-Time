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
import * as repo from "@/lib/repo";
import { getSetting, setSetting } from "@/lib/db";
import { rescheduleAll } from "@/lib/notifications";
import { recommendedShows, type Recommendation } from "@/lib/recommendations";
import type { RemoteShow } from "@/lib/types";

type Result = RemoteShow & { followed: boolean };

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

export default function DiscoverScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle"
  );
  const [busyId, setBusyId] = useState<number | null>(null);
  const generation = useRef(0);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [recsLoading, setRecsLoading] = useState(true);
  const [tonight, setTonight] = useState<RemoteShow[]>([]);

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
      try {
        const shows = await tvmaze.searchShows(q);
        if (gen !== generation.current) return;
        setResults(
          shows.map((s) => ({ ...s, followed: repo.isFollowed(s.id) }))
        );
        setStatus("done");
      } catch {
        if (gen === generation.current) setStatus("error");
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [query]);

  const follow = async (show: Result) => {
    setBusyId(show.id);
    try {
      await repo.followShow(show.id);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // New episodes of this show should alert like everything else.
      void rescheduleAll().catch(() => {});
      setResults((rs) =>
        rs.map((r) => (r.id === show.id ? { ...r, followed: true } : r))
      );
    } catch {
      // leave unfollowed; user can retry
    } finally {
      setBusyId(null);
    }
  };

  return (
    <FlatList
      data={results}
      keyExtractor={(s) => String(s.id)}
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
              placeholder="Search 80,000+ shows…"
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
              No shows found for “{query.trim()}”.
            </Text>
          )}
        </View>
      }
      renderItem={({ item }) => (
        <Bouncy
          onPress={() => router.push(`/show/${item.id}` as never)}
          style={{
            ...card,
            flexDirection: "row",
            gap: 12,
            alignItems: "center",
            padding: 10,
          }}
        >
          <Poster src={item.posterUrl} name={item.name} width={54} height={78} radius={9} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.fg, fontFamily: fonts.display, fontSize: 14 }} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
              {[
                item.premiered?.slice(0, 4),
                item.network,
                item.status,
                item.genres.slice(0, 2).join(", "),
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
            {item.summary && (
              <Text style={{ color: colors.faint, fontSize: 11, marginTop: 3, lineHeight: 15 }} numberOfLines={2}>
                {item.summary}
              </Text>
            )}
          </View>
          <Bouncy
            onPress={() => !item.followed && follow(item)}
            disabled={item.followed || busyId === item.id}
            scaleTo={0.92}
            style={{
              paddingHorizontal: 13,
              paddingVertical: 10,
              borderRadius: radius.sm,
              backgroundColor: item.followed ? colors.overlay : colors.accent,
              opacity: busyId === item.id ? 0.5 : 1,
            }}
          >
            <Text
              style={{
                color: item.followed ? colors.muted : colors.ink,
                fontWeight: "800",
                fontSize: 12,
              }}
            >
              {item.followed ? "Following ✓" : "+ Follow"}
            </Text>
          </Bouncy>
        </Bouncy>
      )}
    />
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
