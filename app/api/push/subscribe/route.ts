import { NextRequest, NextResponse } from "next/server";
import { addSubscription } from "@/lib/push";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    subscription?: {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
    };
    label?: string;
  } | null;
  const sub = body?.subscription;
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return NextResponse.json(
      { error: "A push subscription with endpoint and keys is required" },
      { status: 400 }
    );
  }
  addSubscription(
    {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    },
    body?.label?.slice(0, 120) ?? null
  );
  return NextResponse.json({ ok: true }, { status: 201 });
}
