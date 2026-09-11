import { z } from "zod";

export const createSensorSchema = z.object({
  plantId: z.string().trim().min(1),
  type: z.enum(["SOIL_MOISTURE", "TEMPERATURE", "HUMIDITY", "LIGHT", "CONDUCTIVITY"]),
  name: z.string().trim().min(1).max(80),
  externalId: z.string().trim().max(120).optional(),
});

const MAX_READING_AGE_MS = 48 * 60 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

export const createReadingSchema = z.object({
  // .finite() : un nombre trop grand pour IEEE754 (ex. 1e400) devient
  // Infinity/-Infinity au parsing JSON sans erreur -- une seule lecture avec
  // cette valeur ferait declencher a tort chaque regle MOISTURE_THRESHOLD de
  // la plante (readingValue <= threshold toujours vrai avec -Infinity).
  value: z.number().finite(),
  unit: z.string().trim().min(1).max(20),
  recordedAt: z.coerce
    .date()
    .refine((date) => date.getTime() <= Date.now() + MAX_CLOCK_SKEW_MS, {
      message: "recordedAt ne peut pas être dans le futur.",
    })
    .refine((date) => date.getTime() >= Date.now() - MAX_READING_AGE_MS, {
      message: "recordedAt est trop ancien (48h maximum) -- possible tentative de backdating.",
    })
    .optional(),
});

export type CreateSensorInput = z.infer<typeof createSensorSchema>;
export type CreateReadingInput = z.infer<typeof createReadingSchema>;
