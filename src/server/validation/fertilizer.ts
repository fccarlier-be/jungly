import { z } from "zod";

export const createFertilizerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  manufacturer: z.string().trim().max(120).optional(),
  type: z.string().trim().max(80).optional(),
  nitrogen: z.coerce.number().nonnegative().optional(),
  phosphorus: z.coerce.number().nonnegative().optional(),
  potassium: z.coerce.number().nonnegative().optional(),
  defaultDosage: z.coerce.number().positive().optional(),
  dosageUnit: z.enum(["ml", "g"]).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export type CreateFertilizerInput = z.infer<typeof createFertilizerSchema>;
