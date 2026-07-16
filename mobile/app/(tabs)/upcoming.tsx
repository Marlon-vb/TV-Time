import { useCallback } from "react";
import { SectionList, Text, View } from "react-native";
import { useRouter } from "expo-router";
import Bouncy from "@/components/Bouncy";
import Poster from "@/components/Poster";
import ScreenHeader from "@/components/ScreenHeader";
import { EmptyState, card } from "@/components/ui";
import { colors, fonts, TAB_BAR_CLEARANCE } from "@/lib/theme";
import { epCode, fmtDate, fmtTime, relativeDay } from "@/lib/format";
import * as repo from "@/lib/repo";
import { useFocusData } from "@/lib/useFocusData";
import type { UpcomingItem } from "@/lib/types";

interface DaySection {
  title: string;
  subtitle: string | null;
  data: UpcomingItem[];
}

export default function UpcomingScreen() {
  const router = useRouter();
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
  const { data } = useFocusData(loader);
  const sections = data ?? [];
  const count = sections.reduce((n, s) => n + s.data.length, 0);

  return (
    <SectionList
      sections={sections}
      keyExtractor={(item) => String(item.episode.id)}
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingBottom: TAB_BAR_CLEARANCE,
      }}
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={
        <ScreenHeader
          title="Upcoming"
          subtitle={
            count > 0
              ? `${count} scheduled episode${count === 1 ? "" : "s"}`
              : null
          }
        />
      }
      ListEmptyComponent={
        <EmptyState
          icon="calendar-outline"
          title="Nothing scheduled"
          body="None of your shows have announced episodes yet. New dates appear automatically after a sync."
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
        <Bouncy
          onPress={() => router.push(`/episode/${item.episode.id}` as never)}
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
      )}
    />
  );
}
