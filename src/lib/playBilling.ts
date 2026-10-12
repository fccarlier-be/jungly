"use client";

// Methode de paiement standardisee pour Google Play Billing via l'API web
// PaymentRequest -- ne fonctionne que dans la TWA Android installee depuis
// le Play Store (le navigateur y expose le canal vers Play Billing) ;
// jamais dans un navigateur classique (desktop, iOS, Chrome hors TWA), ou
// canMakePayment() renvoie false. Aucun pont natif necessaire : voir la
// discussion produit du 2026-10-12 (palier gratuit / deblocage illimite).
const PLAY_BILLING_METHOD = "https://play.google.com/billing";

export type PurchaseOutcome =
  | { status: "success"; purchaseToken: string }
  // API indisponible (hors TWA Android) ou Play Billing ne peut pas traiter
  // ce produit sur cet appareil -- jamais traite comme une erreur, l'appelant
  // doit alors expliquer que l'achat ne marche que depuis l'app Android.
  | { status: "unavailable" }
  | { status: "cancelled" }
  | { status: "error"; message: string };

function buildRequest(productId: string): PaymentRequest {
  const methods: PaymentMethodData[] = [{ supportedMethods: PLAY_BILLING_METHOD, data: { sku: productId } }];
  // Le montant affiche ici est purement cosmetique et requis par la forme de
  // l'API : Play Billing ignore ce champ et applique le PRIX REEL configure
  // dans Play Console pour ce produit -- ne jamais s'y fier pour afficher un
  // prix a l'utilisateur ailleurs dans l'app.
  const details: PaymentDetailsInit = { total: { label: "Jungly illimité", amount: { currency: "EUR", value: "9.99" } } };
  return new PaymentRequest(methods, details);
}

export async function isPlayBillingAvailable(productId: string): Promise<boolean> {
  if (typeof window === "undefined" || typeof window.PaymentRequest === "undefined") return false;
  try {
    return await buildRequest(productId).canMakePayment();
  } catch {
    return false;
  }
}

/** Declenche l'achat Google Play du produit "offre illimitee" -- le jeton renvoye doit ensuite etre verifie cote serveur (POST /api/billing/upgrade). */
export async function purchaseHostedUnlimited(productId: string): Promise<PurchaseOutcome> {
  if (typeof window === "undefined" || typeof window.PaymentRequest === "undefined") {
    return { status: "unavailable" };
  }

  try {
    const request = buildRequest(productId);
    const canPay = await request.canMakePayment();
    if (!canPay) return { status: "unavailable" };

    const response = await request.show();
    const details = response.details as { purchaseToken?: string } | null;
    if (!details?.purchaseToken) {
      await response.complete("fail");
      return { status: "error", message: "Réponse d'achat inattendue." };
    }

    await response.complete("success");
    return { status: "success", purchaseToken: details.purchaseToken };
  } catch (err) {
    // AbortError : l'utilisateur a ferme la feuille d'achat sans valider --
    // pas une erreur a afficher.
    if (err instanceof DOMException && err.name === "AbortError") {
      return { status: "cancelled" };
    }
    return { status: "error", message: err instanceof Error ? err.message : "Erreur inattendue." };
  }
}
