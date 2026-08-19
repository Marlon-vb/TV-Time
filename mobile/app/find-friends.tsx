import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Share,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Bouncy from "@/components/Bouncy";
import UserRow from "@/components/UserRow";
import { colors, fonts, radius } from "@/lib/theme";
import { useAuth } from "@/lib/social/auth";
import { useFollowing } from "@/lib/social/useFollowing";
import * as social from "@/lib/social/api";
import type { Profile } from "@/lib/social/types";

/**
 * Adding people is a destination, not a mode of the Friends tab.
 *
 * It used to be one half of a two-way segmented control there, which meant the
 * tab could not also show the friends list without a third segment — and it
 * put a screen you visit occasionally at the same weight as the two you look
 * at daily. Reached from the person-add control in the Friends masthead.
 */
export default function FindFriendsScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  return (
    <FindFriends
      myUsername={profile?.username}
      onOpenUser={(u) => router.push(`/u/${u}` as never)}
    />
  );
}

function FindFriends({
  myUsername,
  onOpenUser,
}: {
  myUsername?: string;
  onOpenUser: (username: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [contacts, setContacts] = useState<
    Profile[] | "scanning" | "denied" | null
  >(null);
  const [searching, setSearching] = useState(false);
  // Who I already follow, fetched ONCE — not one round trip per result row.
  const { ids: followingIds, toggle: toggleFollow } = useFollowing();
  const gen = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const g = ++gen.current;
    const timer = setTimeout(async () => {
      setSearching(true);
      const r = await social.searchProfiles(q);
      if (g === gen.current) {
        setResults(r);
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const invite = async () => {
    await Share.share({
      message: myUsername
        ? `Follow me on TV App — I'm @${myUsername}. Got the app? Tap tvtime://u/${myUsername} — otherwise search @${myUsername} once you're in.`
        : "Join me on TV App!",
    });
  };

  const scanContacts = async () => {
    setContacts("scanning");
    try {
      const { granted, profiles } = await social.findFriendsFromContacts();
      setContacts(granted ? profiles : "denied");
    } catch {
      setContacts(null);
      Alert.alert("Couldn't scan contacts", "Please try again.");
    }
  };

  return (
    <FlatList
      data={results}
      keyExtractor={(p) => p.id}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
      ListHeaderComponent={
        <View style={{ gap: 12, marginBottom: 8 }}>
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
            <Ionicons name="at" size={16} color={colors.faint} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search by username"
              placeholderTextColor={colors.faint}
              autoCapitalize="none"
              autoCorrect={false}
              style={{ flex: 1, paddingVertical: 12, color: colors.fg, fontSize: 15 }}
            />
            {searching && <ActivityIndicator color={colors.accent} />}
          </View>

          <View style={{ flexDirection: "row", gap: 8 }}>
            <ActionChip icon="share-outline" label="Invite link" onPress={invite} />
            <ActionChip icon="people-outline" label="From contacts" onPress={scanContacts} />
          </View>

          {contacts === "scanning" && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <ActivityIndicator color={colors.accent} size="small" />
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                Scanning your contacts…
              </Text>
            </View>
          )}
          {contacts === "denied" && (
            <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>
              Contacts access is off. Allow it in Settings → TV App to find
              friends from your address book.
            </Text>
          )}
          {Array.isArray(contacts) && (
            <View style={{ gap: 8 }}>
              <Text style={{ color: colors.muted, fontSize: 12, fontFamily: fonts.displayMedium }}>
                {contacts.length > 0
                  ? "In your contacts"
                  : "No contacts are on TV App yet — invite someone!"}
              </Text>
              {contacts.map((p) => (
                <UserRow
                  key={p.id}
                  profile={p}
                  following={followingIds ? followingIds.has(p.id) : null}
                  onToggle={() => toggleFollow(p.id)}
                  onOpen={onOpenUser}
                />
              ))}
            </View>
          )}

          {query.trim().length >= 2 && results.length > 0 && (
            <Text style={{ color: colors.muted, fontSize: 12, fontFamily: fonts.displayMedium, marginTop: 4 }}>
              Results
            </Text>
          )}
        </View>
      }
      renderItem={({ item }) => (
        <UserRow
          profile={item}
          following={followingIds ? followingIds.has(item.id) : null}
          onToggle={() => toggleFollow(item.id)}
          onOpen={onOpenUser}
        />
      )}
      ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
    />
  );
}

function ActionChip({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Bouncy
      onPress={onPress}
      scaleTo={0.95}
      style={{
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        paddingVertical: 11,
        borderRadius: radius.sm,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.line,
      }}
    >
      <Ionicons name={icon} size={15} color={colors.accent} />
      <Text style={{ color: colors.fg, fontSize: 12, fontWeight: "700" }}>{label}</Text>
    </Bouncy>
  );
}
