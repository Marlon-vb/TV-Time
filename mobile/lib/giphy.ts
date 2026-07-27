import Constants from "expo-constants";
import { getSetting } from "./db";

/**
 * GIF search via GIPHY.
 *
 * GIPHY keys are client-side by design — they identify the app, not a user —
 * so the app ships one and nobody has to configure anything. Set it in
 * app.json under extra.giphyKey; the Settings field only exists as an override
 * for anyone who wants their own rate limit.
 *
 * GIPHY's old public beta key ("dc6zaTOxFJmzC") used to make this work with no
 * registration at all, but it was retired and now returns 401/403, which is
 * why search silently failed. There is no keyless GIF API left worth shipping:
 * Tenor's equivalent public key went the same way when v1 was shut down.
 */

function shippedKey(): string {
  const extra = Constants.expoConfig?.extra as
    | { giphyKey?: string }
    | undefined;
  return (extra?.giphyKey ?? "").trim();
}

/** The user's own key wins, then the one shipped with the app. */
function giphyKey(): string {
  return getSetting("giphy_api_key")?.trim() || shippedKey();
}

/** Whether GIF search can work at all — drives the picker's empty state. */
export function gifSearchConfigured(): boolean {
  return giphyKey().length > 0;
}

export interface Gif {
  id: string;
  url: string; // animated GIF to send with the comment
  preview: string; // small animated GIF for the picker grid
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapGif(g: any): Gif | null {
  const img = g?.images;
  const url =
    img?.downsized?.url ?? img?.fixed_height?.url ?? img?.original?.url;
  const preview =
    img?.fixed_width_small?.url ?? img?.preview_gif?.url ?? url;
  if (!url || !preview) return null;
  return { id: String(g.id), url, preview };
}

export async function searchGifs(query: string): Promise<Gif[]> {
  const key = giphyKey();
  if (!key) throw new Error("No GIPHY key configured");
  const q = query.trim();
  const url = q
    ? `https://api.giphy.com/v1/gifs/search?api_key=${key}&q=${encodeURIComponent(
        q
      )}&limit=24&rating=pg-13&bundle=messaging_non_clips`
    : `https://api.giphy.com/v1/gifs/trending?api_key=${key}&limit=24&rating=pg-13`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GIPHY HTTP ${res.status}`);
  const json = (await res.json()) as { data?: any[] };
  return (json.data ?? []).map(mapGif).filter((g): g is Gif => g !== null);
}
/* eslint-enable @typescript-eslint/no-explicit-any */
