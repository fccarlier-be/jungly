import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email("Adresse email invalide."),
  password: z.string().min(8, "8 caractères minimum.").max(200),
  name: z.string().trim().min(1).max(60).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
