import { z } from "zod";
import { registerSchema } from "@/server/validation/auth";

export const verifyPurchaseSchema = registerSchema.pick({ email: true, password: true }).extend({
  purchaseToken: z.string().trim().min(10, "Jeton d'achat invalide.").max(4096),
  productId: z.string().trim().min(1).max(200),
});
