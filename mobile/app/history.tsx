import { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  SectionList,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import Bouncy from "@/components/Bouncy";
import Poster from "@/components/Poster";
import { EmptyState, card } from "@/components/ui";
import { colors, fonts, radius } from "@/lib/theme";
import { epCode, fmtDate, relativeDay } from "@/lib/format";
import { ratingLabel } from "@/components/StarRating";
import * as repo from "@/lib/repo";
import type { HistoryEntry } from "@/lib/repo";

const PAGE = 100;

interface DaySection {
  title: string;
  data: HistoryEntry[];
}

/**
 * The watch diary: every watched episode, newest first, with editable dates —
 * imports land on air dates, but sometimes you know you binged it last summer.
 */
export default function HistoryScreen() {
  const router = useRouter();
  const [entries, setEntries] = useState<HistoryEntry[]>(() =>
    repo.watchHistory(PAGE, 0)
  );
  const [hasMore, setHasMore] = useState(entries.length === PAGE);
  const [editing, setEditing] = useState<HistoryEntry | null>(null);

  const loadMore = () => {
    if (!hasMore) return;
    const more = repo.watchHistory(PAGE, entries.length);
    setEntries((prev) => [...prev, ...more]);
    setHasMore(more.length === PAGE);
  };

  const sections = useMemo(() => {
    const out: DaySection[] = [];
    for (const entry of entries) {
      const day = entry.watched_at.slice(0, 10);
      const title = relativeDay(day + "T12:00:00");
      const last = out[out.length - 1];
      if (last && last.title === title) last.data.push(entry);
      else out.push({ title, data: [entry] });
    }
    return out;
  }, [entries]);

  const applyDate = (event: DateTimePickerEvent, picked?: Date) => {
    const entry = editing;
    setEditing(null);
    if (!entry || event.type !== "set" || !picked) return;
    repo.setWatchedDate(entry.episode_id, picked.toISOString());
    // Order may have changed — reload the whole loaded window.
    setEntries(repo.watchHistory(Math.max(entries.length, PAGE), 0));
  };

  return (
    <View style={{ flex: 1 }}>
      <SectionList
        sections={sections}
        keyExtractor={(e) => String(e.episode_id)}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        stickySectionHeadersEnabled={false}
        onEndReachedThreshold={0.4}
        onEndReached={loadMore}
        ListEmptyComponent={
          <EmptyState
            icon="time-outline"
            title="No watch history yet"
            body="Episodes you mark as watched appear here, day by day."
          />
        }
        renderSectionHeader={({ section }) => (
          <Text
            style={{
              color: colors.accent,
              fontFamily: fonts.display,
              fontSize: 13,
              textTransform: "uppercase",
              letterSpacing: 1.2,
              marginTop: 18,
              marginBottom: 9,
              paddingHorizontal: 2,
            }}
          >
            {section.title}
          </Text>
        )}
        renderItem={({ item }) => (
          <Bouncy
            onPress={() => router.push(`/episode/${item.episode_id}` as never)}
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
              src={item.poster_url}
              name={item.show_name}
              width={40}
              height={58}
              radius={8}
            />
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: colors.fg,
                  fontFamily: fonts.display,
                  fontSize: 13,
                }}
                numberOfLines={1}
              >
                {item.show_name}
              </Text>
              <Text
                style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}
                numberOfLines={1}
              >
                <Text
                  style={{
                    fontFamily: fonts.displayMedium,
                    color: colors.accent,
                    fontSize: 11,
                  }}
                >
                  {epCode(item.season, item.number)}
                </Text>
                {item.episode_name ? `   ${item.episode_name}` : ""}
              </Text>
              {item.rating != null && (
                <Text style={{ color: colors.faint, fontSize: 11, marginTop: 2 }}>
                  ★ {ratingLabel(item.rating)}
                </Text>
              )}
            </View>
            <Pressable
              onPress={() => setEditing(item)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Edit watch date for ${item.show_name} ${epCode(item.season, item.number)}`}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                paddingHorizontal: 10,
                paddingVertical: 7,
                borderRadius: radius.sm,
                backgroundColor: colors.raised,
                borderWidth: 1,
                borderColor: colors.line,
              }}
            >
              <Ionicons name="calendar-outline" size={12} color={colors.muted} />
              <Text style={{ color: colors.muted, fontSize: 11 }}>
                {fmtDate(item.watched_at)}
              </Text>
            </Pressable>
          </Bouncy>
        )}
      />

      {/* Date editor */}
      <Modal
        visible={editing != null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditing(null)}
      >
        <Pressable
          onPress={() => setEditing(null)}
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.6)",
            justifyContent: "center",
            padding: 24,
          }}
        >
          {/* Inner Pressable swallows taps so the sheet doesn't dismiss. */}
          <Pressable
            style={{
              backgroundColor: colors.surface,
              borderRadius: radius.lg,
              borderWidth: 1,
              borderColor: colors.line,
              padding: 16,
              gap: 8,
            }}
          >
            <Text
              style={{ color: colors.fg, fontFamily: fonts.display, fontSize: 15 }}
            >
              When did you watch it?
            </Text>
            {editing && (
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                {editing.show_name} · {epCode(editing.season, editing.number)}
              </Text>
            )}
            {editing && (
              <DateTimePicker
                value={new Date(editing.watched_at)}
                mode="date"
                display="inline"
                maximumDate={new Date()}
                themeVariant="dark"
                accentColor={colors.accent}
                onChange={applyDate}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
