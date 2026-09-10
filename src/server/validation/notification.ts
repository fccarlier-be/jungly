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

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
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
