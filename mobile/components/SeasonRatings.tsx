import { useRef, useState } from "react";
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { colors, fonts, radius } from "@/lib/theme";
import {
  buildRatingMap,
  initialSeasonIndex,
  RATING_TIERS,
  tierFor,
  UNRATED,
  type RatingCell,
} from "@/lib/rating-map";
import type { EpisodeRow } from "@/lib/types";

/**
 * One season of ratings at a time; swipe sideways for the rest.
 *
 * Every season stacked at once is the version that fits a desktop page. On a
 * phone it either shrinks the tiles until the numbers are unreadable or runs
 * the section down half the screen. Paging keeps a season at full width, which
 * is the unit people actually compare — "season three fell apart" is a claim
 * about a season, not about episode 14.
 */
const PER_ROW = 5;
const GAP = 6;
/** The page's own gutter, so a page can be exactly as wide as the viewport. */
const PAGE_INSET = 18;

export default function SeasonRatings({
  episodes,
  onOpenEpisode,
}: {
  episodes: EpisodeRow[];
  onOpenEpisode: (episodeId: number) => void;
}) {
  const { width } = useWindowDimensions();
  const map = buildRatingMap(episodes);
  const pageWidth = width - PAGE_INSET * 2;
  const tile = (pageWidth - GAP * (PER_ROW - 1)) / PER_ROW;

  const scroller = useRef<ScrollView>(null);
  const [index, setIndex] = useState(() => initialSeasonIndex(map, episodes));
  const [picked, setPicked] = useState<RatingCell | null>(null);

  const onPaged = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / pageWidth);
    if (next !== index) {
      setIndex(next);
      setPicked(null);
    }
  };

  const current = map.seasons[index];

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
        <Text
          style={{
            color: colors.accent,
            fontFamily: fonts.display,
            fontSize: 13,
            textTransform: "uppercase",
            letterSpacing: 1.2,
          }}
        >
          Episode ratings
        </Text>
        <Text style={{ color: colors.faint, fontSize: 11 }}>TVmaze</Text>
      </View>

      {/* The bands are named, so the colours mean something without having to
          be learned from the chart itself. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: "row", gap: 12 }}>
          {RATING_TIERS.map((t) => (
            <View key={t.label} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <View
                style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: t.color }}
              />
              <Text style={{ color: colors.muted, fontSize: 10.5 }}>{t.label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
        <Text style={{ color: colors.fg, fontFamily: fonts.display, fontSize: 15 }}>
          Season {current?.season ?? 1}
        </Text>
        {current?.average != null && (
          <Text style={{ color: colors.faint, fontSize: 12 }}>
            avg {current.average.toFixed(1)}
          </Text>
        )}
        <Text style={{ color: colors.faint, fontSize: 11, marginLeft: "auto" }}>
          {index + 1} / {map.seasons.length}
        </Text>
      </View>

      {/* Negative margin lets a page be the full screen width while the section
          around it keeps the show page's gutter. */}
      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onPaged}
        contentOffset={{ x: index * pageWidth, y: 0 }}
        style={{ marginHorizontal: -PAGE_INSET }}
      >
        {map.seasons.map((s) => (
          <View
            key={s.season}
            style={{
              width: pageWidth,
              marginHorizontal: PAGE_INSET,
              flexDirection: "row",
              flexWrap: "wrap",
              gap: GAP,
            }}
          >
            {s.cells.map((cell) => (
              <Tile
                key={cell.episodeId}
                cell={cell}
                size={tile}
                selected={picked?.episodeId === cell.episodeId}
                onPress={() =>
                  setPicked((p) => (p?.episodeId === cell.episodeId ? null : cell))
                }
              />
            ))}
          </View>
        ))}
      </ScrollView>

      {picked ? (
        <Pressable
          onPress={() => onOpenEpisode(picked.episodeId)}
          accessibilityRole="button"
          accessibilityLabel={`Open ${picked.name}`}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            backgroundColor: colors.raised,
            borderRadius: radius.sm,
            padding: 11,
          }}
        >
          <Text style={{ color: colors.accent, fontFamily: fonts.displayMedium, fontSize: 12 }}>
            E{picked.number}
          </Text>
          <Text style={{ color: colors.fg, fontSize: 12, flex: 1 }} numberOfLines={1}>
            {picked.name}
          </Text>
          <Text style={{ color: colors.faint, fontSize: 11 }}>Open</Text>
        </Pressable>
      ) : (
        <View style={{ flexDirection: "row", gap: 8 }}>
          {map.best && <Extreme label="Best" cell={map.best} />}
          {map.worst && <Extreme label="Worst" cell={map.worst} />}
        </View>
      )}
    </View>
  );
}

/**
 * The number lives on the tile, not in a tooltip. A grid you have to tap to
 * read is a grid you scan twice.
 */
function Tile({
  cell,
  size,
  selected,
  onPress,
}: {
  cell: RatingCell;
  size: number;
  selected: boolean;
  onPress: () => void;
}) {
  const tier = tierFor(cell.rating);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        cell.rating == null
          ? `Episode ${cell.number}, not rated`
          : `Episode ${cell.number}, ${cell.rating.toFixed(1)} out of 10, ${tier?.label}`
      }
      style={{
        width: size,
        height: size * 0.78,
        borderRadius: 9,
        backgroundColor: tier?.color ?? UNRATED.color,
        alignItems: "center",
        justifyContent: "center",
        gap: 1,
        borderWidth: selected ? 2 : 0,
        borderColor: colors.fg,
      }}
    >
      <Text
        style={{
          color: tier?.ink ?? UNRATED.ink,
          fontSize: 9,
          opacity: 0.75,
        }}
      >
        E{cell.number}
      </Text>
      <Text
        style={{
          color: tier?.ink ?? UNRATED.ink,
          fontFamily: fonts.display,
          fontSize: 14,
          fontVariant: ["tabular-nums"],
        }}
      >
        {cell.rating != null ? cell.rating.toFixed(1) : "–"}
      </Text>
    </Pressable>
  );
}

function Extreme({ label, cell }: { label: string; cell: RatingCell }) {
  const tier = tierFor(cell.rating);
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.raised,
        borderRadius: radius.sm,
        padding: 10,
        gap: 3,
      }}
    >
      <Text style={{ color: colors.faint, fontSize: 9, letterSpacing: 1, textTransform: "uppercase" }}>
        {label}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <View
          style={{
            paddingHorizontal: 6,
            paddingVertical: 2,
            borderRadius: 5,
            backgroundColor: tier?.color ?? UNRATED.color,
          }}
        >
          <Text
            style={{
              color: tier?.ink ?? UNRATED.ink,
              fontSize: 11,
              fontFamily: fonts.display,
              fontVariant: ["tabular-nums"],
            }}
          >
            {cell.rating?.toFixed(1) ?? "–"}
          </Text>
        </View>
        <Text style={{ color: colors.fg, fontSize: 12 }} numberOfLines={1}>
          S{cell.season}E{cell.number}
        </Text>
      </View>
    </View>
  );
}
