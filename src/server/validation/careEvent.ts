import { z } from "zod";
import { HEALTH_LEVELS } from "@/lib/plantHealth";
import { SYMPTOM_CATEGORIES } from "@/server/diagnosis/types";

// Releve de sante optionnel, porte par une INSPECTION (voir CareEvent.healthLevel).
export const healthCheckFields = {
  healthLevel: z.enum(HEALTH_LEVELS).optional(),
  symptoms: z.array(z.enum(SYMPTOM_CATEGORIES)).max(SYMPTOM_CATEGORIES.length).optional(),
};

export const waterEventSchema = z.object({
  performedAt: z.coerce.date().optional(),
  quantity: z.coerce.number().nonnegative().optional(),
  unit: z.enum(["ml", "L"]).optional(),
  method: z.string().trim().max(80).optional(),
  note: z.string().trim().max(1000).optional(),
  careRuleId: z.string().trim().min(1).optional(),
});

export const fertilizeEventSchema = z.object({
  performedAt: z.coerce.date().optional(),
  fertilizerId: z.string().trim().min(1).optional(),
  dosagePerLiter: z.coerce.number().positive().optional(),
  volumeLiters: z.coerce.number().positive().optional(),
  quantity: z.coerce.number().nonnegative().optional(),
  unit: z.enum(["ml", "g"]).optional(),
  method: z.string().trim().max(80).optional(),
  note: z.string().trim().max(1000).optional(),
  careRuleId: z.string().trim().min(1).optional(),
});

export const repotEventSchema = z.object({
  performedAt: z.coerce.date().optional(),
  oldPotDiameterMm: z.coerce.number().int().positive().optional(),
  newPotShape: z.enum(["ROUND", "RECTANGULAR"]).optional(),
  newPotDiameterMm: z.coerce.number().int().positive().nullable().optional(),
  newPotLengthMm: z.coerce.number().int().positive().nullable().optional(),
  newPotWidthMm: z.coerce.number().int().positive().nullable().optional(),
  newPotHeightMm: z.coerce.number().int().positive().optional(),
  substrate: z.string().trim().max(200).optional(),
  note: z.string().trim().max(1000).optional(),
  careRuleId: z.string().trim().min(1).optional(),
});

export const genericEventSchema = z
  .object({
    type: z.enum(["PRUNING", "INSPECTION", "OTHER"]),
    performedAt: z.coerce.date().optional(),
    note: z.string().trim().max(1000).optional(),
    ...healthCheckFields,
  })
  .refine((input) => input.type === "INSPECTION" || (input.healthLevel === undefined && input.symptoms === undefined), {
    message: "Un état de santé ne peut être noté que lors d'une inspection.",
    path: ["healthLevel"],
  });

export type GenericEventInput = z.infer<typeof genericEventSchema>;
export type WaterEventInput = z.infer<typeof waterEventSchema>;
export type FertilizeEventInput = z.infer<typeof fertilizeEventSchema>;
export type RepotEventInput = z.infer<typeof repotEventSchema>;
