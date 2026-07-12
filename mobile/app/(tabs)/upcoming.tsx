import { useCallback } from "react";
import { Pressable, SectionList, Text, View } from "react-native";
import { useRouter } from "expo-router";
import Poster from "@/components/Poster";
import { EmptyState } from "@/components/ui";
import { colors } from "@/lib/theme";
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
    const items = repo.upcoming(90);
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

  return (
    <SectionList
      sections={data ?? []}
      keyExtractor={(item) => String(item.episode.id)}
      contentContainerStyle={{ padding: 14 }}
      stickySectionHeadersEnabled={false}
      ListEmptyComponent={
        <EmptyState
          title="Nothing scheduled"
          body="None of your shows have announced episodes in the next 90 days. New dates appear automatically after a sync."
        />
      }
      renderSectionHeader={({ section }) => (
        <View
          style={{
            flexDirection: "row",
            alignItems: "baseline",
            gap: 8,
            marginTop: 14,
            marginBottom: 8,
          }}
        >
          <Text
            style={{
              color: colors.accent,
              fontWeight: "800",
              fontSize: 13,
              textTransform: "uppercase",
              letterSpacing: 0.5,
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
        <Pressable
          onPress={() => router.push(`/show/${item.show.id}` as never)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            backgroundColor: colors.surface,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.line,
            padding: 10,
            marginBottom: 8,
          }}
        >
          <Poster
            src={item.show.poster_url}
            name={item.show.name}
            width={44}
            height={62}
            radius={8}
          />
          <View style={{ flex: 1 }}>
            <Text
              style={{ color: colors.fg, fontWeight: "700", fontSize: 14 }}
              numberOfLines={1}
            >
              {item.show.name}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={1}>
              <Text style={{ fontWeight: "700", color: colors.fg }}>
                {epCode(item.episode.season, item.episode.number)}
              </Text>
              {item.episode.name ? `  ${item.episode.name}` : ""}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ color: colors.fg, fontWeight: "600", fontSize: 12 }}>
              {fmtTime(item.episode.airstamp!)}
            </Text>
            {item.show.network && (
              <Text style={{ color: colors.faint, fontSize: 10 }}>
                {item.show.network}
              </Text>
            )}
          </View>
        </Pressable>
      )}
    />
  );
}
