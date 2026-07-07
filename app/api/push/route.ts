import { NextResponse } from "next/server";
import { getVapidPublicKey, listSubscriptions } from "@/lib/push";

export const dynamic = "force-dynamic";

/** Public key for PushManager.subscribe() plus the list of enrolled devices. */
export async function GET() {
  return NextResponse.json({
    publicKey: getVapidPublicKey(),
    devices: listSubscriptions(),
  });
}
