import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";

/**
 * Supabase client for the social layer. The publishable (anon) key is safe to
 * ship in the app — every table is guarded by row-level security. Session
 * tokens persist in AsyncStorage so you stay signed in across launches.
 */

const extra = Constants.expoConfig?.extra as
  | { supabaseUrl?: string; supabaseKey?: string }
  | undefined;

export const SUPABASE_URL = extra?.supabaseUrl ?? "";
export const SUPABASE_KEY = extra?.supabaseKey ?? "";

export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);

export const supabase = createClient(
  SUPABASE_URL || "https://placeholder.supabase.co",
  SUPABASE_KEY || "placeholder",
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);
