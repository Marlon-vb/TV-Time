import { NextRequest, NextResponse } from "next/server";
import * as repo from "@/lib/repo";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

interface WatchBody {
  action: "episode" | "season" | "show" | "up_to";
  watched?: boolean;
  episodeId?: number;
  season?: number;
}

/** One endpoint for all watch-state changes on a show. */
export async function POST(req: NextRequest, { params }: Params) {
  const showId = Number((await params).id);
  const body = (await req.json().catch(() => null)) as WatchBody | null;
  if (!body?.action) {
    return NextResponse.json({ error: "action required" }, { status: 400 });
  }
  if (!repo.getShowRow(showId)) {
    return NextResponse.json({ error: "Show not followed" }, { status: 404 });
  }

  const watched = body.watched ?? true;
  switch (body.action) {
    case "episode":
      if (!body.episodeId) {
        return NextResponse.json({ error: "episodeId required" }, { status: 400 });
      }
      repo.markEpisode(body.episodeId, watched);
      break;
    case "season":
      if (body.season == null) {
        return NextResponse.json({ error: "season required" }, { status: 400 });
      }
      repo.markSeason(showId, body.season, watched);
      break;
    case "show":
      repo.markShow(showId, watched);
      break;
    case "up_to":
      if (!body.episodeId) {
        return NextResponse.json({ error: "episodeId required" }, { status: 400 });
      }
      repo.markUpTo(showId, body.episodeId);
      break;
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  return NextResponse.json({ ok: true, episodes: repo.getEpisodes(showId) });
}
