package org.fcold.plantes.twa;

import android.app.Activity;

import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.ProductDetails;

import java.util.Collections;
import java.util.List;

/**
 * Achat unique (non consommable) pour debloquer l'offre hebergee -- pas
 * d'acquittement cote client : POST /api/billing/verify-purchase (voir
 * ApiClient) verifie et acquitte le jeton cote serveur, aupres de l'API
 * Play Developer, une seule source de verite plutot que deux.
 */
final class BillingHelper implements PurchasesUpdatedListener {

    interface Listener {
        void onPurchaseObtained(String purchaseToken);
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
                .enablePendingPurchases()
                .build();
    }

    void startPurchase() {
        billingClient.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(BillingResult billingResult) {
                if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    listener.onError("Connexion à Google Play impossible (" + billingResult.getDebugMessage() + ").");
                    return;
                }
                queryProductAndLaunch();
            }

            @Override
            public void onBillingServiceDisconnected() {
                // L'utilisateur peut relancer l'achat depuis SetupActivity -- pas de reconnexion automatique ici.
            }
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

        billingClient.queryProductDetailsAsync(params, (billingResult, productDetailsList) -> {
            if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK || productDetailsList.isEmpty()) {
                listener.onError("Produit introuvable sur Google Play (" + billingResult.getDebugMessage() + ").");
                return;
            }

            ProductDetails productDetails = productDetailsList.get(0);
            BillingFlowParams.ProductDetailsParams productDetailsParams =
                    BillingFlowParams.ProductDetailsParams.newBuilder()
                            .setProductDetails(productDetails)
                            .build();

            BillingFlowParams billingFlowParams = BillingFlowParams.newBuilder()
                    .setProductDetailsParamsList(Collections.singletonList(productDetailsParams))
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
                listener.onPurchaseObtained(purchase.getPurchaseToken());
                return;
            }
        }
        listener.onError("Achat reçu mais produit inattendu.");
    }

    void endConnection() {
        billingClient.endConnection();
    }
}
