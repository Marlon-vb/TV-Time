import { useEffect, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { card, sectionLabel } from "@/components/ui";
import { colors } from "@/lib/theme";
import {
  loadWatchOffer,
  type WatchQuery,
} from "@/lib/watch";
import {
  watchOfferIsEmpty,
  type WatchOffer,
  type WatchProvider,
} from "@/lib/watch-offer";

/** TMDB requires this credit, linking to JustWatch, wherever the data is shown. */
const JUSTWATCH_URL = "https://www.justwatch.com";

const GROUPS: { key: keyof Pick<WatchOffer, "flatrate" | "rent" | "buy">; label: string }[] = [
  { key: "flatrate", label: "STREAM" },
  { key: "rent", label: "RENT" },
  { key: "buy", label: "BUY" },
];

/**
 * Streaming, rent, and buy for one title. Renders nothing when the lookup
 * cannot run (signed out, no TMDB key, the function is down) so a detail
 * screen never grows an error where a poster used to be enough.
 */
export default function WhereToWatch(query: WatchQuery) {
  const canLook =
    query.kind === "movie"
      ? Boolean(query.tmdbId)
      : Boolean(query.tmdbId || query.imdbId || query.tvdbId);
  const [offer, setOffer] = useState<WatchOffer | null | undefined>(
    canLook ? undefined : null
  );

  useEffect(() => {
    if (!canLook) {
      setOffer(null);
      return;
    }
    let alive = true;
    setOffer(undefined);
    void loadWatchOffer(query).then((next) => {
      if (alive) setOffer(next);
    });
    return () => {
      alive = false;
    };
    // The ids are the query. A new object each render must not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canLook, query.kind, query.tmdbId, query.imdbId, query.tvdbId]);

  if (!canLook || !offer) return null;

  const empty = watchOfferIsEmpty(offer);

  return (
    <View style={{ ...card, padding: 14, gap: 12 }}>
      <Text style={sectionLabel}>WHERE TO WATCH</Text>
      {empty ? (
        <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 18 }}>
          Nothing listed to stream, rent, or buy in {offer.region}.
        </Text>
      ) : (
        GROUPS.map((group) =>
          offer[group.key].length > 0 ? (
            <ProviderRow key={group.key} label={group.label} providers={offer[group.key]} link={offer.link} />
          ) : null
        )
      )}
      <Text style={{ color: colors.faint, fontSize: 11, lineHeight: 16 }}>
        Streaming data for {offer.region} by{" "}
        <Text
          style={{ color: colors.fg, textDecorationLine: "underline" }}
          onPress={() => void Linking.openURL(JUSTWATCH_URL)}
          accessibilityRole="link"
        >
          JustWatch
        </Text>
      </Text>
    </View>
  );
}

function ProviderRow({
  label,
  providers,
  link,
}: {
  label: string;
  providers: WatchProvider[];
  link: string | null;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ ...sectionLabel, fontSize: 10 }}>{label}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {providers.map((provider) => (
          <Pressable
            key={provider.id}
            disabled={!link}
            onPress={() => {
              if (link) void Linking.openURL(link);
            }}
            accessibilityRole="button"
            accessibilityLabel={provider.name}
            style={{ width: 68, alignItems: "center", gap: 6 }}
          >
            {provider.logoUrl ? (
              <Image
                source={{ uri: provider.logoUrl }}
                contentFit="contain"
                cachePolicy="disk"
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  backgroundColor: colors.raised,
                }}
              />
            ) : (
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  backgroundColor: colors.raised,
                }}
              />
            )}
            <Text
              numberOfLines={2}
              style={{ color: colors.muted, fontSize: 10, textAlign: "center" }}
            >
              {provider.name}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
