import { Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { accentGradient, colors, fonts } from "@/lib/theme";
import { starString } from "@/lib/share";
import { watchTimeLine, type CardData } from "@/lib/share-card";

/**
 * The image people actually post.
 *
 * Fixed 1080x1920 rather than laid out to the screen: this is captured, not
 * viewed, so it has to be the same picture on every device, and 9:16 is the
 * shape Instagram and TikTok Stories want. The sheet scales it down for
 * preview; nothing here reads a window dimension.
 */
export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1920;

export default function ShareCard({ card }: { card: CardData }) {
  return (
    <View
      style={{
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        backgroundColor: colors.ink,
        paddingHorizontal: 96,
        paddingTop: 150,
        paddingBottom: 110,
        justifyContent: "space-between",
      }}
    >
      {card.kind === "finished" ? (
        <Finished card={card} />
      ) : card.kind === "fresh" ? (
        <Fresh card={card} />
      ) : (
        <Year card={card} />
      )}
      <Wordmark />
    </View>
  );
}

/** Small enough to be a signature, not an ad — a card that looks like an ad
 *  does not get posted. */
function Wordmark() {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
      <Ionicons name="tv" size={40} color={colors.accent} />
      <Text style={{ color: colors.faint, fontFamily: fonts.display, fontSize: 34 }}>
        TV App
      </Text>
    </View>
  );
}

function Eyebrow({ text }: { text: string }) {
  return (
    <Text
      style={{
        color: colors.accent,
        fontFamily: fonts.display,
        fontSize: 34,
        letterSpacing: 6,
        textTransform: "uppercase",
      }}
    >
      {text}
    </Text>
  );
}

function Poster({ url }: { url: string | null }) {
  if (!url) return null;
  return (
    <Image
      source={{ uri: url }}
      style={{ width: 520, height: 760, borderRadius: 28, backgroundColor: colors.raised }}
      contentFit="cover"
      // The capture fires as soon as the layout settles, so a poster still
      // decoding would be captured blank. Memory-cached art is already
      // decoded — the poster on this card was on screen a moment ago.
      cachePolicy="memory-disk"
      transition={0}
    />
  );
}

/** One big number with its label under it — the unit both stat cards use. */
function Stat({ n, label }: { n: string; label: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.fg, fontFamily: fonts.display, fontSize: 96, lineHeight: 104 }}>
        {n}
      </Text>
      <Text style={{ color: colors.muted, fontSize: 32 }}>{label}</Text>
    </View>
  );
}

function Finished({ card }: { card: Extract<CardData, { kind: "finished" }> }) {
  return (
    <View style={{ gap: 56, flex: 1, justifyContent: "center" }}>
      <Eyebrow text="Finished" />
      <View style={{ flexDirection: "row", gap: 56, alignItems: "center" }}>
        <Poster url={card.posterUrl} />
        <View style={{ flex: 1, gap: 40 }}>
          <Text
            style={{ color: colors.fg, fontFamily: fonts.display, fontSize: 76, lineHeight: 84 }}
            numberOfLines={4}
          >
            {card.showName}
          </Text>
          {card.rating != null && (
            <Text style={{ color: colors.accent, fontSize: 54 }}>
              {starString(card.rating)}
            </Text>
          )}
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 96 }}>
        <Stat n={String(card.episodes)} label="episodes" />
        <Stat n={watchTimeLine(card.minutes)} label="watched" />
      </View>
    </View>
  );
}

function Fresh({ card }: { card: Extract<CardData, { kind: "fresh" }> }) {
  return (
    <View style={{ gap: 56, flex: 1, justifyContent: "center" }}>
      {/* The whole point of this card: it is news, and it says so first. */}
      <View style={{ alignSelf: "flex-start", borderRadius: 999, overflow: "hidden" }}>
        <LinearGradient
          colors={accentGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ paddingHorizontal: 36, paddingVertical: 16 }}
        >
          <Text style={{ color: colors.ink, fontSize: 32, fontWeight: "800", letterSpacing: 1 }}>
            {card.airedLine.toUpperCase()}
          </Text>
        </LinearGradient>
      </View>
      <View style={{ flexDirection: "row", gap: 56, alignItems: "center" }}>
        <Poster url={card.posterUrl} />
        <View style={{ flex: 1, gap: 26 }}>
          <Text
            style={{ color: colors.fg, fontFamily: fonts.display, fontSize: 72, lineHeight: 80 }}
            numberOfLines={4}
          >
            {card.showName}
          </Text>
          <Text style={{ color: colors.accent, fontFamily: fonts.displayMedium, fontSize: 46 }}>
            {card.code}
          </Text>
          {card.episodeName && (
            <Text style={{ color: colors.muted, fontSize: 36, lineHeight: 46 }} numberOfLines={3}>
              {card.episodeName}
            </Text>
          )}
        </View>
      </View>
      <Text style={{ color: colors.faint, fontSize: 34 }}>Just watched · no spoilers</Text>
    </View>
  );
}

function Year({ card }: { card: Extract<CardData, { kind: "year" }> }) {
  return (
    <View style={{ gap: 64, flex: 1, justifyContent: "center" }}>
      <Eyebrow text={`My ${card.year} in TV`} />
      <View style={{ gap: 48 }}>
        <Stat n={card.episodes.toLocaleString()} label="episodes watched" />
        <View style={{ flexDirection: "row", gap: 96 }}>
          <Stat n={watchTimeLine(card.minutes)} label="on screen" />
          <Stat n={String(card.shows)} label="shows" />
        </View>
        {card.topGenre && (
          <View style={{ gap: 6 }}>
            <Text
              style={{ color: colors.accent, fontFamily: fonts.display, fontSize: 62 }}
              numberOfLines={1}
            >
              {card.topGenre}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 32 }}>most-watched genre</Text>
          </View>
        )}
      </View>
      {card.posters.length > 0 && (
        <View style={{ flexDirection: "row", gap: 20 }}>
          {card.posters.slice(0, 4).map((url, i) => (
            <Image
              key={`${url}-${i}`}
              source={{ uri: url }}
              style={{ width: 200, height: 292, borderRadius: 18, backgroundColor: colors.raised }}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={0}
            />
          ))}
        </View>
      )}
    </View>
  );
}
