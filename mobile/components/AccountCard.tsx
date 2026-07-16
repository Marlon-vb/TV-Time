import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import Bouncy from "@/components/Bouncy";
import { card } from "@/components/ui";
import { colors, fonts, radius } from "@/lib/theme";
import { useAuth } from "@/lib/social/auth";
import { deleteAccount } from "@/lib/social/api";

/**
 * Sign-in / account block shown at the top of the Profile tab. Handles the
 * three states: Supabase not configured, signed out, and signed in (with a
 * one-time username setup when the profile still has its placeholder name).
 */
export default function AccountCard() {
  const { ready, configured, session, profile, signInWithApple, signOut } =
    useAuth();
  const [busy, setBusy] = useState(false);

  if (!configured) {
    return (
      <View style={{ ...card, padding: 16 }}>
        <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>
          Social features aren&apos;t configured in this build.
        </Text>
      </View>
    );
  }

  if (!ready) {
    return (
      <View style={{ ...card, padding: 20, alignItems: "center" }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={{ ...card, padding: 18, gap: 12, alignItems: "center" }}>
        <Text style={{ color: colors.fg, fontFamily: fonts.display, fontSize: 16 }}>
          Connect with friends
        </Text>
        <Text
          style={{
            color: colors.muted,
            fontSize: 12,
            lineHeight: 18,
            textAlign: "center",
          }}
        >
          Sign in to follow friends, see what they&apos;re watching, and react
          together. Episodes you mark as watched are shared with people who
          follow you; you can delete your account and everything you&apos;ve
          shared at any time.
        </Text>
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={
            AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
          }
          cornerRadius={radius.sm}
          style={{ width: 220, height: 44 }}
          onPress={async () => {
            setBusy(true);
            try {
              await signInWithApple();
            } catch (err) {
              const e = err as { code?: string; message?: string };
              if (e.code !== "ERR_REQUEST_CANCELED") {
                Alert.alert("Sign-in failed", e.message ?? "Please try again.");
              }
            } finally {
              setBusy(false);
            }
          }}
        />
        {busy && <ActivityIndicator color={colors.accent} />}
      </View>
    );
  }

  // Signed in. Prompt for a username while it's still the placeholder.
  const needsUsername =
    !profile || profile.username.startsWith("user_");

  return (
    <View style={{ ...card, padding: 16, gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: colors.overlay,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: colors.accent, fontFamily: fonts.display, fontSize: 18 }}>
            {(profile?.display_name || profile?.username || "?")
              .charAt(0)
              .toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.fg, fontFamily: fonts.display, fontSize: 15 }}>
            {profile?.display_name || "Your profile"}
          </Text>
          {profile && !needsUsername && (
            <Text style={{ color: colors.faint, fontSize: 12 }}>
              @{profile.username}
            </Text>
          )}
        </View>
        <Bouncy
          onPress={() =>
            Alert.alert("Sign out?", "You'll stop syncing with friends.", [
              { text: "Cancel", style: "cancel" },
              { text: "Sign out", style: "destructive", onPress: () => void signOut() },
            ])
          }
          scaleTo={0.92}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: radius.sm,
            borderWidth: 1,
            borderColor: colors.line,
          }}
        >
          <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>
            Sign out
          </Text>
        </Bouncy>
      </View>

      {needsUsername && <UsernameSetup />}

      <DeleteAccountRow />
    </View>
  );
}

/** App Store 5.1.1(v): in-app account deletion, double-confirmed. */
function DeleteAccountRow() {
  const [busy, setBusy] = useState(false);

  const confirmDelete = () => {
    Alert.alert(
      "Delete account?",
      "This permanently removes your profile, follows, shared watch history, comments, photos, and votes from TV Time's servers. Your on-device library stays.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete forever",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Are you sure?",
              "There is no way to undo this.",
              [
                { text: "Keep my account", style: "cancel" },
                {
                  text: "Yes, delete everything",
                  style: "destructive",
                  onPress: async () => {
                    setBusy(true);
                    const ok = await deleteAccount();
                    setBusy(false);
                    if (!ok) {
                      Alert.alert(
                        "Couldn't delete account",
                        "Check your connection and try again."
                      );
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  return (
    <Pressable
      onPress={confirmDelete}
      disabled={busy}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel="Delete account"
      style={{
        borderTopWidth: 1,
        borderTopColor: colors.line,
        paddingTop: 12,
        opacity: busy ? 0.5 : 1,
      }}
    >
      <Text style={{ color: colors.danger, fontSize: 12, fontWeight: "600" }}>
        {busy ? "Deleting account…" : "Delete account…"}
      </Text>
      <Text style={{ color: colors.faint, fontSize: 11, marginTop: 2 }}>
        Permanently removes your profile and everything you&apos;ve shared.
      </Text>
    </Pressable>
  );
}

function UsernameSetup() {
  const { setUsername } = useAuth();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setError(null);
    const res = await setUsername(value);
    if (!res.ok) setError(res.error ?? "Try another username.");
    setBusy(false);
  };

  return (
    <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 12 }}>
      <Text style={{ color: colors.muted, fontSize: 12 }}>
        Pick a username so friends can find you:
      </Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: colors.raised,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: radius.sm,
            paddingHorizontal: 12,
          }}
        >
          <Text style={{ color: colors.faint, fontSize: 14 }}>@</Text>
          <TextInput
            value={value}
            onChangeText={setValue}
            placeholder="username"
            placeholderTextColor={colors.faint}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={20}
            style={{ flex: 1, color: colors.fg, fontSize: 14, paddingVertical: 10, marginLeft: 2 }}
          />
        </View>
        <Bouncy
          onPress={() => void save()}
          disabled={busy || value.trim() === ""}
          scaleTo={0.92}
          style={{
            minWidth: 96,
            paddingHorizontal: 24,
            paddingVertical: 12,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: radius.sm,
            backgroundColor: colors.accent,
            opacity: busy || value.trim() === "" ? 0.5 : 1,
          }}
        >
          <Text style={{ color: colors.ink, fontWeight: "800", fontSize: 15 }}>
            {busy ? "Saving…" : "Save"}
          </Text>
        </Bouncy>
      </View>
      {error && <Text style={{ color: colors.danger, fontSize: 11 }}>{error}</Text>}
    </View>
  );
}
