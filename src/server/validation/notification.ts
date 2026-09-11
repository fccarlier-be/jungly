import { z } from "zod";

export const updateNotificationPreferenceSchema = z.object({
  enabled: z.boolean().optional(),
  // Restreint aux quarts d'heure : le scheduler ne verifie qu'a ces
  // instants precis (voir scheduler.ts), une valeur intermediaire attendrait
  // donc jusqu'au quart d'heure suivant sans jamais le signaler.
  notificationTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):(00|15|30|45)$/, "Choisis une heure ronde, ou se terminant par 15, 30 ou 45.")
    .optional(),
  overdueEnabled: z.boolean().optional(),
  advanceReminderDays: z.number().int().min(0).max(30).optional(),
});

// Domaines des services de push web reellement utilises par les navigateurs
// courants (audit13.md, SSRF Web Push) : sendPushToUser() (voir
// src/server/notifications/webPush.ts) fait une VRAIE requete HTTP vers
// `endpoint` a chaque notification -- sans cette liste, un utilisateur
// authentifie pouvait enregistrer n'importe quelle URL (ex. une adresse du
// reseau interne) et forcer le serveur a la contacter regulierement (SSRF
// aveugle, la reponse n'est jamais lue/traitee mais la connexion a bien
// lieu). Liste blanche par hote plutot que la resolution DNS utilisee pour
// les images : l'ensemble des services de push reels est petit et stable,
// contrairement aux innombrables hebergeurs d'images possibles.
const ALLOWED_PUSH_ENDPOINT_HOSTS = new Set([
  "fcm.googleapis.com", // Chrome, Edge, navigateurs Chromium, Android (dont le TWA)
  "updates.push.services.mozilla.com", // Firefox
  "web.push.apple.com", // Safari (macOS/iOS)
]);

function isAllowedPushEndpoint(endpoint: string): boolean {
  try {
    return ALLOWED_PUSH_ENDPOINT_HOSTS.has(new URL(endpoint).hostname);
  } catch {
    return false;
  }
}

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().refine(isAllowedPushEndpoint, "Service de notification non reconnu."),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export const unsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

export type UpdateNotificationPreferenceInput = z.infer<typeof updateNotificationPreferenceSchema>;
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;
