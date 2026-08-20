import { useCallback, useEffect, useRef, useState } from "react";
import {
  Pressable,
  RefreshControl,
  SectionList,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Bouncy from "@/components/Bouncy";
import CheckButton from "@/components/CheckButton";
import Poster from "@/components/Poster";
import RecentlyWatched, { RECENT_LIMIT } from "@/components/RecentlyWatched";
import ScreenHeader from "@/components/ScreenHeader";
import { EmptyState, card } from "@/components/ui";
import { accentGradient, colors, fonts, TAB_BAR_CLEARANCE } from "@/lib/theme";
import { epCode, relativeDay } from "@/lib/format";
import * as repo from "@/lib/repo";
import { rescheduleAll } from "@/lib/notifications";
import { groupWatchNext } from "@/lib/watchNextSections";
import { syncUpNextWidget } from "@/lib/widget";
import { useFocusData } from "@/lib/useFocusData";
import { useTabTop } from "@/lib/useTabTop";
import * as social from "@/lib/social/api";
import type { WatchNextItem } from "@/lib/types";

export default function WatchNextScreen() {
  const router = useRouter();
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const loader = useCallback(() => {
    const items = repo.watchNext();
    // Keep the home-screen widget in sync with what we show here.
    syncUpNextWidget(items);
    return {
      items,
      sections: groupWatchNext(items, new Date()),
      // Newest-first from the query, reversed for display: scrolling up walks
      // backwards in time, and the episode you just ticked ends up adjacent to
      // Watch Next rather than a screen away from it.
      recent: repo.watchHistory(RECENT_LIMIT, 0).reverse(),
    };
  }, []);
  const { data, reload } = useFocusData(loader);
  const [refreshing, setRefreshing] = useState(false);
  const sections = data?.sections ?? [];
  const recent = data?.recent ?? [];

  // Parking the scroll position past the recently-watched list, once, after
  // everything is laid out. It can't be done with ScrollView's initial
  // `contentOffset`: useFocusData has no data on the first render, so at that
  // point the content is too short to hold the offset and iOS clamps it
  // straight back to zero.
  //
  // What's measured is where the masthead sits, not how tall the list above it
  // is. Parking at the masthead's own offset means any spacing change between
  // the two is absorbed for free, instead of silently moving the park target.
  const listRef = useRef<SectionList<WatchNextItem>>(null);
  const parkedOnce = useRef(false);
  const contentHeight = useRef(0);
  // State, not a ref: the minimum content height below depends on it, so a
  // silent ref update would leave that guard computed against zero.
  const [mastheadY, setMastheadY] = useState(0);
  const [parked, setParked] = useState(false);

  // Called from both measurements; whichever lands second does the work.
  const tryPark = useCallback(() => {
    if (parkedOnce.current || mastheadY === 0) return;
    // Still mid-layout — scrolling now would clamp and burn the one shot.
    if (contentHeight.current < mastheadY + 40) return;
    parkedOnce.current = true;
    listRef.current
      ?.getScrollResponder()
      ?.scrollTo({ y: mastheadY, animated: false });
    setParked(true);
  }, [mastheadY]);

  // Back to where the screen rests, not to offset zero: zero is the top of the
  // recently-watched list, which this tab deliberately keeps out of view.
  useTabTop(() => {
    listRef.current
      ?.getScrollResponder()
      ?.scrollTo({ y: mastheadY, animated: true });
  });

  // onLayout only records the position; parking waits for the re-render so it
  // uses the measured value rather than the one captured before it was known.
  // A mastheadY of 0 means nothing is above it, so there is nothing to park.
  useEffect(() => {
    tryPark();
  }, [tryPark]);
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
      // A capped, paced pass prioritizing the shows that most recently aired
      // something — what a refreshing user is actually looking for. The
      // launch + 12-hourly background syncs keep the long tail fresh. The
      // 15-min staleness floor keeps back-to-back pulls off TVmaze's budget.
      await repo.syncStaleShows(0.25, {
        limit: 20,
        concurrency: 4,
        prioritize: "activity",
      });
      await rescheduleAll();
    } catch {
      // offline is fine — show what we have
    }
    reload();
    setRefreshing(false);
  };

  return (
    <SectionList
      ref={listRef}
      sections={sections}
      keyExtractor={(item) => String(item.episode.id)}
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingBottom: TAB_BAR_CLEARANCE,
        // Guarantee there's a screenful below the list. Without this a small
        // library makes the content shorter than the viewport, the parked
        // offset can't hold, and the watched episodes sit in plain sight.
        minHeight: recent.length ? windowHeight + mastheadY : undefined,
      }}
      onContentSizeChange={(_w, h) => {
        contentHeight.current = h;
        tryPark();
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
        <>
          {recent.length > 0 && (
            // Hidden until parked, not to animate it in but to swallow the
            // frame between "content is tall enough" and "we have scrolled" —
            // otherwise these flash at the top on launch.
            <View
              style={{
                opacity: parked ? 1 : 0,
                // The masthead clears the status bar with its own paddingTop,
                // but this sits above the masthead, so at scroll offset 0 the
                // first card had nothing between it and the notch — you hit
                // the end of the scroll with the row still half-covered.
                paddingTop: insets.top + 14,
                // Pull the masthead up: its own paddingTop clears the status
                // bar, which is right at rest but leaves a hole once you have
                // scrolled past it. Negative margin here rather than less
                // padding there, so the masthead is untouched on every other
                // tab — and the park target follows it automatically.
                marginBottom: -34,
              }}
            >
              <RecentlyWatched
                entries={recent}
                onOpenEpisode={(id) => router.push(`/episode/${id}` as never)}
                onOpenShow={(id) => router.push(`/show/${id}` as never)}
                onOpenDiary={() => router.push("/history" as never)}
                onUnwatch={(entry) => {
                  // Straight back into Watch Next, or into "haven't watched in
                  // a while" if that's where the show now belongs — both fall
                  // out of watchNext() on the reload.
                  repo.markEpisode(entry.episode_id, false);
                  reload();
                  void social.unrecordWatch(
                    entry.show_id,
                    entry.season,
                    entry.number
                  );
                }}
              />
            </View>
          )}
          {/* Cancel the list's 16pt gutter so the masthead sits at its own
              18pt on every tab. */}
          <View
            style={{ marginHorizontal: -16 }}
            onLayout={(e) => setMastheadY(e.nativeEvent.layout.y)}
          >
            <ScreenHeader
              title="Watch Next"
              subtitle={
                totalBehind > 0
                  ? `${totalBehind} episode${totalBehind === 1 ? "" : "s"} to catch up on`
                  : null
              }
            />
          </View>
        </>
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
            // No catch-up prompt here, deliberately: watchNext() selects the
            // MIN unwatched aired episode per show, so by construction there
            // is never an aired gap in front of this one to offer.
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
