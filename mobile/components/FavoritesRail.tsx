import { Pressable, ScrollView, Text, View } from "react-native";
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
  onEdit,
}: {
  items: FavoriteItem[];
  title?: string;
  onOpen: (showId: number) => void;
  /** Shown instead of the shelf when empty. Omit to render nothing at all. */
  emptyBody?: string;
  /** Only your own shelf can be arranged, so only Library passes this. */
  onEdit?: () => void;
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
        {onEdit && items.length > 1 ? (
          <Pressable
            onPress={onEdit}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Arrange your favourites"
            style={{ marginLeft: "auto" }}
          >
            <Text style={{ color: colors.accent, fontSize: 12, fontWeight: "600" }}>
              Arrange
            </Text>
          </Pressable>
        ) : null}
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
          {items.map((s, i) => (
            <Bouncy key={s.id} onPress={() => onOpen(s.id)} scaleTo={0.96} style={{ width: 84 }}>
              <View>
                <Poster src={s.posterUrl} name={s.name} width={84} height={122} radius={radius.sm} />
                {/* The shelf is ordered now, so say so. Without the number a
                    ranked list and a recently-starred one look identical. */}
                <View
                  style={{
                    position: "absolute",
                    top: 5,
                    left: 5,
                    minWidth: 21,
                    height: 21,
                    paddingHorizontal: 5,
                    borderRadius: 11,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: i === 0 ? colors.accent : "rgba(11,12,20,0.82)",
                    borderWidth: 1,
                    borderColor: i === 0 ? colors.accent : "rgba(255,255,255,0.18)",
                  }}
                >
                  <Text
                    style={{
                      color: i === 0 ? colors.ink : colors.fg,
                      fontFamily: fonts.display,
                      fontSize: 11,
                      fontVariant: ["tabular-nums"],
                    }}
                  >
                    {i + 1}
                  </Text>
                </View>
              </View>
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
