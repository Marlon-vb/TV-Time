import { NextResponse } from "next/server";
import * as repo from "@/lib/repo";

export const dynamic = "force-dynamic";

/** Refresh stale shows from the provider (called from Settings). */
export async function POST() {
  try {
    const result = await repo.syncStaleShows(0); // force: everything is "stale"
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: `Sync failed: ${(err as Error).message}` },
      { status: 502 }
    );
  }
}
