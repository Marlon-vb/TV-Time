import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import * as AppleAuthentication from "expo-apple-authentication";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { registerForSocial } from "./api";
import { reconcileIfStale } from "./mirror";
import { resetCommentRate } from "./moderation";
import type { Profile } from "./types";

interface AuthState {
  ready: boolean; // initial session check finished
  configured: boolean; // Supabase env present
  session: Session | null;
  profile: Profile | null;
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  setUsername: (username: string) => Promise<{ ok: boolean; error?: string }>;
  /** A show poster URL, or null to go back to the initial. */
  setAvatar: (url: string | null) => Promise<boolean>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const loadProfile = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null);
      return;
    }
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    setProfile((data as Profile) ?? null);
  }, []);

  useEffect(() => {
    if (!supabaseConfigured) {
      setReady(true);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      void loadProfile(data.session?.user.id).finally(() => setReady(true));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      void loadProfile(s?.user.id);
      // Only on real session starts — TOKEN_REFRESHED fires ~hourly and on
      // every foreground; syncing there would burn a network call each time.
      if (s?.user && (event === "INITIAL_SESSION" || event === "SIGNED_IN")) {
        void registerForSocial(s.user.email);
        // Backfill/repair the server's copy of the watch history so friends
        // and community stats see the whole library (cheap when in sync).
        void reconcileIfStale();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const signInWithApple = useCallback(async () => {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
    if (!credential.identityToken) {
      throw new Error("Apple sign-in didn't return an identity token.");
    }
    const { error } = await supabase.auth.signInWithIdToken({
      provider: "apple",
      token: credential.identityToken,
    });
    if (error) throw error;

    // Apple only sends the name on the very first authorization — capture it.
    const fullName = [
      credential.fullName?.givenName,
      credential.fullName?.familyName,
    ]
      .filter(Boolean)
      .join(" ")
      .trim();
    if (fullName) {
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        await supabase
          .from("profiles")
          .update({ display_name: fullName })
          .eq("id", userData.user.id)
          .is("display_name", null);
      }
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    // The rate window is module state, not per-account: on a shared device the
    // next person to sign in would otherwise inherit this account's burst.
    resetCommentRate();
  }, []);

  const refreshProfile = useCallback(
    () => loadProfile(session?.user.id),
    [loadProfile, session]
  );

  const setUsername = useCallback(
    async (username: string): Promise<{ ok: boolean; error?: string }> => {
      const clean = username.trim().toLowerCase();
      if (!/^[a-z0-9_]{3,20}$/.test(clean)) {
        return {
          ok: false,
          error: "3–20 characters: letters, numbers, underscores.",
        };
      }
      if (!session?.user.id) return { ok: false, error: "Not signed in." };
      const { error } = await supabase
        .from("profiles")
        .update({ username: clean })
        .eq("id", session.user.id);
      if (error) {
        return {
          ok: false,
          error:
            error.code === "23505"
              ? "That username is taken."
              : error.message,
        };
      }
      await refreshProfile();
      return { ok: true };
    },
    [session, refreshProfile]
  );

  /**
   * Profile pictures are a show poster you already follow, stored as the URL
   * TVmaze already serves. Nothing is uploaded and nothing is kept in our
   * storage, so this costs the same at ten users as at a million — which an
   * uploaded photo per account would not.
   */
  const setAvatar = useCallback(
    async (url: string | null): Promise<boolean> => {
      if (!session?.user.id) return false;
      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: url })
        .eq("id", session.user.id);
      if (error) return false;
      await refreshProfile();
      return true;
    },
    [session, refreshProfile]
  );

  const value = useMemo<AuthState>(
    () => ({
      ready,
      configured: supabaseConfigured,
      session,
      profile,
      signInWithApple,
      signOut,
      refreshProfile,
      setUsername,
      setAvatar,
    }),
    [
      ready,
      session,
      profile,
      signInWithApple,
      signOut,
      refreshProfile,
      setUsername,
      setAvatar,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
