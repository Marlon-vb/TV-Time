import { Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import MaskedView from "@react-native-masked-view/masked-view";
import Svg, { Defs, Ellipse, RadialGradient, Stop } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { accentGradient, colors, fonts } from "@/lib/theme";
import { starString } from "@/lib/share";
import { watchTimeLine, type CardData } from "@/lib/share-card";

/**
 * The image people post — the "Spotlight" direction.
 *
 * Artwork to the edges, one enormous numeral, and nothing else competing. The
 * poster is doing the selling, so everything the card adds either sits on the
 * scrim below it or gets out of the way.
 *
 * Fixed 1080x1920 rather than laid out to the screen: this is captured, not
 * viewed, so it has to be the same picture on every device, and 9:16 is the
 * shape Stories want. The sheet scales it for preview; nothing here reads a
 * window dimension.
 */
export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1920;

const PAD = 96;

export default function ShareCard({ card }: { card: CardData }) {
  const backdrop =
    card.kind === "year" ? null : card.posterUrl;

  return (
    <View
      style={{
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        backgroundColor: colors.ink,
        overflow: "hidden",
      }}
    >
      {backdrop ? (
        <Image
          source={{ uri: backdrop }}
          style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
          contentFit="cover"
          // The capture fires as soon as layout settles, so a poster still
          // decoding would be captured blank. Memory-cached art is already
          // decoded — this poster was on screen a moment ago.
          cachePolicy="memory-disk"
          transition={0}
        />
      ) : (
        // The year card has no single show to stand for it, so the ground is
        // the app's own navy rather than one arbitrary poster.
        <LinearGradient
          colors={["#1d3a5c", "#0e1b2c", colors.ink]}
          locations={[0, 0.45, 1]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
        />
      )}

      {/* Heavy enough by the midpoint that any poster, however bright, still
          gives white text something to sit on. */}
      <LinearGradient
        colors={["rgba(11,12,20,0.15)", "rgba(11,12,20,0.72)", colors.ink]}
        locations={[0, 0.46, 0.88]}
        style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
      />

      <Glow />

      <View style={{ flex: 1, padding: PAD, paddingBottom: 110 }}>
        {card.kind === "finished" ? (
          <Finished card={card} />
        ) : card.kind === "fresh" ? (
          <Fresh card={card} />
        ) : (
          <Year card={card} />
        )}
        <Wordmark />
      </View>
    </View>
  );
}

/**
 * Warm light pooling up from the bottom edge, so the numeral sits in something
 * rather than on top of a flat wash. A real radial gradient via SVG —
 * expo-linear-gradient cannot make this shape, and faking it with a linear one
 * reads as a band.
 */
function Glow() {
  return (
    <Svg
      width={CARD_WIDTH}
      height={CARD_HEIGHT}
      style={{ position: "absolute", left: 0, top: 0 }}
      pointerEvents="none"
    >
      <Defs>
        <RadialGradient id="glow" cx="50%" cy="100%" rx="75%" ry="52%">
          <Stop offset="0" stopColor={colors.accent} stopOpacity="0.30" />
          <Stop offset="0.68" stopColor={colors.accent} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Ellipse
        cx={CARD_WIDTH / 2}
        cy={CARD_HEIGHT}
        rx={CARD_WIDTH * 0.95}
        ry={CARD_HEIGHT * 0.5}
        fill="url(#glow)"
      />
    </Svg>
  );
}

/**
 * The signature of this direction: a numeral filled with the accent gradient.
 *
 * MaskedView rather than SVG text, because the mask is a real RN Text and so
 * resolves Space Grotesk exactly as the rest of the app does — SVG text
 * resolves fonts by name at the platform layer and falls back silently when it
 * misses, which would show up first on the one element carrying the card.
 *
 * The transparent duplicate inside gives the gradient the text's dimensions;
 * a MaskedView child has no size of its own to take.
 */
function GradientNumber({
  children,
  size: max,
}: {
  children: string;
  /** Upper bound. Long values shrink to fit rather than overflowing. */
  size: number;
}) {
  // A four-figure episode count is real — daytime soaps run to thousands — and
  // at the headline size it would run off the card. Shrink to the width
  // available instead, measured off the longest line so the two-line episode
  // code is judged on its own longest row rather than the whole string.
  const longest = Math.max(...children.split("\n").map((l) => l.length));
  const size = Math.min(max, (CARD_WIDTH - PAD * 2) / (longest * 0.62));
  const style = {
    fontFamily: fonts.display,
    fontSize: size,
    lineHeight: size * 0.86,
    letterSpacing: -size * 0.05,
  } as const;
  return (
    <MaskedView
      style={{ alignSelf: "flex-start" }}
      maskElement={<Text style={style}>{children}</Text>}
    >
      <LinearGradient
        colors={["#fff8d8", colors.accent, colors.accentDeep]}
        locations={[0, 0.42, 1]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
      >
        <Text style={[style, { opacity: 0 }]}>{children}</Text>
      </LinearGradient>
    </MaskedView>
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
        fontSize: 44,
        letterSpacing: 12,
        textTransform: "uppercase",
      }}
    >
      {text}
    </Text>
  );
}

function ShowName({ children, size = 84 }: { children: string; size?: number }) {
  return (
    <Text
      style={{
        color: colors.fg,
        fontFamily: fonts.display,
        fontSize: size,
        lineHeight: size * 1.08,
        letterSpacing: -size * 0.02,
      }}
      numberOfLines={3}
    >
      {children}
    </Text>
  );
}

function Meta({ children }: { children: string }) {
  return (
    <Text style={{ color: colors.muted, fontSize: 44, marginTop: 28 }}>
      {children}
    </Text>
  );
}

function Finished({ card }: { card: Extract<CardData, { kind: "finished" }> }) {
  const parts = [
    `${card.episodes} episode${card.episodes === 1 ? "" : "s"}`,
    watchTimeLine(card.minutes),
  ];
  if (card.rating != null) parts.push(starString(card.rating));
  return (
    <>
      <Eyebrow text="Finished" />
      <View style={{ flex: 1 }} />
      <GradientNumber size={312}>{String(card.episodes)}</GradientNumber>
      <Meta>{parts.join("   ·   ")}</Meta>
      <View style={{ height: 32 }} />
      <ShowName>{card.showName}</ShowName>
      <View style={{ height: 68 }} />
    </>
  );
}

function Fresh({ card }: { card: Extract<CardData, { kind: "fresh" }> }) {
  return (
    <>
      {/* The whole point of this card: it is news, and it says so first. */}
      <View style={{ alignSelf: "flex-start", borderRadius: 999, overflow: "hidden" }}>
        <LinearGradient
          colors={accentGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ paddingHorizontal: 44, paddingVertical: 22 }}
        >
          <Text style={{ color: colors.ink, fontSize: 40, fontWeight: "800", letterSpacing: 3 }}>
            {card.airedLine.toUpperCase()}
          </Text>
        </LinearGradient>
      </View>
      <View style={{ flex: 1 }} />
      {/* Split across two lines so the code reads as a headline rather than a
          label, at a size no poster can compete with. */}
      <GradientNumber size={208}>
        {card.code.replace(/^(S\d+)(E\d+)$/, "$1\n$2")}
      </GradientNumber>
      <View style={{ height: 48 }} />
      <ShowName>{card.showName}</ShowName>
      {card.episodeName ? <Meta>{card.episodeName}</Meta> : null}
      <View style={{ height: 68 }} />
    </>
  );
}

function Year({ card }: { card: Extract<CardData, { kind: "year" }> }) {
  const parts = [
    `${card.episodes.toLocaleString()} episodes`,
    `${watchTimeLine(card.minutes)} on screen`,
    `${card.shows} shows`,
  ];
  return (
    <>
      <Eyebrow text={`My ${card.year} in TV`} />
      <View style={{ flex: 1 }} />
      <GradientNumber size={264}>{card.episodes.toLocaleString()}</GradientNumber>
      <Meta>{parts.slice(1).join("   ·   ")}</Meta>
      {card.topGenre ? (
        <Text
          style={{
            color: colors.accent,
            fontFamily: fonts.display,
            fontSize: 76,
            marginTop: 40,
          }}
          numberOfLines={1}
        >
          {`Mostly ${card.topGenre}`}
        </Text>
      ) : null}
      {card.posters.length > 0 && (
        <View style={{ flexDirection: "row", gap: 20, marginTop: 56 }}>
          {card.posters.slice(0, 4).map((url, i) => (
            <Image
              key={`${url}-${i}`}
              source={{ uri: url }}
              style={{ width: 172, height: 248, borderRadius: 18, backgroundColor: colors.raised }}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={0}
            />
          ))}
        </View>
      )}
      <View style={{ height: 68 }} />
    </>
  );
}
