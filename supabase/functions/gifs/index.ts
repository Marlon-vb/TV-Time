// GIF search proxy (Tenor).
//
// The app holds no Tenor key. It calls this function, which keeps the key as a
// server secret and caches every result in public.gif_cache. That matters for
// two reasons:
//
//   1. A key shipped inside an app binary can be extracted, and then somebody
//      else spends your quota.
//   2. GIF searches follow a power law — a lot of people search "lol", "wow",
//      "no way". Caching collapses thousands of users into one upstream call
//      per query per TTL window.
//
// Why Tenor rather than GIPHY: both are free and neither sells a self-serve
// paid tier, so the choice is about limits. GIPHY hands out a beta key capped
// around 42 requests an hour and makes you pass a human review to get past it.
// Tenor is a Google Cloud API — you enable it and you are done.
//
// Deploy:  supabase functions deploy gifs
// Secret:  supabase secrets set TENOR_KEY=<key from Google Cloud>
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

/** Our own shape, so a provider change never reaches the app. */
interface Gif {
  id: string;
  url: string; // animated GIF to send with the comment
  preview: string; // small animated GIF for the picker grid
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapTenor(g: any): Gif | null {
  const f = g?.media_formats;
  const url = f?.gif?.url ?? f?.mediumgif?.url ?? f?.tinygif?.url;
  const preview = f?.tinygif?.url ?? f?.nanogif?.url ?? url;
  if (!url || !preview) return null;
  return { id: String(g.id), url, preview };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function fromTenor(key: string, q: string): Promise<Gif[]> {
  const params = new URLSearchParams({
    key,
    limit: "24",
    // Tenor's own moderation tier. Their scale is off (G/PG/PG-13/R), low
    // (G/PG/PG-13), medium (G/PG), high (G only). "medium" keeps the library
    // useful for reactions while staying well clear of anything that would
    // trouble an App Store reviewer looking at user-generated content.
    contentfilter: "medium",
    media_filter: "gif,tinygif,nanogif",
  });
  if (q) params.set("q", q);
  const endpoint = q ? "search" : "featured";
  const res = await fetch(
    `https://tenor.googleapis.com/v2/${endpoint}?${params}`
  );
  if (!res.ok) throw new Error(`Tenor HTTP ${res.status}`);
  const body = (await res.json()) as { results?: unknown[] };
  return (body.results ?? []).map(mapTenor).filter((g): g is Gif => g !== null);
}

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

  const key = Deno.env.get("TENOR_KEY");
  if (!key) return json({ error: "GIF search is not configured" }, 503);

  let q = "";
  try {
    const body = (await req.json()) as { q?: string };
    q = normalize(body?.q ?? "");
  } catch {
    // An empty body means the featured feed, which is the common case.
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

  let gifs: Gif[];
  try {
    gifs = await fromTenor(key, q);
  } catch (err) {
    // Rate limited or upstream down: stale results beat an error screen, so
    // serve the old row if we have one.
    if (cached) return json({ gifs: cached.payload, cached: true, stale: true });
    return json({ error: String(err) }, 502);
  }

  // Never cache an empty result — a transient upstream hiccup would otherwise
  // pin "no GIFs found" in place for the whole TTL. An genuine no-match still
  // returns normally, it just gets asked again next time.
  if (gifs.length > 0) {
    await db
      .from("gif_cache")
      .upsert({ query: q, payload: gifs, fetched_at: new Date().toISOString() });
  }

  return json({ gifs, cached: false });
});
