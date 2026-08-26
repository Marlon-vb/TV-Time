import { Pressable, Text, View } from "react-native";
import Avatar from "@/components/Avatar";
import Bouncy from "@/components/Bouncy";
import { card } from "@/components/ui";
import { colors, fonts, radius } from "@/lib/theme";
import type { Profile } from "@/lib/social/types";

/**
 * One person, with a follow toggle. Shared by the friends list and the
 * add-friends screen — the same row means following someone you just found
 * and unfollowing someone you already have look and behave identically.
 *
 * Fully controlled: follow state lives in the parent, so row remounts and
 * late-resolving fetches can never show stale state or clobber an optimistic
 * toggle.
 */
export default function UserRow({
  profile,
  following,
  note,
  onToggle,
  onOpen,
}: {
  profile: Profile;
  /** null while the following set is still loading. */
  following: boolean | null;
  /** Why this person is being shown — "3 shows in common". Suggestions only. */
  note?: string | null;
  onToggle: () => void;
  onOpen: (username: string) => void;
}) {
  return (
    <View style={{ ...card, flexDirection: "row", alignItems: "center", gap: 12, padding: 10 }}>
      <Pressable onPress={() => onOpen(profile.username)}>
        <Avatar name={profile.display_name || profile.username} url={profile.avatar_url} size={40} />
      </Pressable>
      <Pressable style={{ flex: 1 }} onPress={() => onOpen(profile.username)}>
        <Text style={{ color: colors.fg, fontFamily: fonts.displayMedium, fontSize: 14 }} numberOfLines={1}>
          {profile.display_name || profile.username}
        </Text>
        <Text style={{ color: colors.faint, fontSize: 12 }}>@{profile.username}</Text>
        {note ? (
          <Text style={{ color: colors.accent, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
            {note}
          </Text>
        ) : null}
      </Pressable>
      <Bouncy
        onPress={onToggle}
        disabled={following == null}
        scaleTo={0.92}
        accessibilityRole="button"
        accessibilityLabel={
          following ? `Unfollow ${profile.username}` : `Follow ${profile.username}`
        }
        style={{
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: radius.sm,
          backgroundColor: following ? colors.overlay : colors.accent,
          minWidth: 84,
          alignItems: "center",
          opacity: following == null ? 0.5 : 1,
        }}
      >
        <Text style={{ color: following ? colors.muted : colors.ink, fontWeight: "800", fontSize: 12 }}>
          {following == null ? "…" : following ? "Following" : "Follow"}
        </Text>
      </Bouncy>
    </View>
  );
}
