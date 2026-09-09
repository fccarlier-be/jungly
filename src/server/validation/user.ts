import { z } from "zod";

export const updateUserSchema = z.object({
  name: z.string().trim().min(1, "Le nom ne peut pas être vide.").max(60),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
