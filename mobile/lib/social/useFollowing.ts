import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import * as social from "./api";
import type { Profile } from "./types";

/**
 * Who you follow, and the one place that changes it.
 *
 * Both the friends list and the add-friends screen toggle follows, and both
 * need the same three things to be right: the flip has to show immediately,
 * it has to revert if the server says no, and a fetch that resolves after a
 * toggle must not undo it. Two copies of that would drift.
 */
export function useFollowing() {
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  // Kept beside the list rather than derived from it: unfollowing leaves the
  // row on screen so it can be undone, so membership and presence differ.
  const [ids, setIds] = useState<Set<string> | null>(null);
  const pending = useRef(new Map<string, boolean>());

  const load = useCallback(async () => {
    const list = await social.getFollowing();
    setProfiles(list);
    setIds(() => {
      const next = new Set(list.map((p) => p.id));
      // Replay anything toggled while this fetch was in flight; without it a
      // slow response silently reinstates a follow the user just dropped.
      for (const [id, follows] of pending.current) {
        if (follows) next.add(id);
        else next.delete(id);
      }
      return next;
    });
    return list;
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = useCallback((profileId: string) => {
    setIds((prev) => {
      if (!prev) return prev;
      const wasFollowing = prev.has(profileId);
      const next = new Set(prev);
      if (wasFollowing) next.delete(profileId);
      else next.add(profileId);
      pending.current.set(profileId, !wasFollowing);

      void (
        wasFollowing ? social.unfollow(profileId) : social.follow(profileId)
      ).then((ok) => {
        pending.current.delete(profileId);
        if (ok) return;
        // Revert the optimistic flip — a silent no-op reads as a broken app.
        setIds((current) => {
          const reverted = new Set(current ?? []);
          if (wasFollowing) reverted.add(profileId);
          else reverted.delete(profileId);
          return reverted;
        });
        Alert.alert(
          wasFollowing ? "Couldn't unfollow" : "Couldn't follow",
          "Check your connection and try again."
        );
      });

      return next;
    });
  }, []);

  return { profiles, ids, toggle, reload: load };
}
