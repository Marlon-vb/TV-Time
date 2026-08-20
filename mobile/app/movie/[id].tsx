import { useCallback } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import CheckButton from "@/components/CheckButton";
import StarRating from "@/components/StarRating";
import { card, sectionLabel } from "@/components/ui";
import { colors, fonts, scrimGradient, TAB_BAR_CLEARANCE } from "@/lib/theme";
import { fmtDate } from "@/lib/format";
import * as movies from "@/lib/movies";
import * as social from "@/lib/social/api";
import { useFocusData } from "@/lib/useFocusData";

export default function MovieScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const movieId = Number(id);
  const router = useRouter();

  const loader = useCallback(() => movies.getMovie(movieId), [movieId]);
  const { data: movie, reload } = useFocusData(loader);

  const toggleWatched = (next: boolean) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    movies.setMovieWatched(movieId, next);
    reload();
  };

  const favorited = movie?.favorited_at != null;

  const toggleFavorite = () => {
    if (!movie) return;
    const next = !favorited;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    movies.setMovieFavorite(movieId, next);
    reload();
    // Mirrored separately, as every local write is: the star stands signed
    // out, where this is a no-op.
    void social.setFavoriteMovie(
      next
        ? { id: movieId, title: movie.title, posterUrl: movie.poster_url }
        : movieId
    );
  };

  const rate = (value: number | null) => {
    movies.setMovieRating(movieId, value);
    reload();
  };

  const confirmRemove = () =>
    Alert.alert("Remove movie?", "This takes it out of your library.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          movies.removeMovie(movieId);
          // And the star, which would otherwise sit on your profile with
          // nothing left in the library to un-star it from.
          void social.setFavoriteMovie(movieId);
          router.back();
        },
      },
    ]);

  if (!movie) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Stack.Screen options={{ title: "" }} />
        <Text style={{ color: colors.muted }}>Movie not found.</Text>
      </View>
    );
  }

  const isWatched = Boolean(movie.watched_at);
  const meta = [
    movie.year ? String(movie.year) : null,
    movie.genre,
    movie.runtime ? `${movie.runtime} min` : null,
  ]
    .filter(Boolean)
    .join("  ·  ");

  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE }}
      showsVerticalScrollIndicator={false}
    >
      <Stack.Screen options={{ title: "" }} />

      {/* Hero */}
      <View style={{ height: 320 }}>
        {movie.poster_url ? (
          <Image
            source={{ uri: movie.poster_url }}
            contentFit="cover"
            style={{ width: "100%", height: "100%" }}
          />
        ) : (
          <View style={{ flex: 1, backgroundColor: colors.surface }} />
        )}
        <LinearGradient
          colors={scrimGradient}
          style={{ position: "absolute", left: 0, right: 0, bottom: 0, top: 0 }}
        />
        <View style={{ position: "absolute", left: 18, right: 18, bottom: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
            <Text
              style={{
                flex: 1,
                color: colors.fg,
                fontFamily: fonts.display,
                fontSize: 26,
                letterSpacing: -0.4,
              }}
            >
              {movie.title}
            </Text>
            <Pressable
              onPress={toggleFavorite}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityState={{ selected: favorited }}
              accessibilityLabel={
                favorited
                  ? `Remove ${movie.title} from favourites`
                  : `Add ${movie.title} to favourites`
              }
              style={{ paddingTop: 2 }}
            >
              <Ionicons
                name={favorited ? "star" : "star-outline"}
                size={24}
                color={favorited ? colors.accent : colors.faint}
              />
            </Pressable>
          </View>
          {meta ? (
            <Text style={{ color: colors.muted, fontSize: 12, marginTop: 5 }}>
              {meta}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={{ paddingHorizontal: 18, gap: 12, marginTop: 14 }}>
        {/* Watched row */}
        <View
          style={{
            ...card,
            flexDirection: "row",
            alignItems: "center",
            gap: 14,
            padding: 14,
          }}
        >
          <CheckButton checked={isWatched} size={48} onToggle={toggleWatched} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.fg, fontFamily: fonts.display, fontSize: 14 }}>
              {isWatched ? "Watched" : "On your watchlist"}
            </Text>
            <Text style={{ color: colors.faint, fontSize: 12, marginTop: 2 }}>
              {isWatched
                ? `Seen ${fmtDate(movie.watched_at)}`
                : "Mark it watched once you've seen it"}
            </Text>
          </View>
        </View>

        {/* Your rating */}
        <View style={{ ...card, padding: 14, gap: 10 }}>
          <Text style={sectionLabel}>YOUR RATING</Text>
          <StarRating value={movie.rating} onChange={rate} size={38} />
        </View>

        {/* Synopsis */}
        {movie.overview && (
          <View style={{ ...card, padding: 14, gap: 8 }}>
            <Text style={sectionLabel}>SYNOPSIS</Text>
            <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 20 }}>
              {movie.overview}
            </Text>
          </View>
        )}

        {/* Remove */}
        <Pressable
          onPress={confirmRemove}
          accessibilityRole="button"
          accessibilityLabel="Remove from library"
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingVertical: 12,
            paddingHorizontal: 4,
          }}
        >
          <Ionicons name="trash-outline" size={15} color={colors.danger} />
          <Text style={{ color: colors.danger, fontSize: 13, fontWeight: "600" }}>
            Remove from library
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
