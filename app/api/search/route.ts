import { NextRequest, NextResponse } from "next/server";
import * as tvmaze from "@/lib/tvmaze";
import * as repo from "@/lib/repo";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json({ results: [] });
  try {
    const shows = await tvmaze.searchShows(q);
    const results = shows.map((s) => ({
      ...s,
      followed: repo.isFollowed(s.id),
    }));
    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json(
      { error: `Search failed: ${(err as Error).message}` },
      { status: 502 }
    );
  }
}
