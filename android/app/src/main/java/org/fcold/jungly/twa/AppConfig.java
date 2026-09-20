package org.fcold.jungly.twa;

/**
 * Constantes partagees entre l'ecran de configuration et le lanceur --
 * doivent rester synchronisees avec www/plantes/src/server/billingProducts.ts
 * (productId) et le sous-domaine reel de l'offre hebergee.
 */
final class AppConfig {
    static final String HOSTED_URL = "https://jungly-app.fcold.org";
    static final String HOSTED_PRODUCT_ID = "hosted_access_lifetime";
    static final String VERIFY_PURCHASE_ENDPOINT = HOSTED_URL + "/api/billing/verify-purchase";

    private AppConfig() {}
}
