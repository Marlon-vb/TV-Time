import { useCallback, useMemo, useRef, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Bouncy from "@/components/Bouncy";
import Poster from "@/components/Poster";
import ScreenHeader from "@/components/ScreenHeader";
import { EmptyState, card } from "@/components/ui";
import { colors, fonts, radius, TAB_BAR_CLEARANCE } from "@/lib/theme";
import { epCode, fmtDate, fmtTime, relativeDay } from "@/lib/format";
import { localDateIso, monthGrid, shiftMonth } from "@/lib/calendar";
import * as repo from "@/lib/repo";
import { useFocusData } from "@/lib/useFocusData";
import { useTabTop } from "@/lib/useTabTop";
import type { UpcomingItem } from "@/lib/types";

interface DaySection {
  title: string;
  subtitle: string | null;
  data: UpcomingItem[];
}

export default function UpcomingScreen() {
  const router = useRouter();
  const listRef = useRef<SectionList<UpcomingItem>>(null);
  const calendarRef = useRef<ScrollView>(null);
  const loader = useCallback((): DaySection[] => {
    const items = repo.upcoming();
    const sections: DaySection[] = [];
    for (const item of items) {
      const day = item.episode.airstamp!.slice(0, 10);
      const label = relativeDay(day + "T12:00:00");
      const date = fmtDate(day + "T12:00:00");
      const last = sections[sections.length - 1];
      if (last && last.title === label) last.data.push(item);
      else
        sections.push({
          title: label,
          subtitle: label !== date ? date : null,
          data: [item],
        });
    }
    return sections;
  }, []);
  const { data, reload } = useFocusData(loader);
  const sections = data ?? [];
  const count = sections.reduce((n, s) => n + s.data.length, 0);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<"list" | "calendar">("list");

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
      // offline is fine — show what we have
    }
    reload();
    setRefreshing(false);
  };

  const header = (
    <View>
      <View style={{ marginHorizontal: -16 }}>
        <ScreenHeader
          title="Upcoming"
          subtitle={
            count > 0
              ? `${count} scheduled episode${count === 1 ? "" : "s"}`
              : null
          }
        />
      </View>
      <ViewToggle view={view} onChange={setView} />
    </View>
  );

  // Whichever view is mounted answers; the other ref is null.
  useTabTop(() => {
    calendarRef.current?.scrollTo({ y: 0, animated: true });
    // Through the scroll responder rather than scrollToLocation, which needs
    // a section to aim at and throws when there is nothing airing.
    listRef.current?.getScrollResponder()?.scrollTo({ y: 0, animated: true });
  });

  if (view === "calendar") {
    return (
      <ScrollView
        ref={calendarRef}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: TAB_BAR_CLEARANCE,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={colors.accent}
          />
        }
      >
        {header}
        <CalendarView
          sections={sections}
          onOpenEpisode={(id) => router.push(`/episode/${id}` as never)}
        />
      </ScrollView>
    );
  }

  return (
    <SectionList
      ref={listRef}
      sections={sections}
      keyExtractor={(item) => String(item.episode.id)}
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingBottom: TAB_BAR_CLEARANCE,
      }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void onRefresh()}
          tintColor={colors.accent}
        />
      }
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={header}
      ListEmptyComponent={
        <EmptyState
          icon="calendar-outline"
          title="Nothing scheduled"
          body="None of your shows have announced episodes yet. Pull down to check for new dates."
        />
      }
      renderSectionHeader={({ section }) => (
        <View
          style={{
            flexDirection: "row",
            alignItems: "baseline",
            gap: 8,
            marginTop: 18,
            marginBottom: 9,
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
          {section.subtitle && (
            <Text style={{ color: colors.faint, fontSize: 11 }}>
              {section.subtitle}
            </Text>
          )}
        </View>
      )}
      renderItem={({ item }) => (
        <EpisodeRow
          item={item}
          onPress={() => router.push(`/episode/${item.episode.id}` as never)}
        />
      )}
    />
  );
}

/* -------------------------------------------------------------- shared row */

function EpisodeRow({
  item,
  onPress,
}: {
  item: UpcomingItem;
  onPress: () => void;
}) {
  return (
    <Bouncy
      onPress={onPress}
      style={{
        ...card,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        padding: 10,
        marginBottom: 8,
      }}
    >
      <Poster
        src={item.show.poster_url}
        name={item.show.name}
        width={46}
        height={66}
        radius={9}
      />
      <View style={{ flex: 1 }}>
        <Text
          style={{ color: colors.fg, fontFamily: fonts.display, fontSize: 14 }}
          numberOfLines={1}
        >
          {item.show.name}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
          <Text style={{ fontFamily: fonts.displayMedium, color: colors.accent, fontSize: 11 }}>
            {epCode(item.episode.season, item.episode.number)}
          </Text>
          {item.episode.name ? `   ${item.episode.name}` : ""}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 1 }}>
        <Text
          style={{
            color: colors.fg,
            fontFamily: fonts.displayMedium,
            fontSize: 12,
          }}
        >
          {fmtTime(item.episode.airstamp!)}
        </Text>
        {item.show.network && (
          <Text style={{ color: colors.faint, fontSize: 10 }}>
            {item.show.network}
          </Text>
        )}
      </View>
    </Bouncy>
  );
}

/* ------------------------------------------------------------- view toggle */

function ViewToggle({
  view,
  onChange,
}: {
  view: "list" | "calendar";
  onChange: (v: "list" | "calendar") => void;
}) {
  const seg = (v: "list" | "calendar", icon: "list" | "calendar-clear", label: string) => {
    const active = view === v;
    return (
      <Pressable
        onPress={() => onChange(v)}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        accessibilityLabel={`${label} view`}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingHorizontal: 12,
          paddingVertical: 7,
          borderRadius: radius.sm,
          backgroundColor: active ? colors.overlay : "transparent",
        }}
      >
        <Ionicons
          name={icon}
          size={13}
          color={active ? colors.fg : colors.faint}
        />
        <Text
          style={{
            color: active ? colors.fg : colors.faint,
            fontSize: 12,
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
        alignSelf: "flex-start",
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: radius.sm + 2,
        padding: 2,
        marginTop: 10,
        marginBottom: 4,
      }}
    >
      {seg("list", "list", "List")}
      {seg("calendar", "calendar-clear", "Calendar")}
    </View>
  );
}

/* ---------------------------------------------------------------- calendar */

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function CalendarView({
  sections,
  onOpenEpisode,
}: {
  sections: DaySection[];
  onOpenEpisode: (episodeId: number) => void;
}) {
  const today = localDateIso(new Date());
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [selected, setSelected] = useState<string | null>(null);

  // Day → episodes airing that day (keyed like the list view: the date part
  // of the airstamp).
  const byDay = useMemo(() => {
    const map = new Map<string, UpcomingItem[]>();
    for (const section of sections) {
      for (const item of section.data) {
        const day = item.episode.airstamp!.slice(0, 10);
        const list = map.get(day);
        if (list) list.push(item);
        else map.set(day, [item]);
      }
    }
    return map;
  }, [sections]);

  const grid = monthGrid(cursor.year, cursor.month);
  const selectedItems = selected ? (byDay.get(selected) ?? []) : [];

  return (
    <View style={{ gap: 12, marginTop: 8 }}>
      <View style={{ ...card, padding: 14, gap: 10 }}>
        {/* Month header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Pressable
            onPress={() => setCursor((c) => shiftMonth(c.year, c.month, -1))}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            style={{ padding: 4 }}
          >
            <Ionicons name="chevron-back" size={18} color={colors.muted} />
          </Pressable>
          <Text
            style={{ color: colors.fg, fontFamily: fonts.display, fontSize: 15 }}
          >
            {grid.title}
          </Text>
          <Pressable
            onPress={() => setCursor((c) => shiftMonth(c.year, c.month, 1))}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Next month"
            style={{ padding: 4 }}
          >
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        </View>

        {/* Weekday header */}
        <View style={{ flexDirection: "row" }}>
          {WEEKDAYS.map((d, i) => (
            <Text
              key={i}
              style={{
                flex: 1,
                textAlign: "center",
                color: colors.faint,
                fontSize: 10,
                fontFamily: fonts.displayMedium,
              }}
            >
              {d}
            </Text>
          ))}
        </View>

        {/* Day grid */}
        {grid.weeks.map((week, wi) => (
          <View key={wi} style={{ flexDirection: "row" }}>
            {week.map((day) => {
              const count = byDay.get(day.iso)?.length ?? 0;
              const isSelected = selected === day.iso;
              const isToday = day.iso === today;
              return (
                <Pressable
                  key={day.iso}
                  onPress={() =>
                    setSelected((s) => (s === day.iso ? null : day.iso))
                  }
                  disabled={count === 0}
                  accessibilityRole="button"
                  accessibilityLabel={
                    `${day.iso}` +
                    (count > 0
                      ? `, ${count} episode${count === 1 ? "" : "s"}`
                      : "")
                  }
                  style={{
                    flex: 1,
                    aspectRatio: 1,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: radius.sm,
                    backgroundColor: isSelected ? colors.overlay : "transparent",
                    borderWidth: isToday ? 1 : 0,
                    borderColor: colors.accent,
                  }}
                >
                  <Text
                    style={{
                      color: !day.inMonth
                        ? colors.faint
                        : count > 0
                          ? colors.fg
                          : colors.muted,
                      fontSize: 13,
                      fontFamily:
                        count > 0 ? fonts.displayMedium : undefined,
                      opacity: day.inMonth ? 1 : 0.45,
                    }}
                  >
                    {day.day}
                  </Text>
                  {count > 0 && (
                    <View
                      style={{
                        position: "absolute",
                        bottom: 5,
                        width: 5,
                        height: 5,
                        borderRadius: 2.5,
                        backgroundColor: colors.accent,
                      }}
                    />
                  )}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      {/* Selected day's episodes */}
      {selected ? (
        selectedItems.length > 0 ? (
          <View style={{ gap: 2 }}>
            <Text
              style={{
                color: colors.accent,
                fontFamily: fonts.display,
                fontSize: 13,
                textTransform: "uppercase",
                letterSpacing: 1.2,
                marginBottom: 8,
              }}
            >
              {relativeDay(selected + "T12:00:00")}
            </Text>
            {selectedItems.map((item) => (
              <EpisodeRow
                key={item.episode.id}
                item={item}
                onPress={() => onOpenEpisode(item.episode.id)}
              />
            ))}
          </View>
        ) : null
      ) : (
        <Text
          style={{
            color: colors.faint,
            fontSize: 12,
            textAlign: "center",
            marginTop: 2,
          }}
        >
          {byDay.size > 0
            ? "Tap a dotted day to see what airs."
            : "Nothing scheduled this month — none of your shows have announced episodes yet."}
        </Text>
      )}
    </View>
  );
}
