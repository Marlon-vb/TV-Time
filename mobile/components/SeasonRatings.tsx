import { useEffect, useRef, useState } from "react";
import {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { colors, fonts, radius } from "@/lib/theme";
import {
  buildRatingMap,
  initialSeasonIndex,
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

export default function SeasonRatings({
  episodes,
  onOpenEpisode,
}: {
  episodes: EpisodeRow[];
  onOpenEpisode: (episodeId: number) => void;
}) {
  const map = buildRatingMap(episodes);
  const scroller = useRef<ScrollView>(null);
  const [index, setIndex] = useState(() => initialSeasonIndex(map, episodes));
  const [picked, setPicked] = useState<RatingCell | null>(null);

  // Measured, not derived. pagingEnabled snaps to the scroll view's own width,
  // so a page has to be exactly that — deriving it from an assumed gutter left
  // every page short by the margin and the error compounded with the starting
  // offset, which is what dragged the previous season into view.
  const [pageW, setPageW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && w !== pageW) setPageW(w);
  };

  // contentOffset only applies at mount, before the width is known, so the
  // opening season is scrolled to once there is a page width to multiply.
  const jumped = useRef(false);
  useEffect(() => {
    if (pageW === 0 || jumped.current) return;
    jumped.current = true;
    if (index > 0) {
      scroller.current?.scrollTo({ x: index * pageW, animated: false });
    }
  }, [pageW, index]);

  const onPaged = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (pageW === 0) return;
    const next = Math.round(e.nativeEvent.contentOffset.x / pageW);
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

      <View onLayout={onLayout}>
      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onPaged}
      >
        {map.seasons.map((s) => (
          <View
            key={s.season}
            style={{
              width: pageW,
              flexDirection: "row",
              flexWrap: "wrap",
              gap: GAP,
            }}
          >
            {s.cells.map((cell) => (
              <Tile
                key={cell.episodeId}
                cell={cell}
                size={(pageW - GAP * (PER_ROW - 1)) / PER_ROW}
                selected={picked?.episodeId === cell.episodeId}
                onPress={() =>
                  setPicked((p) => (p?.episodeId === cell.episodeId ? null : cell))
                }
              />
            ))}
          </View>
        ))}
      </ScrollView>
      </View>

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
