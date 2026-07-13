import { useCallback, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Bouncy from "@/components/Bouncy";
import CheckButton from "@/components/CheckButton";
import Poster from "@/components/Poster";
import ScreenHeader from "@/components/ScreenHeader";
import { EmptyState, card } from "@/components/ui";
import { accentGradient, colors, fonts, TAB_BAR_CLEARANCE } from "@/lib/theme";
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
  const totalBehind = items.reduce((n, i) => n + i.aired_unwatched, 0);

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

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => String(item.episode.id)}
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingBottom: TAB_BAR_CLEARANCE,
        gap: 12,
      }}
      ListHeaderComponent={
        <ScreenHeader
          title="Watch Next"
          subtitle={
            items.length > 0
              ? `${totalBehind} episode${totalBehind === 1 ? "" : "s"} to catch up on`
              : null
          }
        />
      }
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.accent}
        />
      }
      ListEmptyComponent={
        <EmptyState
          icon="checkmark-done-outline"
          title="You're all caught up"
          body="No aired episodes waiting. Follow shows from Discover, or import your TV Time history in Settings."
        />
      }
      renderItem={({ item }) => (
        <WatchNextCard
          item={item}
          onOpen={() => router.push(`/episode/${item.episode.id}` as never)}
          onOpenShow={() => router.push(`/show/${item.show.id}` as never)}
          onWatched={() => {
            repo.markEpisode(item.episode.id, true);
            reload();
          }}
        />
      )}
    />
  );
}

function WatchNextCard({
  item,
  onOpen,
  onOpenShow,
  onWatched,
}: {
  item: WatchNextItem;
  onOpen: () => void;
  onOpenShow: () => void;
  onWatched: () => void;
}) {
  const behind = item.aired_unwatched - 1;
  return (
    <Bouncy
      onPress={onOpen}
      style={{
        ...card,
        flexDirection: "row",
        gap: 14,
        padding: 12,
        alignItems: "center",
      }}
    >
      <Pressable onPress={onOpenShow} hitSlop={4}>
        <Poster
          src={item.show.poster_url}
          name={item.show.name}
          width={72}
          height={104}
        />
      </Pressable>
      <View style={{ flex: 1, gap: 3 }}>
        <Text
          style={{ color: colors.fg, fontFamily: fonts.display, fontSize: 16 }}
          numberOfLines={1}
        >
          {item.show.name}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 13 }} numberOfLines={1}>
          <Text style={{ fontFamily: fonts.displayMedium, color: colors.accent, fontSize: 12 }}>
            {epCode(item.episode.season, item.episode.number)}
          </Text>
          {"   "}
          {item.episode.name}
        </Text>
        <Text style={{ color: colors.faint, fontSize: 11 }}>
          Aired {relativeDay(item.episode.airstamp)}
          {item.episode.runtime ? ` · ${item.episode.runtime} min` : ""}
        </Text>
        {behind > 0 && (
          <View style={{ alignSelf: "flex-start", marginTop: 5, borderRadius: 999, overflow: "hidden" }}>
            <LinearGradient
              colors={accentGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ paddingHorizontal: 9, paddingVertical: 3 }}
            >
              <Text style={{ color: colors.ink, fontSize: 10, fontWeight: "800" }}>
                +{behind} MORE BEHIND
              </Text>
            </LinearGradient>
          </View>
        )}
      </View>
      <CheckButton checked={false} onToggle={onWatched} size={46} />
    </Bouncy>
  );
}
