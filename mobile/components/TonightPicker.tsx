import { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Bouncy from "./Bouncy";
import Poster from "./Poster";
import { card } from "./ui";
import { accentGradient, colors, fonts, radius } from "@/lib/theme";
import { epCode } from "@/lib/format";
import { pickTonight, type TonightPick } from "@/lib/tonight";
import type { WatchNextItem } from "@/lib/types";

/** "What should I watch tonight?" — button + suggestion modal. */
export default function TonightPicker({ items }: { items: WatchNextItem[] }) {
  const router = useRouter();
  const [pick, setPick] = useState<TonightPick | null>(null);
  const [open, setOpen] = useState(false);

  if (items.length === 0) return null;

  const roll = (exclude?: number) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = pickTonight(items, Math.random, new Date(), exclude);
    setPick(next);
    setOpen(true);
  };

  return (
    <>
      <Bouncy
        onPress={() => roll()}
        style={{ borderRadius: radius.md, overflow: "hidden", marginTop: 10 }}
      >
        <LinearGradient
          colors={accentGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            paddingVertical: 13,
          }}
        >
          <Ionicons name="sparkles" size={16} color={colors.ink} />
          <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 14 }}>
            What should I watch tonight?
          </Text>
        </LinearGradient>
      </Bouncy>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          onPress={() => setOpen(false)}
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.65)",
            justifyContent: "center",
            padding: 24,
          }}
        >
          {pick && (
            <Pressable onPress={() => {}}>
              <View style={{ ...card, padding: 18, gap: 14 }}>
                <Text
                  style={{
                    color: colors.muted,
                    fontSize: 11,
                    fontFamily: fonts.displayMedium,
                    letterSpacing: 1.4,
                    textAlign: "center",
                  }}
                >
                  TONIGHT&apos;S PICK
                </Text>
                <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
                  <Poster
                    src={pick.item.show.poster_url}
                    name={pick.item.show.name}
                    width={84}
                    height={122}
                  />
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ color: colors.fg, fontFamily: fonts.display, fontSize: 17 }}>
                      {pick.item.show.name}
                    </Text>
                    <Text style={{ color: colors.muted, fontSize: 13 }}>
                      <Text style={{ color: colors.accent, fontFamily: fonts.displayMedium, fontSize: 12 }}>
                        {epCode(pick.item.episode.season, pick.item.episode.number)}
                      </Text>
                      {"  "}
                      {pick.item.episode.name}
                    </Text>
                    {pick.item.episode.runtime && (
                      <Text style={{ color: colors.faint, fontSize: 11 }}>
                        {pick.item.episode.runtime} min
                      </Text>
                    )}
                  </View>
                </View>

                <View
                  style={{
                    backgroundColor: "rgba(251,215,55,0.10)",
                    borderRadius: radius.sm,
                    borderWidth: 1,
                    borderColor: "rgba(251,215,55,0.25)",
                    padding: 10,
                  }}
                >
                  <Text style={{ color: colors.fg, fontSize: 12, lineHeight: 17, textAlign: "center" }}>
                    {pick.reason}
                  </Text>
                </View>

                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Bouncy
                    onPress={() => roll(pick.item.episode.id)}
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      borderRadius: radius.sm,
                      borderWidth: 1,
                      borderColor: colors.line,
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: colors.muted, fontWeight: "700", fontSize: 13 }}>
                      Roll again
                    </Text>
                  </Bouncy>
                  <Bouncy
                    onPress={() => {
                      setOpen(false);
                      router.push(`/episode/${pick.item.episode.id}` as never);
                    }}
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      borderRadius: radius.sm,
                      backgroundColor: colors.accent,
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: colors.ink, fontWeight: "800", fontSize: 13 }}>
                      Watch this
                    </Text>
                  </Bouncy>
                </View>
              </View>
            </Pressable>
          )}
        </Pressable>
      </Modal>
    </>
  );
}
