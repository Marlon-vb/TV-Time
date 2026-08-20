import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Avatar from "@/components/Avatar";
import Bouncy from "@/components/Bouncy";
import Poster from "@/components/Poster";
import { EmptyState } from "@/components/ui";
import { colors, fonts, radius } from "@/lib/theme";
import { useAuth } from "@/lib/social/auth";
import * as repo from "@/lib/repo";
import { filterShows } from "@/lib/show-sort";

/**
 * Pick a profile picture from a show you follow.
 *
 * Posters rather than the camera roll, deliberately. The picture is stored as
 * the URL TVmaze already serves, so nothing is uploaded, nothing sits in our
 * storage, and nothing is served from it — an avatar costs the same at a
 * million accounts as at ten. A photo per account would be a bucket, an
 * upload path, and egress on every profile anyone looks at.
 *
 * It also says something. "That's the one they picked" is a better first
 * impression on a TV app than a cropped selfie.
 */
export default function ChooseAvatarScreen() {
  const router = useRouter();
  const { profile, setAvatar } = useAuth();
  const { width } = useWindowDimensions();
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  // Three across, matching the Library grid: 16pt outer padding each side and
  // two 10pt gutters.
  const cell = (width - 32 - 20) / 3;

  const shows = useMemo(() => repo.listShowsWithProgress(), []);
  const visible = useMemo(
    () => filterShows(shows, query).filter((s) => s.poster_url),
    [shows, query]
  );

  const choose = useCallback(
    async (url: string | null) => {
      setSaving(url ?? "none");
      const ok = await setAvatar(url);
      setSaving(null);
      if (ok) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.back();
      }
    },
    [setAvatar, router]
  );

  const name = profile?.display_name || profile?.username || "You";

  return (
    <FlatList
      data={visible}
      keyExtractor={(s) => String(s.id)}
      numColumns={3}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
      columnWrapperStyle={{ gap: 10, marginBottom: 10 }}
      ListHeaderComponent={
        <View style={{ gap: 14, paddingTop: 6, paddingBottom: 14 }}>
          <View style={{ alignItems: "center", gap: 10 }}>
            <Avatar name={name} url={profile?.avatar_url} size={84} />
            {profile?.avatar_url ? (
              <Bouncy
                onPress={() => void choose(null)}
                scaleTo={0.94}
                accessibilityRole="button"
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: radius.sm,
                  borderWidth: 1,
                  borderColor: colors.line,
                }}
              >
                {saving === "none" ? (
                  <ActivityIndicator color={colors.muted} size="small" />
                ) : (
                  <Ionicons name="close-circle-outline" size={15} color={colors.muted} />
                )}
                <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>
                  Use my initial instead
                </Text>
              </Bouncy>
            ) : null}
          </View>

          {shows.length >= 8 && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.line,
                borderRadius: radius.md,
                paddingHorizontal: 14,
              }}
            >
              <Ionicons name="search" size={15} color={colors.faint} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search your shows"
                placeholderTextColor={colors.faint}
                autoCorrect={false}
                style={{ flex: 1, paddingVertical: 11, color: colors.fg, fontSize: 14 }}
              />
              {query.length > 0 && (
                <Pressable
                  onPress={() => setQuery("")}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                >
                  <Ionicons name="close-circle" size={16} color={colors.faint} />
                </Pressable>
              )}
            </View>
          )}
        </View>
      }
      ListEmptyComponent={
        query.trim() ? (
          <Text style={{ color: colors.muted, fontSize: 13 }}>
            No shows match “{query.trim()}”.
          </Text>
        ) : (
          <EmptyState
            icon="tv-outline"
            title="No posters yet"
            body="Follow a few shows and any of their posters can be your picture."
          />
        )
      }
      renderItem={({ item }) => {
        const chosen = profile?.avatar_url === item.poster_url;
        return (
          <Bouncy
            onPress={() => void choose(item.poster_url)}
            scaleTo={0.95}
            accessibilityRole="button"
            accessibilityState={{ selected: chosen }}
            accessibilityLabel={`Use the ${item.name} poster as your profile picture`}
            style={{ width: cell }}
          >
            <View
              style={{
                borderRadius: radius.sm + 2,
                overflow: "hidden",
                borderWidth: 2,
                // The border is always there, transparent when unselected, so
                // choosing one cannot shift the grid by two points.
                borderColor: chosen ? colors.accent : "transparent",
              }}
            >
              <Poster
                src={item.poster_url}
                name={item.name}
                width={cell - 4}
                height={(cell - 4) * 1.45}
                radius={radius.sm}
              />
            </View>
            <Text
              style={{ color: chosen ? colors.accent : colors.muted, fontSize: 11, marginTop: 4 }}
              numberOfLines={1}
            >
              {item.name}
            </Text>
            {saving === item.poster_url && (
              <ActivityIndicator color={colors.accent} size="small" style={{ marginTop: 2 }} />
            )}
          </Bouncy>
        );
      }}
    />
  );
}
