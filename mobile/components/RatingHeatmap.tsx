import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { colors, fonts, radius } from "@/lib/theme";
import { buildRatingMap, type RatingCell } from "@/lib/rating-map";
import { epCode } from "@/lib/format";
import type { EpisodeRow } from "@/lib/types";

/**
 * A show's crowd ratings as a grid — one row per season, one cell per episode.
 *
 * The point is the shape, not the numbers: a season that collapses, a finale
 * that lands, a middle stretch nobody liked. Reading that off a list of
 * decimals is impossible; reading it off a grid takes a second.
 */
const CELL = 22;
const GAP = 3;

/** Overlay → accent. Staying inside the app's two colours keeps this a chart
 *  rather than a heat map borrowed from somewhere else. */
function heatColor(heat: number | null): string {
  if (heat == null) return "rgba(255,255,255,0.045)";
  const t = 0.25 + heat * 0.75;
  return `rgba(251, 215, 55, ${t.toFixed(3)})`;
}

export default function RatingHeatmap({
  episodes,
  onOpenEpisode,
}: {
  episodes: EpisodeRow[];
  onOpenEpisode: (episodeId: number) => void;
}) {
  const map = buildRatingMap(episodes);
  // Tap reveals rather than navigates on first touch: at this size a cell is
  // too small to commit to, and "which episode is that" is the question the
  // grid provokes.
  const [picked, setPicked] = useState<RatingCell | null>(null);

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
        <Text style={{ color: colors.faint, fontSize: 11 }}>
          {map.low.toFixed(1)}–{map.high.toFixed(1)} · TVmaze
        </Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ gap: GAP }}>
          {map.seasons.map(({ season, cells }) => (
            <View key={season} style={{ flexDirection: "row", alignItems: "center", gap: GAP }}>
              <Text
                style={{
                  color: colors.faint,
                  fontSize: 10,
                  width: 22,
                  textAlign: "right",
                  fontVariant: ["tabular-nums"],
                }}
              >
                {season}
              </Text>
              {cells.map((cell) => {
                const on =
                  picked?.season === cell.season && picked?.number === cell.number;
                return (
                  <Pressable
                    key={cell.episodeId}
                    onPress={() => setPicked(on ? null : cell)}
                    accessibilityRole="button"
                    accessibilityLabel={
                      cell.rating == null
                        ? `${epCode(cell.season, cell.number)}, not rated`
                        : `${epCode(cell.season, cell.number)}, ${cell.rating.toFixed(1)} out of 10`
                    }
                    style={{
                      width: CELL,
                      height: CELL,
                      borderRadius: 5,
                      backgroundColor: heatColor(cell.heat),
                      borderWidth: on ? 1.5 : 0,
                      borderColor: colors.fg,
                    }}
                  />
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>

      {picked ? (
        <Pressable
          onPress={() => onOpenEpisode(picked.episodeId)}
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
            {epCode(picked.season, picked.number)}
          </Text>
          <Text style={{ color: colors.fg, fontSize: 12, flex: 1 }} numberOfLines={1}>
            {picked.name}
          </Text>
          <Text style={{ color: colors.fg, fontFamily: fonts.display, fontSize: 13 }}>
            {picked.rating != null ? picked.rating.toFixed(1) : "—"}
          </Text>
        </Pressable>
      ) : (
        // The two episodes everyone looks for, so the grid says something even
        // before it is touched.
        <View style={{ flexDirection: "row", gap: 8 }}>
          {map.best && <Extreme label="Best" cell={map.best} />}
          {map.worst && <Extreme label="Worst" cell={map.worst} />}
        </View>
      )}
    </View>
  );
}

function Extreme({ label, cell }: { label: string; cell: RatingCell }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.raised,
        borderRadius: radius.sm,
        padding: 10,
        gap: 2,
      }}
    >
      <Text style={{ color: colors.faint, fontSize: 9, letterSpacing: 1, textTransform: "uppercase" }}>
        {label}
      </Text>
      <Text style={{ color: colors.fg, fontSize: 12 }} numberOfLines={1}>
        <Text style={{ fontFamily: fonts.displayMedium, color: colors.accent }}>
          {epCode(cell.season, cell.number)}
        </Text>
        {`  ${cell.rating?.toFixed(1) ?? "—"}`}
      </Text>
    </View>
  );
}
