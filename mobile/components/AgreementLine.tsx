import {
  Linking,
  Pressable,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { colors } from "@/lib/theme";
import { PRIVACY_URL, TERMS_URL } from "@/lib/legal";

const agreementText = {
  color: colors.faint,
  fontSize: 11,
  lineHeight: 16,
} as const;

const linkText = {
  ...agreementText,
  color: colors.accent,
} as const;

// The link spans are only 16pt tall, so the slop does all the work of getting
// to Apple's 44pt minimum target (14 + 16 + 14). Padding would do it visibly
// and push the line away from the sign-in button it has to sit under.
const linkHitSlop = { top: 14, bottom: 14, left: 8, right: 8 } as const;

/**
 * App Store 1.2: the agreement has to be on screen at the sign-in gate, before
 * an account exists or anything can be posted — so this renders under the Apple
 * button on Profile, and again on the signed-out Friends tab. Laid out as
 * wrapping spans rather than nested <Text onPress> so the two links get a real
 * hitSlop; nested text can't have one.
 */
export default function AgreementLine({
  style,
}: {
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        {
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "center",
          alignItems: "center",
          alignSelf: "stretch",
        },
        style,
      ]}
    >
      <Text style={agreementText}>{"By signing in you agree to the "}</Text>
      <Pressable
        onPress={() => void Linking.openURL(TERMS_URL)}
        hitSlop={linkHitSlop}
        accessibilityRole="link"
        accessibilityLabel="Terms of Use — opens in your browser"
      >
        <Text style={linkText}>Terms of Use</Text>
      </Pressable>
      <Text style={agreementText}>{" and "}</Text>
      <Pressable
        onPress={() => void Linking.openURL(PRIVACY_URL)}
        hitSlop={linkHitSlop}
        accessibilityRole="link"
        accessibilityLabel="Privacy Policy — opens in your browser"
      >
        <Text style={linkText}>Privacy Policy</Text>
      </Pressable>
      <Text style={agreementText}>.</Text>
    </View>
  );
}
