import webpush from "web-push";
import { getDb, getSetting, setSetting } from "./db";

/**
 * Web Push delivery. VAPID keys are generated once on first use and stored
 * in the settings table, so notifications are zero-config: no accounts, no
 * external service — the server talks directly to each browser's push
 * endpoint. In mock mode (TV_API_MOCK=1) payloads are written to the
 * push_outbox table instead of the network, so the flow is testable offline.
 */

function mockMode(): boolean {
  return process.env.TV_API_MOCK === "1";
}

function ensureVapidKeys(): { publicKey: string; privateKey: string } {
  let publicKey = getSetting("vapid_public");
  let privateKey = getSetting("vapid_private");
  if (!publicKey || !privateKey) {
    const keys = webpush.generateVAPIDKeys();
    publicKey = keys.publicKey;
    privateKey = keys.privateKey;
    setSetting("vapid_public", publicKey);
    setSetting("vapid_private", privateKey);
  }
  return { publicKey, privateKey };
}

export function getVapidPublicKey(): string {
  return ensureVapidKeys().publicKey;
}

export interface DeviceSubscription {
  endpoint: string;
  label: string | null;
  created_at: string;
}

export function addSubscription(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  label: string | null
): void {
  getDb()
    .prepare(
      `INSERT INTO push_subscriptions (endpoint, keys, label, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET keys = excluded.keys, label = excluded.label`
    )
    .run(
      subscription.endpoint,
      JSON.stringify(subscription.keys),
      label,
      new Date().toISOString()
    );
}

export function removeSubscription(endpoint: string): void {
  getDb()
    .prepare("DELETE FROM push_subscriptions WHERE endpoint = ?")
    .run(endpoint);
}

export function listSubscriptions(): DeviceSubscription[] {
  return getDb()
    .prepare(
      "SELECT endpoint, label, created_at FROM push_subscriptions ORDER BY created_at"
    )
    .all() as DeviceSubscription[];
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

/**
 * Send a payload to every subscribed device. Subscriptions the push service
 * reports as gone (404/410 — browser reinstalled, permission revoked) are
 * pruned automatically.
 */
export async function sendToAll(
  payload: PushPayload
): Promise<{ sent: number; removed: number }> {
  const db = getDb();
  const rows = db
    .prepare("SELECT endpoint, keys FROM push_subscriptions")
    .all() as { endpoint: string; keys: string }[];
  if (rows.length === 0) return { sent: 0, removed: 0 };

  const body = JSON.stringify(payload);

  if (mockMode()) {
    const insert = db.prepare(
      "INSERT INTO push_outbox (endpoint, payload, created_at) VALUES (?, ?, ?)"
    );
    for (const row of rows) {
      insert.run(row.endpoint, body, new Date().toISOString());
    }
    return { sent: rows.length, removed: 0 };
  }

  const { publicKey, privateKey } = ensureVapidKeys();
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:tvtime@example.com",
    publicKey,
    privateKey
  );

  let sent = 0;
  let removed = 0;
  for (const row of rows) {
    try {
      await webpush.sendNotification(
        { endpoint: row.endpoint, keys: JSON.parse(row.keys) },
        body,
        { TTL: 12 * 3600 }
      );
      sent++;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        removeSubscription(row.endpoint);
        removed++;
      }
      // Other failures (network blip, push service hiccup) are dropped;
      // the next episode's notification will try again.
    }
  }
  return { sent, removed };
}
