// GIF search proxy.
//
// The app does not hold a GIPHY key. It calls this function, which holds the
// key as a server secret and caches every result in public.gif_cache. That
// matters for two reasons:
//
//   1. A key shipped inside an app binary can be extracted, and then somebody
//      else spends your quota.
//   2. GIF searches follow a power law — a lot of people search "lol", "wow",
//      "no way". Caching collapses thousands of users into one upstream call
//      per query per TTL window, which is the difference between needing a
//      production key and not.
//
// Swapping GIPHY for another provider later is a change here, not an app
// release, because the response shape is ours.
//
// Deploy:  supabase functions deploy gifs
// Secret:  supabase secrets set GIPHY_KEY=<your key from developers.giphy.com>
// Table:   run ../../gifs.sql once
//
// JWT verification is left ON (the default), so only signed-in users can call
// it — this is not an open proxy. The service-role key used for the cache is
// injected by Supabase and never leaves their servers.

import { createClient } from "npm:@supabase/supabase-js@2";

/** Kept short: caching third-party content for long is a licensing question,
 *  and even an hour removes almost all of the fan-out. */
const TRENDING_TTL_MS = 60 * 60 * 1000; // 1 hour
const SEARCH_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

interface Gif {
  id: string;
  url: string;
  preview: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapGif(g: any): Gif | null {
  const img = g?.images;
  const url =
    img?.downsized?.url ?? img?.fixed_height?.url ?? img?.original?.url;
  const preview = img?.fixed_width_small?.url ?? img?.preview_gif?.url ?? url;
  if (!url || !preview) return null;
  return { id: String(g.id), url, preview };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Same text should hit the same cache row regardless of spacing or case. */
function normalize(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 100);
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }

  const key = Deno.env.get("GIPHY_KEY");
  if (!key) return json({ error: "GIF search is not configured" }, 503);

  let q = "";
  try {
    const body = (await req.json()) as { q?: string };
    q = normalize(body?.q ?? "");
  } catch {
    // An empty body means trending, which is the common case.
  }

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const ttl = q ? SEARCH_TTL_MS : TRENDING_TTL_MS;
  const { data: cached } = await db
    .from("gif_cache")
    .select("payload, fetched_at")
    .eq("query", q)
    .maybeSingle();

  if (cached && Date.now() - Date.parse(cached.fetched_at) < ttl) {
    return json({ gifs: cached.payload, cached: true });
  }

  const url = q
    ? `https://api.giphy.com/v1/gifs/search?api_key=${key}&q=${encodeURIComponent(
        q
      )}&limit=24&rating=pg-13&bundle=messaging_non_clips`
    : `https://api.giphy.com/v1/gifs/trending?api_key=${key}&limit=24&rating=pg-13`;

  let gifs: Gif[];
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`GIPHY HTTP ${res.status}`);
    const body = (await res.json()) as { data?: unknown[] };
    gifs = (body.data ?? [])
      .map(mapGif)
      .filter((g): g is Gif => g !== null);
  } catch (err) {
    // Rate limited or upstream down: stale results beat an error screen, so
    // serve the old row if we have one.
    if (cached) return json({ gifs: cached.payload, cached: true, stale: true });
    return json({ error: String(err) }, 502);
  }

  // Never cache an empty result — a transient upstream hiccup would otherwise
  // pin "no GIFs found" in place for the whole TTL.
  if (gifs.length > 0) {
    await db
      .from("gif_cache")
      .upsert({ query: q, payload: gifs, fetched_at: new Date().toISOString() });
  }

  return json({ gifs, cached: false });
});
