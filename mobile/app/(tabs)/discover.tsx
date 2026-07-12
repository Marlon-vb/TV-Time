import { useEffect, useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import Poster from "@/components/Poster";
import { colors } from "@/lib/theme";
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
    <View style={{ flex: 1, padding: 14 }}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search for a TV show…"
        placeholderTextColor={colors.faint}
        autoCorrect={false}
        style={{
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: 12,
          paddingHorizontal: 14,
          paddingVertical: 12,
          color: colors.fg,
          fontSize: 15,
          marginBottom: 12,
        }}
      />

      {status === "idle" && (
        <Text style={{ color: colors.faint, fontSize: 13 }}>
          Search TVmaze&apos;s catalog of 80,000+ shows. Everything you follow
          is stored on this device.
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

      <FlatList
        data={results}
        keyExtractor={(s) => String(s.id)}
        contentContainerStyle={{ gap: 10, paddingTop: 4 }}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/show/${item.id}` as never)}
            style={{
              flexDirection: "row",
              gap: 12,
              alignItems: "center",
              backgroundColor: colors.surface,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.line,
              padding: 10,
            }}
          >
            <Poster src={item.posterUrl} name={item.name} width={52} height={74} radius={8} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.fg, fontWeight: "700" }} numberOfLines={1}>
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
                <Text style={{ color: colors.faint, fontSize: 11, marginTop: 3 }} numberOfLines={2}>
                  {item.summary}
                </Text>
              )}
            </View>
            <Pressable
              onPress={() => !item.followed && follow(item)}
              disabled={item.followed || busyId === item.id}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 9,
                borderRadius: 10,
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
            </Pressable>
          </Pressable>
        )}
      />
    </View>
  );
}
