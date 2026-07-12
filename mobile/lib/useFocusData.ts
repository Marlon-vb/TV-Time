import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";

/**
 * Load synchronous repo data whenever the screen gains focus, so marking an
 * episode watched on one tab is reflected the moment you switch back.
 */
export function useFocusData<T>(loader: () => T): {
  data: T | null;
  reload: () => void;
} {
  const [data, setData] = useState<T | null>(null);

  const reload = useCallback(() => {
    setData(loader());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loader]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  return { data, reload };
}
