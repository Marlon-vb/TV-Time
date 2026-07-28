// GIF search proxy.
//
// The app holds no provider key. It calls this function, which keeps it as a
// server secret and caches every result in public.gif_cache. That matters for
// two reasons:
//
//   1. A key shipped inside an app binary can be extracted, and then somebody
//      else spends your quota.
//   2. GIF searches follow a power law — a lot of people search "lol", "wow",
//      "no way". Caching collapses thousands of users into one upstream call
//      per query per TTL window.
//
// PROVIDERS. Set either key, or both. GIPHY is the one you can actually get in
// two minutes at developers.giphy.com. Tenor is nominally the better free tier
// — no ~42/hour beta cap — but it is not offered in every Google Cloud project,
// so treat it as an upgrade to switch on if it ever appears rather than a
// prerequisite. When both are set Tenor goes first and GIPHY covers its
// failures, so one provider having a bad day is not an outage.
//
// Whichever answers is reported back as `source` so the picker can show that
// provider's attribution — both require it, and showing the wrong one is worse
// than showing none.
//
// Deploy:  supabase functions deploy gifs
// Secrets: supabase secrets set GIPHY_KEY=<key from developers.giphy.com>
//          supabase secrets set TENOR_KEY=<key>   # optional, preferred if set
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
function mapGiphy(g: any): Gif | null {
  const img = g?.images;
  const url =
    img?.downsized?.url ?? img?.fixed_height?.url ?? img?.original?.url;
  const preview = img?.fixed_width_small?.url ?? img?.preview_gif?.url ?? url;
  if (!url || !preview) return null;
  return { id: String(g.id), url, preview };
}

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

async function fromGiphy(key: string, q: string): Promise<Gif[]> {
  const url = q
    ? `https://api.giphy.com/v1/gifs/search?api_key=${key}&q=${encodeURIComponent(
        q
      )}&limit=24&rating=pg-13&bundle=messaging_non_clips`
    : `https://api.giphy.com/v1/gifs/trending?api_key=${key}&limit=24&rating=pg-13`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GIPHY HTTP ${res.status}`);
  const body = (await res.json()) as { data?: unknown[] };
  return (body.data ?? []).map(mapGiphy).filter((g): g is Gif => g !== null);
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

  // DO NOT set TENOR_KEY without updating the published legal pages first.
  // site/privacy, site/terms and site/support all name GIPHY specifically —
  // who hosts the GIF, whose terms apply, where to report one. Setting this
  // secret silently makes Tenor the provider and every one of those pages
  // false, which is a filing problem, not a config change.
  const tenorKey = Deno.env.get("TENOR_KEY");
  const giphyKey = Deno.env.get("GIPHY_KEY");
  if (!tenorKey && !giphyKey) {
    return json({ error: "GIF search is not configured" }, 503);
  }

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
    .select("payload, source, fetched_at")
    .eq("query", q)
    .maybeSingle();

  if (cached && Date.now() - Date.parse(cached.fetched_at) < ttl) {
    return json({ gifs: cached.payload, source: cached.source, cached: true });
  }

  // Tenor first when configured; GIPHY covers both "no Tenor key" and "Tenor
  // just failed".
  const providers: { name: string; run: () => Promise<Gif[]> }[] = [];
  if (tenorKey) providers.push({ name: "tenor", run: () => fromTenor(tenorKey, q) });
  if (giphyKey) providers.push({ name: "giphy", run: () => fromGiphy(giphyKey, q) });

  let gifs: Gif[] | null = null;
  let source = "";
  const failures: string[] = [];
  for (const provider of providers) {
    try {
      gifs = await provider.run();
      source = provider.name;
      break;
    } catch (err) {
      failures.push(`${provider.name}: ${err}`);
    }
  }

  if (gifs === null) {
    // Every provider errored. Stale results beat an error screen, so serve the
    // old row if we have one.
    if (cached) {
      return json({
        gifs: cached.payload,
        source: cached.source,
        cached: true,
        stale: true,
      });
    }
    return json({ error: failures.join("; ") }, 502);
  }

  // Never cache an empty result — a transient upstream hiccup would otherwise
  // pin "no GIFs found" in place for the whole TTL. A genuine no-match still
  // returns normally, it just gets asked again next time.
  if (gifs.length > 0) {
    await db.from("gif_cache").upsert({
      query: q,
      payload: gifs,
      source,
      fetched_at: new Date().toISOString(),
    });
  }

  return json({ gifs, source, cached: false });
});
