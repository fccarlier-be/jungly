import bcrypt from "bcryptjs";
import { Prisma } from "@generated/prisma/client";
import { db } from "@/server/db";
import { verifyAndAcknowledgePurchase, isPurchaseStillValid } from "@/server/googlePlayBilling";
import { HOSTED_ACCESS_PRODUCT_ID } from "@/server/billingProducts";
import { ConflictError, BadRequestError, ServiceUnavailableError } from "@/lib/errors";

export interface ProvisionHostedAccountInput {
  purchaseToken: string;
  productId: string;
  provisioningId: string;
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
  const { purchaseToken, productId, provisioningId, email, password } = input;

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

  // Empeche qu'un jeton d'achat, a lui seul, ne suffise a revendiquer un
  // compte (voir androidsecu.md #3) : l'app transmet a Google le meme
  // identifiant qu'elle nous envoie ici (setObfuscatedAccountId), donc
  // seul l'appelant ayant reellement initie CET achat precis peut les
  // faire correspondre.
  if (verification.obfuscatedExternalAccountId !== provisioningId) {
    throw new ConflictError("Cet achat ne correspond pas à cette tentative d'inscription.");
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

export interface RevocationCheckResult {
  checked: number;
  revoked: number;
}

/**
 * Version allegee d'une revocation en temps reel (RTDN/Pub-Sub) : re-verifie
 * chaque achat encore actif aupres de Google, desactive le compte associe si
 * l'achat n'est plus dans l'etat "achete" (rembourse/annule). Suffisant tant
 * que le volume d'achats reste faible (voir androidsecu.md #2 et CHANGELOG) --
 * a remplacer par de vraies notifications temps reel si ca grossit.
 *
 * Jamais de suppression automatique du compte : seulement un blocage de
 * connexion (User.disabledAt), reversible a la main si un remboursement est
 * lui-meme conteste/annule.
 */
export async function revokeExpiredPurchases(): Promise<RevocationCheckResult> {
  const activePurchases = await db.consumedPurchase.findMany({ where: { revokedAt: null } });

  let revoked = 0;
  for (const purchase of activePurchases) {
    const stillValid = await isPurchaseStillValid(purchase.productId, purchase.purchaseToken);
    // null = cle absente ou API Google injoignable : on ne desactive jamais
    // sur une incertitude, seulement sur un "non" explicite de Google.
    if (stillValid !== false) {
      continue;
    }

    await db.$transaction([
      db.consumedPurchase.update({ where: { id: purchase.id }, data: { revokedAt: new Date() } }),
      db.user.updateMany({ where: { email: purchase.email }, data: { disabledAt: new Date() } }),
    ]);
    revoked++;
  }

  return { checked: activePurchases.length, revoked };
}
