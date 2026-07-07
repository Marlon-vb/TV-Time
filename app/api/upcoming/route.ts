import { NextRequest, NextResponse } from "next/server";
import * as repo from "@/lib/repo";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const days = Number(req.nextUrl.searchParams.get("days")) || 90;
  return NextResponse.json({ items: repo.upcoming(Math.min(days, 365)) });
}
