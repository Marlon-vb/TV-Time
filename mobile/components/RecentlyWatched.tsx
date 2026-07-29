import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Bouncy from "@/components/Bouncy";
import CheckButton from "@/components/CheckButton";
import Poster from "@/components/Poster";
import { card } from "@/components/ui";
import { colors, fonts } from "@/lib/theme";
import { epCode, relativeDay } from "@/lib/format";
import type { HistoryEntry } from "@/lib/repo";

/** Enough to undo a mis-tap or a session's worth of watching, not a second
 *  history screen — the diary is one tap away for that. */
export const RECENT_LIMIT = 10;

/**
 * The recently-watched list that lives just above the top of Watch Next.
 * Deliberately off-screen at rest: this tab is about what to watch next, and
 * what you already finished competes with that. Scroll up and it's there.
 *
 * Built as a dimmed mirror of the cards below rather than its own shape, so
 * scrolling up reads as continuing the same list backwards in time. Each row
 * keeps a ticked CheckButton: the whole point is being able to undo a wrong
 * tap, which puts the episode straight back into Watch Next.
 */
export default function RecentlyWatched({
  entries,
  onOpenEpisode,
  onOpenShow,
  onUnwatch,
  onOpenDiary,
}: {
  entries: HistoryEntry[];
  onOpenEpisode: (episodeId: number) => void;
  onOpenShow: (showId: number) => void;
  onUnwatch: (entry: HistoryEntry) => void;
  onOpenDiary: () => void;
}) {
  return (
    <View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginTop: 4,
          marginBottom: 10,
          paddingHorizontal: 2,
        }}
      >
        <Text
          style={{
            color: colors.faint,
            fontFamily: fonts.display,
            fontSize: 13,
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

      {entries.map((e) => (
        <WatchedCard
          key={e.episode_id}
          entry={e}
          onOpen={() => onOpenEpisode(e.episode_id)}
          onOpenShow={() => onOpenShow(e.show_id)}
          onUnwatch={() => onUnwatch(e)}
        />
      ))}
    </View>
  );
}

/**
 * The same card as Watch Next, held back. Everything except the check is
 * dimmed — the control has to stay at full contrast because it is the one
 * thing here you can act on, and a 55%-opacity tick would read as decoration.
 */
function WatchedCard({
  entry,
  onOpen,
  onOpenShow,
  onUnwatch,
}: {
  entry: HistoryEntry;
  onOpen: () => void;
  onOpenShow: () => void;
  onUnwatch: () => void;
}) {
  return (
    <Bouncy
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${entry.show_name}, ${epCode(entry.season, entry.number)}, watched ${relativeDay(entry.watched_at)}`}
      style={{
        ...card,
        flexDirection: "row",
        gap: 14,
        padding: 12,
        alignItems: "center",
        marginBottom: 10,
      }}
    >
      <View style={{ opacity: 0.55 }}>
        <Pressable onPress={onOpenShow} hitSlop={4}>
          <Poster
            src={entry.poster_url}
            name={entry.show_name}
            width={72}
            height={104}
          />
        </Pressable>
      </View>
      <View style={{ flex: 1, gap: 3, opacity: 0.55 }}>
        <Text
          style={{ color: colors.fg, fontFamily: fonts.display, fontSize: 16 }}
          numberOfLines={1}
        >
          {entry.show_name}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 13 }} numberOfLines={1}>
          <Text
            style={{
              fontFamily: fonts.displayMedium,
              color: colors.accent,
              fontSize: 12,
            }}
          >
            {epCode(entry.season, entry.number)}
          </Text>
          {"   "}
          {entry.episode_name}
        </Text>
        <Text style={{ color: colors.faint, fontSize: 11 }}>
          Watched {relativeDay(entry.watched_at)}
        </Text>
      </View>
      <CheckButton checked onToggle={onUnwatch} size={46} />
    </Bouncy>
  );
}
