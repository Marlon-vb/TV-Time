import { ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Bouncy from "@/components/Bouncy";
import Poster from "@/components/Poster";
import { colors, fonts, radius } from "@/lib/theme";

export interface FavoriteItem {
  id: number;
  name: string;
  posterUrl: string | null;
}

/**
 * Someone's starred shows, as a horizontal shelf.
 *
 * Shared by your Library and other people's profiles so a favourite looks the
 * same wherever it is read — the whole point of starring is that other people
 * see the same shelf you arranged.
 */
export default function FavoritesRail({
  items,
  title = "Favourites",
  onOpen,
  emptyBody,
}: {
  items: FavoriteItem[];
  title?: string;
  onOpen: (showId: number) => void;
  /** Shown instead of the shelf when empty. Omit to render nothing at all. */
  emptyBody?: string;
}) {
  if (items.length === 0 && !emptyBody) return null;

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 2 }}>
        <Ionicons name="star" size={13} color={colors.accent} />
        <Text
          style={{
            color: colors.accent,
            fontFamily: fonts.display,
            fontSize: 13,
            textTransform: "uppercase",
            letterSpacing: 1.2,
          }}
        >
          {title}
        </Text>
        <Text style={{ color: colors.faint, fontSize: 11 }}>{items.length || ""}</Text>
      </View>

      {items.length === 0 ? (
        <Text style={{ color: colors.faint, fontSize: 12, lineHeight: 18, paddingHorizontal: 2 }}>
          {emptyBody}
        </Text>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 10, paddingRight: 4 }}
        >
          {items.map((s) => (
            <Bouncy key={s.id} onPress={() => onOpen(s.id)} scaleTo={0.96} style={{ width: 84 }}>
              <Poster src={s.posterUrl} name={s.name} width={84} height={122} radius={radius.sm} />
              <Text
                style={{ color: colors.muted, fontSize: 11, marginTop: 5 }}
                numberOfLines={2}
              >
                {s.name}
              </Text>
            </Bouncy>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
