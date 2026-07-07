import { NextResponse } from "next/server";
import { checkAndNotify } from "@/lib/notifier";

export const dynamic = "force-dynamic";

/** Run the new-episode check immediately (the scheduler does this every 5 min). */
export async function POST() {
  return NextResponse.json(await checkAndNotify());
}
