import { useCallback, useState } from "react";
import {
  Pressable,
  RefreshControl,
  SectionList,
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
import { groupWatchNext } from "@/lib/watchNextSections";
import { syncUpNextWidget } from "@/lib/widget";
import { useFocusData } from "@/lib/useFocusData";
import * as social from "@/lib/social/api";
import type { WatchNextItem } from "@/lib/types";

export default function WatchNextScreen() {
  const router = useRouter();
  const loader = useCallback(() => {
    const items = repo.watchNext();
    // Keep the home-screen widget in sync with what we show here.
    syncUpNextWidget(items);
    return { items, sections: groupWatchNext(items, new Date()) };
  }, []);
  const { data, reload } = useFocusData(loader);
  const [refreshing, setRefreshing] = useState(false);
  const items = data?.items ?? [];
  const sections = data?.sections ?? [];
  // Only count the shows you're actively watching (the "Up Next" bucket) —
  // idle and not-yet-started shows don't count as episodes to catch up on.
  const upNext = sections.find((s) => s.key === "up_next");
  const totalBehind = (upNext?.data ?? []).reduce(
    (n, i) => n + i.aired_unwatched,
    0
  );

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
    <SectionList
      sections={sections}
      keyExtractor={(item) => String(item.episode.id)}
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingBottom: TAB_BAR_CLEARANCE,
      }}
      stickySectionHeadersEnabled={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.accent}
        />
      }
      ListHeaderComponent={
        <ScreenHeader
          title="Watch Next"
          subtitle={
            totalBehind > 0
              ? `${totalBehind} episode${totalBehind === 1 ? "" : "s"} to catch up on`
              : null
          }
        />
      }
      ListEmptyComponent={
        <View style={{ marginTop: 12 }}>
          <EmptyState
            icon="checkmark-done-outline"
            title="You're all caught up"
            body="No aired episodes waiting. Follow shows from Discover, or import your TV Time history in Settings."
          />
        </View>
      }
      renderSectionHeader={({ section }) => (
        <View
          style={{
            flexDirection: "row",
            alignItems: "baseline",
            gap: 8,
            marginTop: 20,
            marginBottom: 10,
            paddingHorizontal: 2,
          }}
        >
          <Text
            style={{
              color: colors.accent,
              fontFamily: fonts.display,
              fontSize: 13,
              textTransform: "uppercase",
              letterSpacing: 1.2,
            }}
          >
            {section.title}
          </Text>
          <Text style={{ color: colors.faint, fontSize: 11 }}>
            {section.data.length}
          </Text>
        </View>
      )}
      renderItem={({ item }) => (
        <WatchNextCard
          item={item}
          onOpen={() => router.push(`/episode/${item.episode.id}` as never)}
          onOpenShow={() => router.push(`/show/${item.show.id}` as never)}
          onWatched={() => {
            repo.markEpisode(item.episode.id, true);
            reload();
            // Mirror to the social layer (no-op when signed out).
            void social.recordWatchForEpisode(item.show, item.episode);
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
        marginBottom: 10,
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
