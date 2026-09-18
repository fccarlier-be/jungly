import { z } from "zod";
import { registerSchema } from "@/server/validation/auth";

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email("Adresse email invalide."),
});

export const resetPasswordSchema = registerSchema.pick({ password: true }).extend({
  token: z.string().trim().min(10, "Lien invalide.").max(200),
});
