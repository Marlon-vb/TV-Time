import { useCallback, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Poster from "@/components/Poster";
import { EmptyState } from "@/components/ui";
import { colors } from "@/lib/theme";
import { epCode, relativeDay } from "@/lib/format";
import * as repo from "@/lib/repo";
import { rescheduleAll } from "@/lib/notifications";
import { useFocusData } from "@/lib/useFocusData";
import type { WatchNextItem } from "@/lib/types";

export default function WatchNextScreen() {
  const router = useRouter();
  const loader = useCallback(() => repo.watchNext(), []);
  const { data, reload } = useFocusData(loader);
  const [refreshing, setRefreshing] = useState(false);
  const items = data ?? [];

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await repo.syncStaleShows(0);
      await rescheduleAll();
    } catch {
      // offline is fine — show what we have
    }
    reload();
    setRefreshing(false);
  };

  const markWatched = (item: WatchNextItem) => {
    repo.markEpisode(item.episode.id, true);
    reload();
  };

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => String(item.episode.id)}
      contentContainerStyle={{ padding: 14, gap: 10 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.accent}
        />
      }
      ListEmptyComponent={
        <EmptyState
          title="You're all caught up"
          body="No aired episodes waiting. Follow shows from Discover, or import your TV Time history in Settings."
        />
      }
      renderItem={({ item }) => {
        const behind = item.aired_unwatched - 1;
        return (
          <Pressable
            onPress={() => router.push(`/show/${item.show.id}` as never)}
            style={{
              flexDirection: "row",
              gap: 12,
              backgroundColor: colors.surface,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: colors.line,
              padding: 10,
              alignItems: "center",
            }}
          >
            <Poster
              src={item.show.poster_url}
              name={item.show.name}
              width={64}
              height={92}
            />
            <View style={{ flex: 1, gap: 2 }}>
              <Text
                style={{ color: colors.fg, fontWeight: "700", fontSize: 15 }}
                numberOfLines={1}
              >
                {item.show.name}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 13 }} numberOfLines={1}>
                <Text style={{ fontWeight: "700", color: colors.fg }}>
                  {epCode(item.episode.season, item.episode.number)}
                </Text>
                {"  "}
                {item.episode.name}
              </Text>
              <Text style={{ color: colors.faint, fontSize: 11 }}>
                Aired {relativeDay(item.episode.airstamp)}
                {item.episode.runtime ? ` · ${item.episode.runtime} min` : ""}
              </Text>
              {behind > 0 && (
                <View
                  style={{
                    alignSelf: "flex-start",
                    backgroundColor: colors.overlay,
                    borderRadius: 999,
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    marginTop: 3,
                  }}
                >
                  <Text
                    style={{
                      color: colors.accent,
                      fontSize: 10,
                      fontWeight: "700",
                    }}
                  >
                    +{behind} more behind
                  </Text>
                </View>
              )}
            </View>
            <Pressable
              onPress={() => markWatched(item)}
              hitSlop={8}
              style={({ pressed }) => ({
                width: 46,
                height: 66,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: pressed ? colors.accent : colors.line,
                backgroundColor: pressed ? colors.accent : "transparent",
                alignItems: "center",
                justifyContent: "center",
              })}
            >
              {({ pressed }) => (
                <Ionicons
                  name="checkmark"
                  size={24}
                  color={pressed ? colors.ink : colors.muted}
                />
              )}
            </Pressable>
          </Pressable>
        );
      }}
    />
  );
}
