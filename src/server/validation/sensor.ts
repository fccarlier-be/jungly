import { z } from "zod";

export const createSensorSchema = z.object({
  plantId: z.string().trim().min(1),
  type: z.enum(["SOIL_MOISTURE", "TEMPERATURE", "HUMIDITY", "LIGHT", "CONDUCTIVITY"]),
  name: z.string().trim().min(1).max(80),
  externalId: z.string().trim().max(120).optional(),
});

const MAX_READING_AGE_MS = 48 * 60 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

// value/unit optionnels : un appareil qui detecte qu'il est en charge (voir
// firmware/) n'envoie que la telemetrie (batteryPercent/charging), sans
// lecture d'humidite -- prendre une mesure hors sol pendant la charge serait
// trompeur pour le moteur d'entretien. Les deux refine() ci-dessous
// garantissent value/unit fournis ensemble (jamais l'un sans l'autre), et
// qu'au moins une information exploitable est presente dans la requete.
export const createReadingSchema = z
  .object({
    value: z.number().optional(),
    unit: z.string().trim().min(1).max(20).optional(),
    recordedAt: z.coerce
      .date()
      .refine((date) => date.getTime() <= Date.now() + MAX_CLOCK_SKEW_MS, {
        message: "recordedAt ne peut pas être dans le futur.",
      })
      .refine((date) => date.getTime() >= Date.now() - MAX_READING_AGE_MS, {
        message: "recordedAt est trop ancien (48h maximum) -- possible tentative de backdating.",
      })
      .optional(),
    batteryPercent: z.number().int().min(0).max(100).optional(),
    charging: z.boolean().optional(),
  })
  .refine((data) => (data.value === undefined) === (data.unit === undefined), {
    message: "value et unit doivent être fournis ensemble.",
  })
  .refine((data) => data.value !== undefined || data.batteryPercent !== undefined || data.charging !== undefined, {
    message: "Au moins une mesure (value/unit) ou une info de télémétrie (batteryPercent/charging) est requise.",
  });

export type CreateSensorInput = z.infer<typeof createSensorSchema>;
export type CreateReadingInput = z.infer<typeof createReadingSchema>;
