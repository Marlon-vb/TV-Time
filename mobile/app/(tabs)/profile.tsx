import { useCallback } from "react";
import { ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Bouncy from "@/components/Bouncy";
import Poster from "@/components/Poster";
import ScreenHeader from "@/components/ScreenHeader";
import AccountCard from "@/components/AccountCard";
import { EmptyState, ProgressBar, card } from "@/components/ui";
import { computeAchievements, type Achievement } from "@/lib/achievements";
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
      <ScreenHeader title="Profile" />

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
        <StatTile label="Finished" value={data.showsFinished} />
        <StatTile label="Behind" value={data.episodesBehind} accent />
      </View>

      {/* Achievements */}
      <AchievementsSection stats={data} />

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

const sectionLabel = {
  color: colors.muted,
  fontSize: 11,
  fontFamily: "SpaceGrotesk_500Medium",
  letterSpacing: 1.4,
} as const;

function AchievementsSection({
  stats,
}: {
  stats: Parameters<typeof computeAchievements>[0];
}) {
  const achievements = computeAchievements(stats);
  const unlocked = achievements.filter((a) => a.achieved).length;
  return (
    <View style={{ ...card, padding: 18 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
        <Text style={sectionLabel}>ACHIEVEMENTS</Text>
        <Text style={{ color: colors.faint, fontSize: 11, fontFamily: fonts.displayMedium }}>
          {unlocked}/{achievements.length}
        </Text>
      </View>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 10,
          marginTop: 12,
        }}
      >
        {achievements.map((a) => (
          <AchievementCard key={a.id} achievement={a} />
        ))}
      </View>
    </View>
  );
}

function AchievementCard({ achievement: a }: { achievement: Achievement }) {
  return (
    <View
      style={{
        width: "47.7%",
        borderRadius: 14,
        borderWidth: 1,
        borderColor: a.achieved ? "rgba(251,215,55,0.4)" : colors.line,
        backgroundColor: a.achieved ? "rgba(251,215,55,0.08)" : colors.raised,
        padding: 12,
        gap: 6,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: 15,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: a.achieved ? colors.accent : colors.overlay,
          }}
        >
          <Ionicons
            /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
            name={a.icon as any}
            size={15}
            color={a.achieved ? colors.ink : colors.faint}
          />
        </View>
        <Text
          style={{
            flex: 1,
            color: a.achieved ? colors.fg : colors.muted,
            fontFamily: fonts.displayMedium,
            fontSize: 12,
          }}
          numberOfLines={1}
        >
          {a.name}
        </Text>
      </View>
      <Text style={{ color: colors.faint, fontSize: 10, lineHeight: 14 }} numberOfLines={2}>
        {a.description}
      </Text>
      {a.achieved ? (
        <Text style={{ color: colors.accent, fontSize: 10, fontWeight: "800" }}>
          UNLOCKED
        </Text>
      ) : (
        <View style={{ gap: 3 }}>
          <ProgressBar value={a.current} max={a.target} height={3} />
          <Text style={{ color: colors.faint, fontSize: 9 }}>
            {a.current.toLocaleString()}/{a.target.toLocaleString()}
          </Text>
        </View>
      )}
    </View>
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
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <View style={{ ...card, flex: 1, padding: 14 }}>
      <Text
        style={{
          color: accent && value > 0 ? colors.accent : colors.fg,
          fontSize: 21,
          fontFamily: fonts.display,
        }}
      >
        {value.toLocaleString()}
      </Text>
      <Text style={{ color: colors.muted, fontSize: 10, marginTop: 3 }}>
        {label}
      </Text>
    </View>
  );
}
