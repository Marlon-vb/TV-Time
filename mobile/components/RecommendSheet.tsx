import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import Bouncy from "@/components/Bouncy";
import Poster from "@/components/Poster";
import { colors, fonts, radius } from "@/lib/theme";
import * as repo from "@/lib/repo";
import * as social from "@/lib/social/api";

/**
 * Pick one of your shows and send it to one person.
 *
 * Your own library is the whole catalogue here. Recommending something you
 * have not watched is a link, not a recommendation, and a search across all of
 * TVmaze would turn a small social gesture into a second Discover screen.
 */
export default function RecommendSheet({
  toUserId,
  toName,
  visible,
  onClose,
}: {
  toUserId: string;
  /** Display name or @handle, for the title and the confirmation. */
  toName: string;
  visible: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<{
    id: number;
    name: string;
    poster_url: string | null;
  } | null>(null);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<Set<number> | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Read once per open, not per keystroke: this is a local query over a few
  // hundred rows and the filter below is cheaper than re-running it.
  const shows = useMemo(
    () => (visible ? repo.listShowsWithProgress() : []),
    [visible]
  );

  // Already-sent shows are marked rather than hidden — "sent" is the answer to
  // "did I already tell them about this", and hiding it just invites the
  // question again.
  useEffect(() => {
    if (!visible) return;
    let alive = true;
    social
      .recommendationsISent(toUserId)
      .then((s) => alive && setSent(s))
      .catch(() => alive && setSent(new Set()));
    return () => {
      alive = false;
    };
  }, [visible, toUserId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = q
      ? shows.filter((s) => s.name.toLowerCase().includes(q))
      : shows;
    return rows.slice(0, 60);
  }, [shows, query]);

  const close = () => {
    setQuery("");
    setPicked(null);
    setNote("");
    setError(null);
    setSent(null);
    onClose();
  };

  const send = async () => {
    if (!picked) return;
    setSending(true);
    setError(null);
    const ok = await social.recommendShow({
      toUserId,
      showId: picked.id,
      showName: picked.name,
      posterUrl: picked.poster_url,
      note,
    });
    setSending(false);
    if (!ok) {
      // The insert policy refuses anyone you do not follow. Say which, rather
      // than "something went wrong".
      setError(`Couldn't send. You need to be following ${toName}.`);
      return;
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    close();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={close}
    >
      <View style={{ flex: 1, backgroundColor: colors.ink, padding: 16, gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Text
            style={{
              flex: 1,
              color: colors.fg,
              fontFamily: fonts.display,
              fontSize: 20,
            }}
          >
            {picked ? `Send to ${toName}` : "Pick a show"}
          </Text>
          <Pressable
            onPress={close}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={22} color={colors.muted} />
          </Pressable>
        </View>

        {picked ? (
          <View style={{ gap: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Poster
                src={picked.poster_url}
                name={picked.name}
                width={56}
                height={82}
                radius={9}
              />
              <View style={{ flex: 1 }}>
                <Text
                  style={{ color: colors.fg, fontFamily: fonts.displayMedium, fontSize: 15 }}
                  numberOfLines={2}
                >
                  {picked.name}
                </Text>
                <Pressable onPress={() => setPicked(null)} hitSlop={8}>
                  <Text style={{ color: colors.accent, fontSize: 12, marginTop: 4 }}>
                    Choose a different show
                  </Text>
                </Pressable>
              </View>
            </View>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Say why (optional)"
              placeholderTextColor={colors.faint}
              maxLength={140}
              multiline
              style={{
                minHeight: 76,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.line,
                borderRadius: radius.md,
                padding: 12,
                color: colors.fg,
                fontSize: 14,
              }}
            />
            {error ? (
              <Text style={{ color: colors.danger, fontSize: 12 }}>{error}</Text>
            ) : null}
            <Bouncy
              onPress={() => void send()}
              disabled={sending}
              scaleTo={0.97}
              accessibilityRole="button"
              accessibilityLabel={`Send ${picked.name} to ${toName}`}
              style={{
                paddingVertical: 14,
                borderRadius: radius.sm,
                backgroundColor: colors.accent,
                alignItems: "center",
                opacity: sending ? 0.6 : 1,
              }}
            >
              <Text style={{ color: colors.ink, fontWeight: "800", fontSize: 14 }}>
                {sending ? "Sending…" : "Send"}
              </Text>
            </Bouncy>
          </View>
        ) : (
          <>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.line,
                borderRadius: radius.md,
                paddingHorizontal: 14,
              }}
            >
              <Ionicons name="search" size={16} color={colors.faint} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search your shows…"
                placeholderTextColor={colors.faint}
                autoCorrect={false}
                style={{ flex: 1, paddingVertical: 12, color: colors.fg, fontSize: 15 }}
              />
            </View>
            {sent === null ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <FlatList
                data={filtered}
                keyExtractor={(s) => String(s.id)}
                keyboardShouldPersistTaps="handled"
                ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                contentContainerStyle={{ paddingBottom: 24 }}
                ListEmptyComponent={
                  <Text style={{ color: colors.muted, fontSize: 13 }}>
                    {query.trim()
                      ? "Nothing in your library matches that."
                      : "Follow a few shows and you can send them to friends."}
                  </Text>
                }
                renderItem={({ item }) => {
                  const already = sent.has(item.id);
                  return (
                    <Pressable
                      onPress={() =>
                        setPicked({
                          id: item.id,
                          name: item.name,
                          poster_url: item.poster_url,
                        })
                      }
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                      }}
                    >
                      <Poster
                        src={item.poster_url}
                        name={item.name}
                        width={38}
                        height={56}
                        radius={7}
                      />
                      <Text
                        style={{ flex: 1, color: colors.fg, fontSize: 14 }}
                        numberOfLines={1}
                      >
                        {item.name}
                      </Text>
                      {already ? (
                        <Text style={{ color: colors.faint, fontSize: 11 }}>Sent</Text>
                      ) : null}
                    </Pressable>
                  );
                }}
              />
            )}
          </>
        )}
      </View>
    </Modal>
  );
}
