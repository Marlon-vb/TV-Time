import { useRef, useState, type ReactNode } from "react";
import {
  Animated,
  PanResponder,
  View,
  type GestureResponderHandlers,
} from "react-native";
import * as Haptics from "expo-haptics";

/**
 * Drag-to-reorder for a short list of fixed-height rows.
 *
 * Built on PanResponder and Animated, both already in React Native, rather
 * than a drag library — every one of those pulls in Reanimated and Gesture
 * Handler, two native modules, and the general case they solve (variable row
 * heights, nested scrolling, hundreds of rows) is not this one. A favourites
 * shelf is ten rows of one height.
 *
 * The gesture is claimed by a handle rather than the whole row, so the poster
 * and title stay tappable and a vertical drag anywhere else still scrolls the
 * page.
 */
export default function ReorderList<T>({
  items,
  keyOf,
  rowHeight,
  gap = 0,
  onReorder,
  renderRow,
  onDragStateChange,
}: {
  items: T[];
  keyOf: (item: T) => string | number;
  rowHeight: number;
  gap?: number;
  /** The finished order. Called once, on release. */
  onReorder: (next: T[]) => void;
  /** `handle` is spread onto whatever element should start the drag. */
  renderRow: (
    item: T,
    index: number,
    handle: GestureResponderHandlers,
    dragging: boolean
  ) => ReactNode;
  /** Lets the parent freeze its ScrollView while a drag is in progress. */
  onDragStateChange?: (dragging: boolean) => void;
}) {
  const pitch = rowHeight + gap;
  const pan = useRef(new Animated.Value(0)).current;
  const [from, setFrom] = useState<number | null>(null);
  const [to, setTo] = useState<number | null>(null);

  // PanResponder callbacks are created once and would otherwise close over the
  // first render's values forever.
  const fromRef = useRef<number | null>(null);
  const toRef = useRef<number | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // Created once per row and kept. A PanResponder rebuilt during a drag can
  // drop the gesture mid-move; these read everything they need from refs, so
  // they never need rebuilding.
  const responders = useRef(new Map<number, GestureResponderHandlers>());
  const handleFor = (index: number): GestureResponderHandlers => {
    const cached = responders.current.get(index);
    if (cached) return cached;
    const made = makeResponder(index);
    responders.current.set(index, made);
    return made;
  };

  const makeResponder = (index: number) =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        fromRef.current = index;
        toRef.current = index;
        setFrom(index);
        setTo(index);
        pan.setValue(0);
        onDragStateChange?.(true);
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      },
      onPanResponderMove: (_e, g) => {
        pan.setValue(g.dy);
        const start = fromRef.current;
        if (start == null) return;
        const next = Math.max(
          0,
          Math.min(itemsRef.current.length - 1, start + Math.round(g.dy / pitch))
        );
        // Only on a crossing, not every frame: this drives a re-render, and a
        // setState per pixel of travel makes the drag stutter.
        if (next !== toRef.current) {
          toRef.current = next;
          setTo(next);
          void Haptics.selectionAsync();
        }
      },
      onPanResponderRelease: () => finish(),
      onPanResponderTerminate: () => finish(),
    }).panHandlers;

  const finish = () => {
    const start = fromRef.current;
    const end = toRef.current;
    fromRef.current = null;
    toRef.current = null;
    setFrom(null);
    setTo(null);
    pan.setValue(0);
    onDragStateChange?.(false);
    if (start == null || end == null || start === end) return;
    const next = [...itemsRef.current];
    const [row] = next.splice(start, 1);
    next.splice(end, 0, row);
    onReorder(next);
  };

  return (
    <View>
      {items.map((item, index) => {
        const dragging = from === index;
        // Every row the dragged one has passed steps aside by exactly one
        // pitch, which is what makes the gap follow the finger.
        let shift = 0;
        if (from != null && to != null && !dragging) {
          if (from < to && index > from && index <= to) shift = -pitch;
          else if (from > to && index < from && index >= to) shift = pitch;
        }
        return (
          <Animated.View
            key={keyOf(item)}
            style={{
              height: rowHeight,
              marginBottom: gap,
              zIndex: dragging ? 10 : 0,
              transform: [{ translateY: dragging ? pan : shift }],
              ...(dragging
                ? {
                    shadowColor: "#000",
                    shadowOpacity: 0.45,
                    shadowRadius: 14,
                    shadowOffset: { width: 0, height: 6 },
                  }
                : null),
            }}
          >
            {renderRow(item, index, handleFor(index), dragging)}
          </Animated.View>
        );
      })}
    </View>
  );
}
