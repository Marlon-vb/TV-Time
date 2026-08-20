import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";
import { Ionicons } from "@expo/vector-icons";
import Bouncy from "@/components/Bouncy";
import ShareCard, { CARD_HEIGHT, CARD_WIDTH } from "@/components/ShareCard";
import { colors, radius } from "@/lib/theme";
import { cardFileName, cardShareMessage, type CardData } from "@/lib/share-card";

/**
 * Shows the card, then hands it to the share sheet as a PNG.
 *
 * The card renders at its real 1080x1920 and is scaled down with a transform
 * for the preview, rather than laid out smaller: captureRef grabs the view as
 * laid out, so shrinking the layout would shrink the exported image with it.
 * Scaling is visual only, so the capture stays full size.
 */
export default function ShareCardSheet({
  card,
  onClose,
}: {
  card: CardData | null;
  onClose: () => void;
}) {
  const shot = useRef<View>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const { width, height } = useWindowDimensions();

  // Fit the card inside the sheet, leaving room for the buttons under it.
  const scale = Math.min(
    (width - 48) / CARD_WIDTH,
    (height * 0.62) / CARD_HEIGHT
  );

  const share = async () => {
    if (!card) return;
    setBusy(true);
    setFailed(false);
    try {
      const uri = await captureRef(shot, { format: "png", quality: 1 });
      // Renamed before sharing: captureRef writes a temp file with a generated
      // name, and some targets show it. Copied rather than moved so a retry
      // after a cancelled share still has the original to work from.
      const named = new File(Paths.cache, cardFileName(card));
      if (named.exists) named.delete();
      new File(uri).copy(named);
      await Sharing.shareAsync(named.uri, {
        mimeType: "image/png",
        UTI: "public.png",
        dialogTitle: cardShareMessage(card),
      });
    } catch {
      setFailed(true);
    }
    setBusy(false);
  };

  return (
    <Modal
      visible={card != null}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.85)",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          gap: 22,
        }}
      >
        {card && (
          <>
            {/* Sized to the scaled result so the buttons sit against the card
                rather than against its full 1920pt height. */}
            <View
              style={{
                width: CARD_WIDTH * scale,
                height: CARD_HEIGHT * scale,
                borderRadius: 18,
                overflow: "hidden",
              }}
            >
              <View
                ref={shot}
                collapsable={false}
                style={{
                  width: CARD_WIDTH,
                  height: CARD_HEIGHT,
                  transform: [{ scale }],
                  // Scaling happens about the centre, so pull the card back to
                  // the origin by half of what the transform removed.
                  marginLeft: -(CARD_WIDTH * (1 - scale)) / 2,
                  marginTop: -(CARD_HEIGHT * (1 - scale)) / 2,
                }}
              >
                <ShareCard card={card} />
              </View>
            </View>

            {failed && (
              <Text style={{ color: colors.danger, fontSize: 13 }}>
                Couldn’t make the image. Try again.
              </Text>
            )}

            <View style={{ flexDirection: "row", gap: 10 }}>
              <Bouncy
                onPress={onClose}
                scaleTo={0.95}
                accessibilityRole="button"
                style={{
                  paddingHorizontal: 22,
                  paddingVertical: 14,
                  borderRadius: radius.sm,
                  borderWidth: 1,
                  borderColor: colors.line,
                }}
              >
                <Text style={{ color: colors.muted, fontWeight: "700", fontSize: 14 }}>
                  Not now
                </Text>
              </Bouncy>
              <Bouncy
                onPress={() => void share()}
                disabled={busy}
                scaleTo={0.95}
                accessibilityRole="button"
                accessibilityLabel="Share this card"
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  paddingHorizontal: 26,
                  paddingVertical: 14,
                  borderRadius: radius.sm,
                  backgroundColor: colors.accent,
                  opacity: busy ? 0.6 : 1,
                }}
              >
                {busy ? (
                  <ActivityIndicator color={colors.ink} size="small" />
                ) : (
                  <Ionicons name="share-outline" size={16} color={colors.ink} />
                )}
                <Text style={{ color: colors.ink, fontWeight: "800", fontSize: 14 }}>
                  Share
                </Text>
              </Bouncy>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}
