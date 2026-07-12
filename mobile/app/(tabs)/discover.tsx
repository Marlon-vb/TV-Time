import { useEffect, useRef, useState } from "react";
import { FlatList, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Bouncy from "@/components/Bouncy";
import Poster from "@/components/Poster";
import ScreenHeader from "@/components/ScreenHeader";
import { card } from "@/components/ui";
import { colors, fonts, radius, TAB_BAR_CLEARANCE } from "@/lib/theme";
import * as tvmaze from "@/lib/tvmaze";
import * as repo from "@/lib/repo";
import type { RemoteShow } from "@/lib/types";

type Result = RemoteShow & { followed: boolean };

export default function DiscoverScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle"
  );
  const [busyId, setBusyId] = useState<number | null>(null);
  const generation = useRef(0);

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
          <ScreenHeader title="Discover" />
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
            <Text style={{ color: colors.faint, fontSize: 13, lineHeight: 19 }}>
              Everything you follow is stored on this device — no account, no
              cloud.
            </Text>
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
