import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Bouncy from "@/components/Bouncy";
import { ProgressBar, card } from "@/components/ui";
import { colors, fonts } from "@/lib/theme";
import { useAuth } from "@/lib/social/auth";
import * as social from "@/lib/social/api";
import { getCast, type CastMember } from "@/lib/tvmaze";
import { adjustTally } from "@/lib/character-votes";
import type { CharacterVoteTally } from "@/lib/social/types";

/**
 * "Best character in this episode" — one vote per user per episode. Tap a cast
 * member to vote (tap again to clear); a live leaderboard shows how everyone
 * voted. Cast comes from TVmaze (no key); tallies from the character_votes RPC.
 * Only rendered when signed in and the show has cast on file.
 */
export default function CharacterVotes({
  showId,
  season,
  episode,
}: {
  showId: number;
  season: number;
  episode: number;
}) {
  const { session } = useAuth();
  const [cast, setCast] = useState<CastMember[] | null>(null);
  const [myVote, setMyVote] = useState<number | null>(null);
  const [tally, setTally] = useState<CharacterVoteTally[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshTally = useCallback(async () => {
    const [mine, counts] = await Promise.all([
      social.getMyCharacterVote(showId, season, episode),
      social.characterVoteTally(showId, season, episode),
    ]);
    setMyVote(mine);
    setTally(counts);
  }, [showId, season, episode]);

  useEffect(() => {
    if (!session) return;
    let alive = true;
    setLoading(true);
    (async () => {
      const c = await getCast(showId);
      if (!alive) return;
      setCast(c);
      if (c.length > 0) await refreshTally();
      if (alive) setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [session, showId, refreshTally]);

  if (!session) return null;

  if (loading) {
    return (
      <View style={{ ...card, padding: 20, alignItems: "center" }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!cast || cast.length === 0) return null;

  const vote = async (member: CastMember) => {
    const clearing = myVote === member.characterId;
    void Haptics.selectionAsync();
    // Optimistic: update my selection and nudge the tally immediately.
    setMyVote(clearing ? null : member.characterId);
    setTally((prev) => adjustTally(prev, myVote, clearing ? null : member));
    try {
      if (clearing) {
        await social.clearCharacterVote(showId, season, episode);
      } else {
        await social.voteCharacter(
          showId,
          season,
          episode,
          member.characterId,
          member.characterName
        );
      }
    } finally {
      await refreshTally();
    }
  };

  const totalVotes = tally.reduce((sum, t) => sum + t.votes, 0);
  const maxVotes = tally.reduce((m, t) => Math.max(m, t.votes), 0);
  const imageFor = (id: number) =>
    cast.find((c) => c.characterId === id)?.image ?? null;
  const leaders = tally.slice(0, 5);

  return (
    <View style={{ ...card, padding: 14, gap: 12 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text style={label}>BEST CHARACTER</Text>
        <Text style={{ color: colors.faint, fontSize: 11 }}>
          {totalVotes > 0
            ? `${totalVotes} vote${totalVotes === 1 ? "" : "s"}`
            : "Cast your vote"}
        </Text>
      </View>

      {/* Votable cast */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 12, paddingVertical: 2, paddingRight: 4 }}
      >
        {cast.map((member) => {
          const selected = myVote === member.characterId;
          return (
            <Bouncy
              key={member.characterId}
              onPress={() => void vote(member)}
              scaleTo={0.92}
              style={{ width: 72, alignItems: "center", gap: 5 }}
            >
              <View>
                <View
                  style={{
                    width: 60,
                    height: 60,
                    borderRadius: 30,
                    borderWidth: 2,
                    borderColor: selected ? colors.accent : "transparent",
                    padding: 2,
                  }}
                >
                  {member.image ? (
                    <Image
                      source={{ uri: member.image }}
                      style={{ width: "100%", height: "100%", borderRadius: 26 }}
                      contentFit="cover"
                      cachePolicy="disk"
                    />
                  ) : (
                    <View
                      style={{
                        width: "100%",
                        height: "100%",
                        borderRadius: 26,
                        backgroundColor: colors.raised,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Ionicons name="person" size={22} color={colors.faint} />
                    </View>
                  )}
                </View>
                {selected && (
                  <View
                    style={{
                      position: "absolute",
                      bottom: -2,
                      right: -2,
                      backgroundColor: colors.accent,
                      borderRadius: 10,
                      borderWidth: 2,
                      borderColor: colors.surface,
                    }}
                  >
                    <Ionicons name="checkmark" size={14} color={colors.ink} />
                  </View>
                )}
              </View>
              <Text
                numberOfLines={1}
                style={{
                  color: selected ? colors.fg : colors.muted,
                  fontSize: 11,
                  fontFamily: selected ? fonts.displayMedium : undefined,
                  textAlign: "center",
                }}
              >
                {member.characterName}
              </Text>
              {member.personName ? (
                <Text
                  numberOfLines={1}
                  style={{ color: colors.faint, fontSize: 9, textAlign: "center" }}
                >
                  {member.personName}
                </Text>
              ) : null}
            </Bouncy>
          );
        })}
      </ScrollView>

      {/* Leaderboard */}
      {totalVotes > 0 && (
        <View style={{ gap: 10, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 12 }}>
          {leaders.map((row) => {
            const pct = Math.round((row.votes / totalVotes) * 100);
            const mine = myVote === row.character_id;
            const img = imageFor(row.character_id);
            return (
              <View
                key={row.character_id}
                style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
              >
                {img ? (
                  <Image
                    source={{ uri: img }}
                    style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.raised }}
                    contentFit="cover"
                    cachePolicy="disk"
                  />
                ) : (
                  <View
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 13,
                      backgroundColor: colors.raised,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons name="person" size={13} color={colors.faint} />
                  </View>
                )}
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text
                      numberOfLines={1}
                      style={{
                        color: mine ? colors.accent : colors.fg,
                        fontSize: 12,
                        fontFamily: mine ? fonts.displayMedium : undefined,
                        flex: 1,
                      }}
                    >
                      {row.character_name}
                    </Text>
                    <Text style={{ color: colors.faint, fontSize: 11, marginLeft: 8 }}>
                      {pct}%
                    </Text>
                  </View>
                  <ProgressBar value={row.votes} max={maxVotes} height={4} />
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const label = {
  color: colors.muted,
  fontSize: 11,
  fontFamily: "SpaceGrotesk_500Medium",
  letterSpacing: 1.2,
} as const;
