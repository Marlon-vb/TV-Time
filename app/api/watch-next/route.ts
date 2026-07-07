import { NextResponse } from "next/server";
import * as repo from "@/lib/repo";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ items: repo.watchNext() });
}
