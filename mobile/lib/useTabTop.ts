import { useEffect, useRef } from "react";
import { useNavigation } from "expo-router";

/**
 * Tapping the icon of the tab you are already on returns that screen to the
 * top — the standard iOS gesture, and the only way back up from a long list
 * without a lot of scrolling.
 *
 * A callback rather than a ref: every tab holds a different scroll container
 * (SectionList, FlatList, ScrollView, and Upcoming swaps between two), and
 * Watch Next's top is not offset zero. The screen already knows how to scroll
 * itself, so it says what "top" means and this only says when.
 *
 * Nothing happens on the press that brings you to a tab. Events are addressed
 * to one route, so only that screen hears them, and `isFocused` rejects the
 * arrival press — the screen is not focused yet at that point.
 */
export function useTabTop(scrollToTop: () => void): void {
  const navigation = useNavigation();
  // Kept in a ref so a screen can pass an inline closure over changing state
  // (Watch Next's masthead offset) without resubscribing on every render.
  const saved = useRef(scrollToTop);
  saved.current = scrollToTop;

  useEffect(() => {
    const onPress = (e: { defaultPrevented?: boolean }) => {
      const focused = navigation.isFocused();
      // Next frame, so every other tabPress listener has had its say — one of
      // them may still call preventDefault, and Discover clears its search
      // here, which changes what the top even is.
      requestAnimationFrame(() => {
        if (focused && !e.defaultPrevented) saved.current();
      });
    };
    const unsub = navigation.addListener("tabPress" as never, onPress as never);
    return unsub;
  }, [navigation]);
}
