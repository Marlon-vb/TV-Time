import { Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Poster from "@/components/Poster";
import { colors, fonts } from "@/lib/theme";
import { epCode, relativeDay } from "@/lib/format";
import type { HistoryEntry } from "@/lib/repo";

/**
 * Fixed, not measured. Watch Next parks its scroll position exactly this far
 * down to hide the strip, so the number here and the layout below have to agree
 * — if they drift, the strip either peeks out or clips. The pieces add up to:
 * 30 label row + 124 card + 18 tail.
 */
export const RECENT_STRIP_HEIGHT = 172;

const CARD_W = 60;

/**
 * The recently-watched strip that lives just above the top of Watch Next.
 * Deliberately off-screen at rest: this tab is about what to watch next, and a
 * list of what you already finished competes with that. Scroll up and it's
 * there.
 */
export default function RecentlyWatched({
  entries,
  onOpenEpisode,
  onOpenDiary,
}: {
  entries: HistoryEntry[];
  onOpenEpisode: (episodeId: number) => void;
  onOpenDiary: () => void;
}) {
  return (
    <View style={{ height: RECENT_STRIP_HEIGHT }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          height: 20,
          marginBottom: 10,
          paddingHorizontal: 2,
        }}
      >
        <Text
          style={{
            color: colors.faint,
            fontFamily: fonts.display,
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: 1.2,
          }}
        >
          Recently watched
        </Text>
        <Pressable
          onPress={onOpenDiary}
          hitSlop={12}
          accessibilityRole="link"
          accessibilityLabel="Open your full watch diary"
          style={{ flexDirection: "row", alignItems: "center", gap: 2 }}
        >
          <Text style={{ color: colors.accent, fontSize: 12, fontWeight: "600" }}>
            Diary
          </Text>
          <Ionicons name="chevron-forward" size={12} color={colors.accent} />
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        // Cancel the list's gutter so the row can bleed to both edges.
        style={{ marginHorizontal: -16 }}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
      >
        {entries.map((e) => (
          <Pressable
            key={e.episode_id}
            onPress={() => onOpenEpisode(e.episode_id)}
            accessibilityRole="button"
            accessibilityLabel={`${e.show_name}, ${epCode(e.season, e.number)}, watched ${relativeDay(e.watched_at)}`}
            style={{ width: CARD_W, gap: 6 }}
          >
            <Poster
              src={e.poster_url}
              name={e.show_name}
              width={CARD_W}
              height={88}
              radius={8}
            />
            <View style={{ gap: 2 }}>
              <Text
                style={{
                  color: colors.muted,
                  fontFamily: fonts.displayMedium,
                  fontSize: 11,
                  height: 14,
                }}
                numberOfLines={1}
              >
                {epCode(e.season, e.number)}
              </Text>
              <Text
                style={{ color: colors.faint, fontSize: 10, height: 14 }}
                numberOfLines={1}
              >
                {relativeDay(e.watched_at)}
              </Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
