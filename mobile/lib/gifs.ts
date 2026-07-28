import { supabase } from "./supabase";

/**
 * GIF search, backed by Tenor.
 *
 * The app holds no Tenor key. It calls our own `gifs` Edge Function, which
 * keeps the key server-side and caches results in a shared table — so a
 * popular query costs one upstream call for the whole user base rather than
 * one per person, and nobody can extract a key from the binary and spend our
 * quota. See supabase/functions/gifs/index.ts.
 *
 * Tenor rather than GIPHY because both are free and neither sells a self-serve
 * paid tier, so the deciding factor is limits: GIPHY's default key is capped
 * near 42 requests an hour until a human review, Tenor's is not.
 */

export interface Gif {
  id: string;
  url: string; // animated GIF to send with the comment
  preview: string; // small animated GIF for the picker grid
}

export class GifSearchUnavailable extends Error {}

export async function searchGifs(query: string): Promise<Gif[]> {
  const { data, error } = await supabase.functions.invoke<{
    gifs?: Gif[];
    error?: string;
  }>("gifs", { body: { q: query.trim() } });

  // 503 is the function telling us TENOR_KEY was never set, which is a
  // deployment gap rather than something the user did wrong.
  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status;
    if (status === 503) throw new GifSearchUnavailable("GIF search not set up");
    throw error;
  }
  if (data?.error) throw new Error(data.error);
  return data?.gifs ?? [];
}
