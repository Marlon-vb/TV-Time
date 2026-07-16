// Social push delivery: receives { user_id, title, body, url? } from the
// database triggers in ../../notifications.sql (via pg_net) and fans it out
// to the user's devices through Expo's push API.
//
// Deploy:  supabase functions deploy notify --no-verify-jwt
// Secret:  supabase secrets set NOTIFY_SECRET=<random string>
// (--no-verify-jwt because pg_net can't sign a JWT; the shared secret below
// is what gates the endpoint instead.)
//
// The service-role key used here is injected by Supabase into the function's
// environment and never leaves their servers — it is NOT the key embedded in
// the app, and nothing here exposes it.

import { createClient } from "npm:@supabase/supabase-js@2";

interface NotifyPayload {
  user_id?: string;
  title?: string;
  body?: string;
  url?: string | null;
}

interface ExpoPushTicket {
  status: "ok" | "error";
  details?: { error?: string };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }
  const secret = Deno.env.get("NOTIFY_SECRET");
  if (!secret || req.headers.get("x-notify-secret") !== secret) {
    return new Response("unauthorized", { status: 401 });
  }

  let payload: NotifyPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }
  if (!payload.user_id || !payload.title || !payload.body) {
    return new Response("missing fields", { status: 400 });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: rows, error } = await admin
    .from("push_tokens")
    .select("token")
    .eq("user_id", payload.user_id);
  if (error) return new Response("db error", { status: 500 });

  const tokens = (rows ?? [])
    .map((r) => r.token as string)
    .filter((t) => t.startsWith("ExponentPushToken"));
  if (tokens.length === 0) return Response.json({ sent: 0 });

  const messages = tokens.map((to) => ({
    to,
    sound: "default",
    title: payload.title,
    body: payload.body,
    data: payload.url ? { url: payload.url } : {},
  }));

  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(messages),
  });
  if (!res.ok) return new Response("expo error", { status: 502 });

  // Prune tokens Expo says are dead (app deleted, token rotated) so we stop
  // paying for sends that can never land.
  const tickets = (await res.json().catch(() => null)) as {
    data?: ExpoPushTicket[];
  } | null;
  const dead: string[] = [];
  tickets?.data?.forEach((ticket, i) => {
    if (
      ticket.status === "error" &&
      ticket.details?.error === "DeviceNotRegistered"
    ) {
      dead.push(tokens[i]);
    }
  });
  if (dead.length > 0) {
    await admin
      .from("push_tokens")
      .delete()
      .eq("user_id", payload.user_id)
      .in("token", dead);
  }

  return Response.json({ sent: tokens.length - dead.length });
});
