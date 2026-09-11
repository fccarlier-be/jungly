import { z } from "zod";

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(1, "Le nom ne peut pas être vide.").max(60).optional(),
    unitSystem: z.enum(["METRIC", "IMPERIAL"]).optional(),
  })
  .refine((data) => data.name !== undefined || data.unitSystem !== undefined, {
    message: "Aucune modification fournie.",
  });

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
