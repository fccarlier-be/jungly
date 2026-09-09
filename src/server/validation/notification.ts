import { z } from "zod";

export const updateNotificationPreferenceSchema = z.object({
  enabled: z.boolean().optional(),
  notificationTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Format attendu : HH:MM")
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
