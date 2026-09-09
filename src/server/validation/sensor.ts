import { z } from "zod";

export const createSensorSchema = z.object({
  plantId: z.string().trim().min(1),
  type: z.enum(["SOIL_MOISTURE", "TEMPERATURE", "HUMIDITY", "LIGHT", "CONDUCTIVITY"]),
  name: z.string().trim().min(1).max(80),
  externalId: z.string().trim().max(120).optional(),
});

export const createReadingSchema = z.object({
  value: z.number(),
  unit: z.string().trim().min(1).max(20),
  recordedAt: z.coerce.date().optional(),
});

export type CreateSensorInput = z.infer<typeof createSensorSchema>;
export type CreateReadingInput = z.infer<typeof createReadingSchema>;
