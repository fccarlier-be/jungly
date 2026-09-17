import { z } from "zod";

export const createContainerSchema = z.object({
  name: z.string().trim().min(1, "Le nom est requis").max(80),
  potShape: z.enum(["ROUND", "RECTANGULAR"]).optional(),
  potDiameterMm: z.coerce.number().int().positive().nullable().optional(),
  potLengthMm: z.coerce.number().int().positive().nullable().optional(),
  potWidthMm: z.coerce.number().int().positive().nullable().optional(),
  potHeightMm: z.coerce.number().int().positive().optional(),
  potMaterial: z.string().trim().max(80).optional(),
});

export const updateContainerSchema = createContainerSchema.partial();

export type CreateContainerInput = z.infer<typeof createContainerSchema>;
export type UpdateContainerInput = z.infer<typeof updateContainerSchema>;
