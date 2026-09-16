package org.fcold.plantes.twa;

import android.app.Activity;

import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;

import java.util.Collections;
import java.util.List;

/**
 * Achat unique (non consommable) pour debloquer l'offre hebergee -- pas
 * d'acquittement cote client : POST /api/billing/verify-purchase (voir
 * ApiClient) verifie et acquitte le jeton cote serveur, aupres de l'API
 * Play Developer, une seule source de verite plutot que deux.
 *
 * Billing Library 9.x (migre depuis 7.1.1, hors delai Google au
 * 31/08/2026). Deux changements d'API notables par rapport a 7.1.1 :
 * enablePendingPurchases() sans argument est retire (il faut
 * PendingPurchasesParams), et queryProductDetailsAsync() renvoie desormais
 * un QueryProductDetailsResult (avec les produits introuvables a part) au
 * lieu d'une simple liste.
 */
final class BillingHelper implements PurchasesUpdatedListener {

    interface Listener {
        /** provisioningId : a renvoyer tel quel au backend avec purchaseToken (voir POST /api/billing/verify-purchase). */
        void onPurchaseObtained(String purchaseToken, String provisioningId);
        void onError(String message);
        void onCancelled();
    }

    private final Activity activity;
    private final Listener listener;
    private final BillingClient billingClient;

    BillingHelper(Activity activity, Listener listener) {
        this.activity = activity;
        this.listener = listener;
        this.billingClient = BillingClient.newBuilder(activity)
                .setListener(this)
                .enablePendingPurchases(
                        PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
                .build();
    }

    /**
     * Cherche d'abord un achat deja effectue et pas encore consomme cote
     * serveur (app tuee/reseau coupe juste apres le paiement -- Google
     * documente explicitement ce cas, voir CHANGELOG) avant de proposer un
     * nouvel achat. Sans ca, un utilisateur ayant deja paye pourrait se
     * retrouver a payer une seconde fois.
     */
    void startPurchase() {
        billingClient.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(BillingResult billingResult) {
                if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    listener.onError("Connexion à Google Play impossible (" + billingResult.getDebugMessage() + ").");
                    return;
                }
                recoverExistingPurchaseOrLaunchNew();
            }

            @Override
            public void onBillingServiceDisconnected() {
                // L'utilisateur peut relancer l'achat depuis SetupActivity -- pas de reconnexion automatique ici.
            }
        });
    }

    private void recoverExistingPurchaseOrLaunchNew() {
        QueryPurchasesParams params = QueryPurchasesParams.newBuilder()
                .setProductType(BillingClient.ProductType.INAPP)
                .build();

        billingClient.queryPurchasesAsync(params, (billingResult, purchases) -> {
            if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                for (Purchase purchase : purchases) {
                    boolean isOurProduct = purchase.getProducts().contains(AppConfig.HOSTED_PRODUCT_ID);
                    boolean isUsable = purchase.getPurchaseState() == Purchase.PurchaseState.PURCHASED;
                    if (isOurProduct && isUsable) {
                        // provisioningId deja persiste lors du lancement d'achat qui a produit
                        // celui-ci (meme apres redemarrage de process, voir InstancePrefs).
                        String provisioningId = InstancePrefs.getOrCreatePendingProvisioningId(activity);
                        listener.onPurchaseObtained(purchase.getPurchaseToken(), provisioningId);
                        return;
                    }
                }
            }
            queryProductAndLaunch();
        });
    }

    private void queryProductAndLaunch() {
        QueryProductDetailsParams.Product product = QueryProductDetailsParams.Product.newBuilder()
                .setProductId(AppConfig.HOSTED_PRODUCT_ID)
                .setProductType(BillingClient.ProductType.INAPP)
                .build();

        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
                .setProductList(Collections.singletonList(product))
                .build();

        billingClient.queryProductDetailsAsync(params, (billingResult, queryProductDetailsResult) -> {
            List<ProductDetails> productDetailsList = queryProductDetailsResult.getProductDetailsList();
            if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK || productDetailsList.isEmpty()) {
                listener.onError("Produit introuvable sur Google Play (" + billingResult.getDebugMessage() + ").");
                return;
            }

            ProductDetails productDetails = productDetailsList.get(0);
            BillingFlowParams.ProductDetailsParams productDetailsParams =
                    BillingFlowParams.ProductDetailsParams.newBuilder()
                            .setProductDetails(productDetails)
                            .build();

            // Identifiant genere avant l'achat et transmis a Google : notre backend verifiera
            // qu'il correspond bien a celui renvoye par l'API Play Developer avant de creer un
            // compte, pour qu'un jeton d'achat seul ne suffise pas a revendiquer un compte
            // (voir provisionHostedAccount cote serveur).
            String provisioningId = InstancePrefs.getOrCreatePendingProvisioningId(activity);

            BillingFlowParams billingFlowParams = BillingFlowParams.newBuilder()
                    .setProductDetailsParamsList(Collections.singletonList(productDetailsParams))
                    .setObfuscatedAccountId(provisioningId)
                    .build();

            billingClient.launchBillingFlow(activity, billingFlowParams);
        });
    }

    @Override
    public void onPurchasesUpdated(BillingResult billingResult, List<Purchase> purchases) {
        if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED) {
            listener.onCancelled();
            return;
        }
        if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK || purchases == null) {
            listener.onError("Achat impossible (" + billingResult.getDebugMessage() + ").");
            return;
        }
        for (Purchase purchase : purchases) {
            if (purchase.getProducts().contains(AppConfig.HOSTED_PRODUCT_ID)) {
                String provisioningId = InstancePrefs.getOrCreatePendingProvisioningId(activity);
                listener.onPurchaseObtained(purchase.getPurchaseToken(), provisioningId);
                return;
            }
        }
        listener.onError("Achat reçu mais produit inattendu.");
    }

    void endConnection() {
        billingClient.endConnection();
    }
}
