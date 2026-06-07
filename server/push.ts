import webpush from "web-push";
import { storage } from "./storage";

let configured = false;

export function pushEnabled(): boolean {
  return configured;
}

export function configurePush() {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@fortisfm.com.au";
  if (!pub || !priv) {
    console.log("[push] Push notifications disabled (no VAPID keys)");
    configured = false;
    return;
  }
  try {
    webpush.setVapidDetails(subject, pub, priv);
    configured = true;
    console.log("[push] Web Push configured");
  } catch (err) {
    console.warn("[push] Failed to configure Web Push:", (err as Error).message);
    configured = false;
  }
}

export function publicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

async function sendToSub(sub: { endpoint: string; p256dh: string; auth: string }, payload: object) {
  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      JSON.stringify(payload)
    );
  } catch (err: any) {
    // Drop dead subscriptions
    if (err?.statusCode === 404 || err?.statusCode === 410) {
      storage.removePushSubscription(sub.endpoint);
    } else {
      console.warn("[push] send failed:", err?.message);
    }
  }
}

export async function pushToUser(userId: number, payload: { title: string; body: string; url?: string }) {
  if (!configured) return;
  const subs = storage.listPushSubscriptionsForUser(userId);
  await Promise.all(subs.map((s) => sendToSub(s, payload)));
}

export async function pushToAll(payload: { title: string; body: string; url?: string }) {
  if (!configured) return;
  const subs = storage.listPushSubscriptions();
  await Promise.all(subs.map((s) => sendToSub(s, payload)));
}

// Push the admin user when staff submit an inspection.
export async function pushAdmins(payload: { title: string; body: string; url?: string }) {
  if (!configured) return;
  const admin = storage.getUserByEmail("admin@fortisfm.com.au");
  if (admin) await pushToUser(admin.id, payload);
}
