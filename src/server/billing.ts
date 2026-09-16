import bcrypt from "bcryptjs";
import { Prisma } from "@generated/prisma/client";
import { db } from "@/server/db";
import { verifyAndAcknowledgePurchase } from "@/server/googlePlayBilling";
import { HOSTED_ACCESS_PRODUCT_ID } from "@/server/billingProducts";
import { ConflictError, BadRequestError, ServiceUnavailableError } from "@/lib/errors";

export interface ProvisionHostedAccountInput {
  purchaseToken: string;
  productId: string;
  email: string;
  password: string;
}

export interface ProvisionedAccount {
  id: string;
  email: string;
}

/**
 * Verifie un achat Google Play puis cree le compte associe sur l'offre
 * hebergee -- seul chemin de creation de compte qui contourne
 * REGISTRATION_MODE=invite_only (voir src/lib/registrationMode.ts).
 *
 * Le jeton et le compte sont crees dans une meme transaction : jamais un
 * jeton marque consomme sans compte cree, ni l'inverse.
 */
export async function provisionHostedAccount(input: ProvisionHostedAccountInput): Promise<ProvisionedAccount> {
  const { purchaseToken, productId, email, password } = input;

  if (productId !== HOSTED_ACCESS_PRODUCT_ID) {
    throw new BadRequestError("Produit inconnu.");
  }

  // Verifications rapides avant d'appeler Google (couteux, quota limite) --
  // un rejeu evident ou un email deja pris n'ont pas besoin d'un aller-retour
  // reseau pour etre rejetes.
  const existingToken = await db.consumedPurchase.findUnique({ where: { purchaseToken } });
  if (existingToken) {
    throw new ConflictError("Cet achat a déjà été utilisé.");
  }

  const existingUser = await db.user.findUnique({ where: { email } });
  if (existingUser) {
    throw new ConflictError("Un compte existe déjà avec cet email.");
  }

  const verification = await verifyAndAcknowledgePurchase(productId, purchaseToken);
  if (!verification.ok) {
    // "not_purchased" est une vraie erreur du client (jeton bidon/annule) ;
    // "not_configured"/"api_error" ne le sont pas (cle absente, panne cote
    // Google) -- distinguer evite de faire croire a l'app qu'il faut
    // recommencer l'achat alors que le probleme est chez nous.
    if (verification.reason === "not_purchased") {
      throw new ConflictError("Achat introuvable ou non valide.");
    }
    throw new ServiceUnavailableError("Vérification de l'achat momentanément indisponible, réessayez plus tard.");
  }

  const passwordHash = await bcrypt.hash(password, 10);
  try {
    return await db.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { email, passwordHash } });
      await tx.consumedPurchase.create({ data: { purchaseToken, productId, email } });
      return { id: user.id, email: user.email };
    });
  } catch (error) {
    // Course avec une autre requete simultanee sur le meme jeton/email --
    // deja verifie ci-dessus, mais pas atomique avec la transaction.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictError("Cet achat ou cet email a déjà été utilisé.");
    }
    throw error;
  }
}
