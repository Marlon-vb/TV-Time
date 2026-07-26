import { getSetting } from "./db";

/**
 * GIF search via GIPHY. GIPHY publishes a public developer key that ships in
 * the app, so GIF search works with zero setup — no key for the user to
 * manage. Anyone can drop in their own free key (Settings) for higher rate
 * limits if the shared one ever throttles.
 */

const PUBLIC_KEY = "dc6zaTOxFJmzC"; // GIPHY's long-standing public dev key

function giphyKey(): string {
  return getSetting("giphy_api_key")?.trim() || PUBLIC_KEY;
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
