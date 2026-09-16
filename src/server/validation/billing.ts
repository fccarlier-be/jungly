import { z } from "zod";
import { registerSchema } from "@/server/validation/auth";

export const verifyPurchaseSchema = registerSchema.pick({ email: true, password: true }).extend({
  purchaseToken: z.string().trim().min(10, "Jeton d'achat invalide.").max(4096),
  productId: z.string().trim().min(1).max(200),
  // Genere par l'app avant l'achat, transmis a Google via
  // setObfuscatedAccountId() -- permet de verifier que celui qui appelle
  // cette route est bien celui qui a initie CET achat precis, pas
  // seulement quelqu'un en possession du jeton (voir provisionHostedAccount).
  provisioningId: z.string().trim().min(1).max(64),
});
