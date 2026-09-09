import { z } from "zod";

const recurrenceTypeSchema = z.enum([
  "FIXED_INTERVAL_DAYS",
  "INTERVAL_WEEKS",
  "INTERVAL_MONTHS",
  "EXACT_DATE",
  "YEARLY",
  "MANUAL",
  "MOISTURE_THRESHOLD",
]);

const seasonalConfigSchema = z.object({
  activeFromMonth: z.number().int().min(1).max(12).optional(),
  activeUntilMonth: z.number().int().min(1).max(12).optional(),
});

const wateringConfigSchema = seasonalConfigSchema.extend({
  waterAmount: z.number().positive().optional(),
  waterUnit: z.enum(["ml", "L"]).optional(),
  moistureThresholdPercent: z.number().min(0).max(100).optional(),
});

const fertilizingConfigSchema = seasonalConfigSchema.extend({
  fertilizerId: z.string().min(1).optional(),
  dosagePerLiter: z.number().positive().optional(),
  dosageUnit: z.enum(["ml", "g"]).optional(),
  dilutionVolumeLiters: z.number().positive().optional(),
});

const repottingConfigSchema = seasonalConfigSchema.extend({
  exactDate: z.coerce.date().optional(),
});

const baseCareRuleSchema = z.object({
  plantId: z.string().min(1),
  enabled: z.boolean().default(true),
  recurrenceType: recurrenceTypeSchema,
  interval: z.number().int().positive().optional(),
});

export const createWateringRuleSchema = baseCareRuleSchema.extend({
  type: z.literal("WATERING"),
  configuration: wateringConfigSchema.optional(),
});

export const createFertilizingRuleSchema = baseCareRuleSchema.extend({
  type: z.literal("FERTILIZING"),
  configuration: fertilizingConfigSchema.optional(),
});

export const createRepottingRuleSchema = baseCareRuleSchema.extend({
  type: z.literal("REPOTTING"),
  configuration: repottingConfigSchema.optional(),
});

export const createCareRuleSchema = z.discriminatedUnion("type", [
  createWateringRuleSchema,
  createFertilizingRuleSchema,
  createRepottingRuleSchema,
]);

export const updateCareRuleSchema = z.object({
  enabled: z.boolean().optional(),
  recurrenceType: recurrenceTypeSchema.optional(),
  interval: z.number().int().positive().optional(),
  configuration: z.record(z.string(), z.unknown()).optional(),
});

export type CreateCareRuleInput = z.infer<typeof createCareRuleSchema>;
export type UpdateCareRuleInput = z.infer<typeof updateCareRuleSchema>;
