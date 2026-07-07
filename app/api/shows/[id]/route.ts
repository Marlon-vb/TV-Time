import { NextRequest, NextResponse } from "next/server";
import * as repo from "@/lib/repo";
import * as tvmaze from "@/lib/tvmaze";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }

  const stored = repo.getShowRow(id);
  if (stored) {
    // Refresh stale running shows in the background on page view.
    const ageHours = stored.last_synced_at
      ? (Date.now() - Date.parse(stored.last_synced_at)) / 3_600_000
      : Infinity;
    if (ageHours > 24 && stored.status !== "Ended") {
      void repo.syncShow(id).catch(() => {});
    }
    return NextResponse.json({
      followed: true,
      show: stored,
      episodes: repo.getEpisodes(id),
    });
  }

  // Not followed: serve a live preview from the provider.
  try {
    const remote = await tvmaze.getShowWithEpisodes(id);
    if (!remote) {
      return NextResponse.json({ error: "Show not found" }, { status: 404 });
    }
    return NextResponse.json({
      followed: false,
      show: {
        id: remote.show.id,
        name: remote.show.name,
        tvdb_id: remote.show.tvdbId,
        imdb_id: remote.show.imdbId,
        tmdb_id: null,
        poster_url: remote.show.posterUrl,
        backdrop_url: remote.show.backdropUrl,
        status: remote.show.status,
        network: remote.show.network,
        runtime: remote.show.runtime,
        premiered: remote.show.premiered,
        genres: JSON.stringify(remote.show.genres),
        summary: remote.show.summary,
        followed_at: "",
        archived: 0,
        last_synced_at: null,
      },
      episodes: remote.episodes.map((e) => ({
        id: e.id,
        show_id: remote.show.id,
        season: e.season,
        number: e.number,
        name: e.name,
        airdate: e.airdate,
        airstamp: e.airstamp ? new Date(e.airstamp).toISOString() : null,
        runtime: e.runtime,
        summary: e.summary,
        image_url: e.imageUrl,
        watched_at: null,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Could not load show: ${(err as Error).message}` },
      { status: 502 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const id = Number((await params).id);
  repo.unfollowShow(id);
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const id = Number((await params).id);
  const body = (await req.json().catch(() => null)) as {
    archived?: boolean;
  } | null;
  if (typeof body?.archived !== "boolean") {
    return NextResponse.json({ error: "archived required" }, { status: 400 });
  }
  repo.setArchived(id, body.archived);
  return NextResponse.json({ ok: true });
}
