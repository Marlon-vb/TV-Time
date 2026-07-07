import { NextResponse } from "next/server";
import { sendToAll } from "@/lib/push";

export const dynamic = "force-dynamic";

/** Send a test notification to every enrolled device. */
export async function POST() {
  const result = await sendToAll({
    title: "TV Time",
    body: "Test notification — you're all set. New episodes will show up like this.",
    url: "/upcoming",
    tag: "tvtime-test",
  });
  if (result.sent === 0) {
    return NextResponse.json(
      { error: "No devices are subscribed yet." },
      { status: 400 }
    );
  }
  return NextResponse.json(result);
}
