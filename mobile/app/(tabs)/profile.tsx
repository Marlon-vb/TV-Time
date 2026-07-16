import { useCallback } from "react";
import { ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Bouncy from "@/components/Bouncy";
import Poster from "@/components/Poster";
import ScreenHeader from "@/components/ScreenHeader";
import AccountCard from "@/components/AccountCard";
import { EmptyState, card, sectionLabel } from "@/components/ui";
import {
  accentGradient,
  colors,
  fonts,
  TAB_BAR_CLEARANCE,
} from "@/lib/theme";
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
      <View>
        <ScreenHeader title="Profile" />
        <View style={{ padding: 16, gap: 12 }}>
          <AccountCard />
          <EmptyState
            icon="person-outline"
            title="No stats yet"
            body="Once you follow shows and mark episodes watched, your watch time and history show up here."
          />
        </View>
      </View>
    );
  }

  const time = minutesHuman(data.minutesWatched);
  const maxMonthly = Math.max(...data.monthly.map((m) => m.episodes), 1);
  const maxGenre = Math.max(...data.topGenres.map((g) => g.minutes), 1);

  return (
    <ScrollView
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingBottom: TAB_BAR_CLEARANCE,
        gap: 12,
      }}
    >
      <View style={{ marginHorizontal: -16 }}>
        <ScreenHeader title="Profile" />
      </View>

      <AccountCard />

      {/* Time watched hero */}
      <View style={{ ...card, padding: 20, overflow: "hidden" }}>
        <LinearGradient
          colors={["rgba(251,215,55,0.08)", "rgba(251,215,55,0)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <Text style={sectionLabel}>TIME SPENT WATCHING TV</Text>
        <View style={{ flexDirection: "row", gap: 22, marginTop: 12 }}>
          <HeroUnit value={time.months} unit="months" />
          <HeroUnit value={time.days} unit="days" />
          <HeroUnit value={time.hours} unit="hours" />
        </View>
      </View>

      {/* KPI tiles */}
      <View style={{ flexDirection: "row", gap: 10 }}>
        <StatTile label="Episodes" value={data.episodesWatched} />
        <StatTile label="Shows" value={data.showsFollowed} />
        <StatTile
          label="Avg rating"
          value={data.ratedCount > 0 ? data.averageRating : null}
          decimals={1}
          suffix="★"
        />
        <StatTile label="Behind" value={data.episodesBehind} accent />
      </View>

      {/* Monthly activity */}
      {data.monthly.length > 1 && (
        <View style={{ ...card, padding: 18 }}>
          <Text style={sectionLabel}>EPISODES PER MONTH</Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-end",
              gap: 4,
              height: 116,
              marginTop: 14,
            }}
          >
            {data.monthly.map((m) => (
              <View
                key={m.month}
                style={{
                  flex: 1,
                  alignItems: "center",
                  gap: 4,
                  height: "100%",
                  justifyContent: "flex-end",
                }}
              >
                {m.episodes === maxMonthly && (
                  <Text style={{ color: colors.fg, fontSize: 10, fontFamily: fonts.displayMedium }}>
                    {m.episodes}
                  </Text>
                )}
                <View
                  style={{
                    width: "100%",
                    maxWidth: 26,
                    height: `${Math.max((m.episodes / maxMonthly) * 80, 2)}%`,
                    borderTopLeftRadius: 4,
                    borderTopRightRadius: 4,
                    overflow: "hidden",
                  }}
                >
                  <LinearGradient
                    colors={accentGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={{ flex: 1 }}
                  />
                </View>
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
        <View style={{ ...card, padding: 18 }}>
          <Text style={sectionLabel}>MOST WATCHED</Text>
          <View style={{ gap: 10, marginTop: 12 }}>
            {data.mostWatched.map(({ show, watched, minutes }) => (
              <Bouncy
                key={show.id}
                onPress={() => router.push(`/show/${show.id}` as never)}
                style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
              >
                <Poster src={show.poster_url} name={show.name} width={38} height={56} radius={7} />
                <View style={{ flex: 1 }}>
                  <Text
                    style={{ color: colors.fg, fontFamily: fonts.displayMedium, fontSize: 13 }}
                    numberOfLines={1}
                  >
                    {show.name}
                  </Text>
                  <Text style={{ color: colors.faint, fontSize: 11, marginTop: 1 }}>
                    {watched} episodes · {Math.round(minutes / 60)} hours
                  </Text>
                </View>
              </Bouncy>
            ))}
          </View>
        </View>
      )}

      {/* Top genres */}
      {data.topGenres.length > 0 && (
        <View style={{ ...card, padding: 18 }}>
          <Text style={sectionLabel}>TOP GENRES</Text>
          <View style={{ gap: 10, marginTop: 12 }}>
            {data.topGenres.map((g) => (
              <View key={g.genre} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Text
                  style={{
                    color: colors.fg,
                    fontFamily: fonts.displayMedium,
                    fontSize: 12,
                    width: 92,
                  }}
                  numberOfLines={1}
                >
                  {g.genre}
                </Text>
                <View
                  style={{
                    flex: 1,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: colors.overlay,
                    overflow: "hidden",
                  }}
                >
                  <LinearGradient
                    colors={accentGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={{
                      width: `${(g.minutes / maxGenre) * 100}%`,
                      height: "100%",
                      borderRadius: 5,
                    }}
                  />
                </View>
                <Text style={{ color: colors.muted, fontSize: 11, width: 38, textAlign: "right" }}>
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


function HeroUnit({ value, unit }: { value: number; unit: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", gap: 5 }}>
      <Text style={{ color: colors.fg, fontSize: 34, fontFamily: fonts.display }}>
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
  decimals = 0,
  suffix = "",
}: {
  label: string;
  /** null renders an em-dash — "no data yet" beats a misleading 0.0. */
  value: number | null;
  accent?: boolean;
  decimals?: number;
  suffix?: string;
}) {
  const display =
    value == null
      ? "—"
      : decimals > 0
        ? value.toFixed(decimals)
        : value.toLocaleString();
  return (
    <View style={{ ...card, flex: 1, minWidth: 0, padding: 14 }}>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.5}
        style={{
          color: accent && (value ?? 0) > 0 ? colors.accent : colors.fg,
          fontSize: 21,
          fontFamily: fonts.display,
        }}
      >
        {display}
        {suffix ? <Text style={{ fontSize: 14, color: colors.accent }}>{suffix}</Text> : null}
      </Text>
      <Text style={{ color: colors.muted, fontSize: 10, marginTop: 3 }}>
        {label}
      </Text>
    </View>
  );
}
