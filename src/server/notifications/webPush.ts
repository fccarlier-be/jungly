import webpush from "web-push";
import { db } from "@/server/db";

let configured = false;

function ensureConfigured() {
  if (configured) return;
  const publicKey = process.env.PLANTES_VAPID_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.PLANTES_VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    throw new Error("Cles VAPID manquantes (PLANTES_VAPID_PUBLIC_KEY / PLANTES_VAPID_PRIVATE_KEY).");
  }
  webpush.setVapidDetails("mailto:contact@fcold.org", publicKey, privateKey);
  configured = true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

/**
 * Envoie une notification push à tous les appareils abonnés d'un
 * utilisateur. Supprime automatiquement les abonnements que le service de
 * push signale comme périmés (404/410 -- périphérique désabonné ou
 * désinstallé), pour ne pas s'y heurter indéfiniment.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<{ sent: number; pruned: number }> {
  ensureConfigured();

  const subscriptions = await db.pushSubscription.findMany({ where: { userId } });
  let sent = 0;
  let pruned = 0;

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload),
        );
        sent += 1;
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await db.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
          pruned += 1;
        } else {
          console.error(`Echec d'envoi push (subscription ${sub.id}):`, error);
        }
      }
    }),
  );

  return { sent, pruned };
}
