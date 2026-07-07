import { NextRequest, NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/db";
import * as tmdb from "@/lib/tmdb";

export const dynamic = "force-dynamic";

export async function GET() {
  const key = getSetting("tmdb_api_key");
  return NextResponse.json({
    tmdbConfigured: Boolean(key),
    tmdbKeyPreview: key ? `${key.slice(0, 4)}…${key.slice(-4)}` : null,
    spoilerProtection: getSetting("spoiler_protection") !== "0",
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    tmdbApiKey?: string;
    spoilerProtection?: boolean;
  } | null;
  if (!body) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  if (typeof body.tmdbApiKey === "string") {
    const key = body.tmdbApiKey.trim();
    if (key === "") {
      setSetting("tmdb_api_key", "");
    } else {
      const ok = await tmdb.testKey(key);
      if (!ok) {
        return NextResponse.json(
          { error: "TMDB rejected that key — double-check it and try again." },
          { status: 400 }
        );
      }
      setSetting("tmdb_api_key", key);
    }
  }

  if (typeof body.spoilerProtection === "boolean") {
    setSetting("spoiler_protection", body.spoilerProtection ? "1" : "0");
  }

  return GET();
}
