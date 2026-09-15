import { z } from "zod";

export const betaSignupSchema = z.object({
  email: z.string().trim().toLowerCase().email("Adresse email invalide."),
});
