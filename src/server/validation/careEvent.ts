import { z } from "zod";

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
  newPotDiameterMm: z.coerce.number().int().positive().optional(),
  newPotHeightMm: z.coerce.number().int().positive().optional(),
  substrate: z.string().trim().max(200).optional(),
  note: z.string().trim().max(1000).optional(),
  careRuleId: z.string().trim().min(1).optional(),
});

export const genericEventSchema = z.object({
  type: z.enum(["PRUNING", "INSPECTION", "OTHER"]),
  performedAt: z.coerce.date().optional(),
  note: z.string().trim().max(1000).optional(),
});

export type GenericEventInput = z.infer<typeof genericEventSchema>;
export type WaterEventInput = z.infer<typeof waterEventSchema>;
export type FertilizeEventInput = z.infer<typeof fertilizeEventSchema>;
export type RepotEventInput = z.infer<typeof repotEventSchema>;
