import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius } from "@/lib/theme";
import { GifSearchUnavailable, searchGifs, type Gif } from "@/lib/giphy";

/** Full-screen GIF search sheet. Selecting a GIF returns its animated URL. */
export default function GifPicker({
  visible,
  onClose,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [gifs, setGifs] = useState<Gif[]>([]);
  const [status, setStatus] = useState<
    "loading" | "done" | "error" | "unavailable"
  >("loading");
  const gen = useRef(0);

  useEffect(() => {
    if (!visible) return;
    const g = ++gen.current;
    setStatus("loading");
    const timer = setTimeout(
      async () => {
        try {
          const res = await searchGifs(query);
          if (g !== gen.current) return;
          setGifs(res);
          setStatus("done");
        } catch (err) {
          if (g !== gen.current) return;
          setStatus(err instanceof GifSearchUnavailable ? "unavailable" : "error");
        }
      },
      query.trim() ? 350 : 0
    );
    return () => clearTimeout(timer);
  }, [query, visible]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: colors.ink, paddingTop: 14 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            paddingHorizontal: 16,
            paddingBottom: 10,
          }}
        >
          <View
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.line,
              borderRadius: radius.md,
              paddingHorizontal: 12,
            }}
          >
            <Ionicons name="search" size={16} color={colors.faint} />
            <TextInput
              autoFocus
              value={query}
              onChangeText={setQuery}
              placeholder="Search GIFs…"
              placeholderTextColor={colors.faint}
              autoCorrect={false}
              style={{ flex: 1, color: colors.fg, fontSize: 15, paddingVertical: 11 }}
            />
          </View>
          <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button">
            <Text style={{ color: colors.accent, fontSize: 15, fontWeight: "700" }}>
              Done
            </Text>
          </Pressable>
        </View>

        {status === "loading" ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
        ) : status === "error" || status === "unavailable" ? (
          <Text
            style={{
              color: colors.muted,
              textAlign: "center",
              marginTop: 24,
              paddingHorizontal: 32,
              lineHeight: 20,
            }}
          >
            {status === "unavailable"
              ? "GIF search isn't set up on the server yet."
              : "GIF search didn't respond. Check your connection and try again."}
          </Text>
        ) : (
          <FlatList
            data={gifs}
            keyExtractor={(g) => g.id}
            numColumns={2}
            contentContainerStyle={{ padding: 12, gap: 8 }}
            columnWrapperStyle={{ gap: 8 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  onSelect(item.url);
                  onClose();
                }}
                accessibilityRole="button"
                accessibilityLabel="Send this GIF"
                style={{
                  flex: 1,
                  aspectRatio: 1,
                  borderRadius: 10,
                  overflow: "hidden",
                  backgroundColor: colors.surface,
                }}
              >
                <Image
                  source={{ uri: item.preview }}
                  style={{ width: "100%", height: "100%" }}
                  contentFit="cover"
                />
              </Pressable>
            )}
            ListEmptyComponent={
              <Text style={{ color: colors.muted, textAlign: "center", marginTop: 24 }}>
                No GIFs found.
              </Text>
            }
          />
        )}
        <Text
          style={{
            color: colors.faint,
            fontSize: 10,
            textAlign: "center",
            paddingBottom: 10,
          }}
        >
          Powered by GIPHY
        </Text>
      </View>
    </Modal>
  );
}
