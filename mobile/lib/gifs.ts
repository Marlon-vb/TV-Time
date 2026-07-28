import { supabase } from "./supabase";

/**
 * GIF search.
 *
 * The app holds no provider key. It calls our own `gifs` Edge Function, which
 * keeps the key server-side and caches results in a shared table — so a
 * popular query costs one upstream call for the whole user base rather than
 * one per person, and nobody can extract a key from the binary and spend our
 * quota. See supabase/functions/gifs/index.ts.
 *
 * Which provider answered comes back with the results, because GIPHY and Tenor
 * both require their own attribution and showing the wrong one is worse than
 * showing none.
 */

export interface Gif {
  id: string;
  url: string; // animated GIF to send with the comment
  preview: string; // small animated GIF for the picker grid
}

export class GifSearchUnavailable extends Error {}

/** 'GIPHY' | 'Tenor' | null — null when we can't tell, so show no claim. */
export type GifSource = string | null;

export interface GifResults {
  gifs: Gif[];
  source: GifSource;
}

const LABELS: Record<string, string> = { giphy: "GIPHY", tenor: "Tenor" };

export async function searchGifs(query: string): Promise<GifResults> {
  const { data, error } = await supabase.functions.invoke<{
    gifs?: Gif[];
    source?: string;
    error?: string;
  }>("gifs", { body: { q: query.trim() } });

  // 503 is the function telling us no provider key was set, which is a
  // deployment gap rather than something the user did wrong.
  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status;
    if (status === 503) throw new GifSearchUnavailable("GIF search not set up");
    throw error;
  }
  if (data?.error) throw new Error(data.error);
  return {
    gifs: data?.gifs ?? [],
    source: data?.source ? (LABELS[data.source] ?? null) : null,
  };
}
