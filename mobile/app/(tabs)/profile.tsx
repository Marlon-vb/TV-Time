import { useCallback } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import Poster from "@/components/Poster";
import { EmptyState } from "@/components/ui";
import { colors } from "@/lib/theme";
import { minutesHuman, monthLabel } from "@/lib/format";
import * as repo from "@/lib/repo";
import { useFocusData } from "@/lib/useFocusData";

export default function ProfileScreen() {
  const router = useRouter();
  const loader = useCallback(() => repo.stats(), []);
  const { data } = useFocusData(loader);

  if (!data) return null;

  if (data.showsFollowed === 0) {
    return (
      <View style={{ padding: 14 }}>
        <EmptyState
          title="No stats yet"
          body="Once you follow shows and mark episodes watched, your watch time and history show up here."
        />
      </View>
    );
  }

  const time = minutesHuman(data.minutesWatched);
  const maxMonthly = Math.max(...data.monthly.map((m) => m.episodes), 1);
  const maxGenre = Math.max(...data.topGenres.map((g) => g.minutes), 1);

  return (
    <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }}>
      {/* Time watched hero */}
      <View style={cardStyle}>
        <Text style={labelStyle}>TIME SPENT WATCHING TV</Text>
        <View style={{ flexDirection: "row", gap: 18, marginTop: 8 }}>
          <HeroUnit value={time.months} unit="months" />
          <HeroUnit value={time.days} unit="days" />
          <HeroUnit value={time.hours} unit="hours" />
        </View>
      </View>

      {/* KPI tiles */}
      <View style={{ flexDirection: "row", gap: 10 }}>
        <StatTile label="Episodes" value={data.episodesWatched} />
        <StatTile label="Shows" value={data.showsFollowed} />
        <StatTile label="Finished" value={data.showsFinished} />
        <StatTile label="Behind" value={data.episodesBehind} accent />
      </View>

      {/* Monthly bars */}
      {data.monthly.length > 1 && (
        <View style={cardStyle}>
          <Text style={labelStyle}>EPISODES PER MONTH</Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-end",
              gap: 3,
              height: 110,
              marginTop: 10,
            }}
          >
            {data.monthly.map((m) => (
              <View key={m.month} style={{ flex: 1, alignItems: "center", gap: 3, height: "100%", justifyContent: "flex-end" }}>
                {m.episodes === maxMonthly && (
                  <Text style={{ color: colors.fg, fontSize: 10, fontWeight: "700" }}>
                    {m.episodes}
                  </Text>
                )}
                <View
                  style={{
                    width: "100%",
                    maxWidth: 26,
                    height: `${Math.max((m.episodes / maxMonthly) * 82, 2)}%`,
                    backgroundColor: colors.accent,
                    borderTopLeftRadius: 4,
                    borderTopRightRadius: 4,
                  }}
                />
                <Text style={{ color: colors.faint, fontSize: 9 }}>
                  {monthLabel(m.month)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Most watched */}
      {data.mostWatched.length > 0 && (
        <View style={cardStyle}>
          <Text style={labelStyle}>MOST WATCHED</Text>
          <View style={{ gap: 8, marginTop: 10 }}>
            {data.mostWatched.map(({ show, watched, minutes }) => (
              <Pressable
                key={show.id}
                onPress={() => router.push(`/show/${show.id}` as never)}
                style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
              >
                <Poster src={show.poster_url} name={show.name} width={36} height={52} radius={6} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.fg, fontWeight: "700", fontSize: 13 }} numberOfLines={1}>
                    {show.name}
                  </Text>
                  <Text style={{ color: colors.faint, fontSize: 11 }}>
                    {watched} episodes · {Math.round(minutes / 60)} hours
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* Top genres */}
      {data.topGenres.length > 0 && (
        <View style={cardStyle}>
          <Text style={labelStyle}>TOP GENRES</Text>
          <View style={{ gap: 8, marginTop: 10 }}>
            {data.topGenres.map((g) => (
              <View key={g.genre} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Text style={{ color: colors.fg, fontWeight: "600", fontSize: 12, width: 90 }} numberOfLines={1}>
                  {g.genre}
                </Text>
                <View style={{ flex: 1, height: 10, borderRadius: 5, backgroundColor: colors.overlay, overflow: "hidden" }}>
                  <View
                    style={{
                      width: `${(g.minutes / maxGenre) * 100}%`,
                      height: "100%",
                      borderRadius: 5,
                      backgroundColor: colors.accent,
                    }}
                  />
                </View>
                <Text style={{ color: colors.muted, fontSize: 11, width: 36, textAlign: "right" }}>
                  {Math.round(g.minutes / 60)} h
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const cardStyle = {
  backgroundColor: colors.surface,
  borderRadius: 14,
  borderWidth: 1,
  borderColor: colors.line,
  padding: 16,
} as const;

const labelStyle = {
  color: colors.muted,
  fontSize: 11,
  fontWeight: "700",
  letterSpacing: 0.8,
} as const;

function HeroUnit({ value, unit }: { value: number; unit: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
      <Text style={{ color: colors.fg, fontSize: 30, fontWeight: "800" }}>
        {value}
      </Text>
      <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "600" }}>
        {unit}
      </Text>
    </View>
  );
}

function StatTile({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <View style={{ ...cardStyle, flex: 1, padding: 12 }}>
      <Text
        style={{
          color: accent && value > 0 ? colors.accent : colors.fg,
          fontSize: 20,
          fontWeight: "800",
        }}
      >
        {value.toLocaleString()}
      </Text>
      <Text style={{ color: colors.muted, fontSize: 10, marginTop: 2 }}>
        {label}
      </Text>
    </View>
  );
}
