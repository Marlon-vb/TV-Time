import { NextRequest, NextResponse } from "next/server";
import * as repo from "@/lib/repo";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ shows: repo.listShowsWithProgress() });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    tvmazeId?: number;
  } | null;
  const id = Number(body?.tvmazeId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "tvmazeId required" }, { status: 400 });
  }
  try {
    const show = await repo.followShow(id);
    if (!show) {
      return NextResponse.json({ error: "Show not found" }, { status: 404 });
    }
    return NextResponse.json({ show }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: `Could not follow show: ${(err as Error).message}` },
      { status: 502 }
    );
  }
}
