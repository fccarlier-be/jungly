import { google } from "googleapis";

/**
 * Nom de package de l'app Android officielle (Bubblewrap/TWA) -- voir
 * docs/android-apk-build.md et public/.well-known/assetlinks.json. Une
 * seule app, un seul package, identique pour tous les self-hosters comme
 * pour l'offre hebergee.
 */
const PACKAGE_NAME = "org.fcold.plantes.twa";

type PurchaseCheckResult = "valid_needs_ack" | "valid_acknowledged" | "not_purchased";

/**
 * Logique pure, testable sans mocker googleapis : purchaseState 0 = achete
 * (1 = annule, 2 = en attente -- tout sauf 0 est refuse). acknowledgementState
 * 0 = pas encore acquitte -- Google rembourse automatiquement un achat non
 * acquitte sous 3 jours (piege classique de Play Billing), d'ou
 * l'acquittement systematique quand necessaire.
 */
export function evaluatePurchaseState(
  purchaseState: number | null | undefined,
  acknowledgementState: number | null | undefined,
): PurchaseCheckResult {
  if (purchaseState !== 0) return "not_purchased";
  return acknowledgementState === 0 ? "valid_needs_ack" : "valid_acknowledged";
}

export type PurchaseVerification = { ok: true } | { ok: false; reason: "not_configured" | "not_purchased" | "api_error" };

function getClient() {
  const credentialsJson = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  if (!credentialsJson) return null;

  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(credentialsJson),
    scopes: ["https://www.googleapis.com/auth/androidpublisher"],
  });
  return google.androidpublisher({ version: "v3", auth });
}

/**
 * Verifie un jeton d'achat aupres de l'API Google Play Developer et
 * l'acquitte si necessaire. Sans GOOGLE_PLAY_SERVICE_ACCOUNT_JSON (avant
 * que le compte developpeur/l'app Play Console existent), journalise et
 * refuse au lieu d'echouer bruyamment -- meme approche que sendEmail()
 * sans RESEND_API_KEY.
 */
export async function verifyAndAcknowledgePurchase(productId: string, purchaseToken: string): Promise<PurchaseVerification> {
  const client = getClient();
  if (!client) {
    console.warn("[billing] GOOGLE_PLAY_SERVICE_ACCOUNT_JSON absente, verification impossible");
    return { ok: false, reason: "not_configured" };
  }

  try {
    const { data } = await client.purchases.products.get({
      packageName: PACKAGE_NAME,
      productId,
      token: purchaseToken,
    });

    const state = evaluatePurchaseState(data.purchaseState, data.acknowledgementState);
    if (state === "not_purchased") {
      return { ok: false, reason: "not_purchased" };
    }

    if (state === "valid_needs_ack") {
      await client.purchases.products.acknowledge({
        packageName: PACKAGE_NAME,
        productId,
        token: purchaseToken,
      });
    }

    return { ok: true };
  } catch (error) {
    console.error("[billing] Échec de vérification auprès de Google Play :", error);
    return { ok: false, reason: "api_error" };
  }
}
