package org.fcold.jungly.twa;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

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

    // Trace explicite de chaque etape (voir "adb logcat -s JunglyBilling") --
    // ajoutee le 2026-09-21 apres plusieurs hypotheses infirmees (timeout
    // trop tot dans le flux, gel de processus emulateur...) : le probleme
    // reproduit A L'IDENTIQUE sur tablette Android 7.0 REELLE, ecartant
    // toute explication propre a l'emulateur. Plutot que d'inferer depuis
    // les logs internes de Google Play (qui ne disent jamais ce que NOTRE
    // code fait), cette trace dira precisement jusqu'ou l'execution va.
    private static final String TAG = "JunglyBilling";

    interface Listener {
        /**
         * provisioningId : a renvoyer tel quel au backend avec purchaseToken
         * (voir POST /api/billing/verify-purchase). Peut etre null lors
         * d'une recuperation d'achat (queryPurchasesAsync) si les donnees
         * locales ont ete effacees entre le paiement et la creation du
         * compte -- le backend accepte ce cas avec une garantie legerement
         * plus faible plutot que de bloquer la recuperation.
         */
        void onPurchaseObtained(String purchaseToken, String provisioningId);
        void onError(String message);
        void onCancelled();
    }

    // Certains environnements (Play Store absent/mal configure -- ex. emulateurs
    // PC comme MuMuPlayer) ne declenchent jamais certains callbacks de la
    // librairie Billing (aucun timeout integre cote Google) : d'abord repere
    // sur startConnection() (onBillingSetupFinished jamais appele), puis a
    // nouveau constate le 2026-09-21 avec un Play Store parfaitement
    // fonctionnel -- cette fois le blocage silencieux venait d'une etape
    // SUIVANTE (queryPurchasesAsync ou queryProductDetailsAsync), toujours
    // sous l'ecran "Connexion à Google Play…" puisque le titre ne change pas
    // entre ces etapes.
    //
    // Un PREMIER correctif (Handler.postDelayed sur le Looper principal) n'a
    // PAS suffi : verifie sur le meme emulateur MuMuPlayer avec le spinner
    // toujours anime et le bouton retour toujours reactif (donc le thread
    // principal n'est pas gele) -- Handler.postDelayed depend de
    // SystemClock.uptimeMillis(), que certains emulateurs de jeu virtualisent
    // ou throttlent independamment de l'animation UI (pilotee, elle, par
    // vsync/Choreographer). D'ou ce timeout base sur un VRAI thread separe
    // (Thread.sleep), un mecanisme entierement different, plutot qu'un
    // deuxieme reglage du meme mecanisme deja pris en defaut.
    //
    // Deuxieme correctif le 2026-09-21 : meme ce chien de garde ne suffisait
    // pas -- capture d'ecran a l'appui, l'ecran restait bloque sur le simple
    // titre "Jungly" (aucun contenu de SetupActivity.startPurchase() n'a
    // jamais ete affiche), sans jamais atteindre le delai de 15s. Cause :
    // BillingClient.newBuilder(...).build() se trouvait dans le CONSTRUCTEUR
    // de BillingHelper, appele AVANT le demarrage du chien de garde -- un
    // blocage a cet endroit precis (code tiers, hors de notre controle)
    // n'etait surveille par rien du tout. La construction du BillingClient
    // est desormais deplacee DANS startPurchase(), apres le lancement du
    // thread de surveillance, pour que meme ce cas soit couvert.
    private static final long PREPARE_PURCHASE_TIMEOUT_MS = 15_000;

    private final Activity activity;
    private final Listener listener;
    private BillingClient billingClient;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private boolean resolved; // toujours lu/ecrit sur le thread principal
    private Thread timeoutThread;

    /** Execute `action` une seule fois pour tout ce flux d'achat (toujours sur
     * le thread principal), et arrete le chien de garde s'il est encore en
     * attente -- que la resolution vienne du timeout lui-meme ou d'un vrai
     * callback Google, peu importe lequel arrive en premier. */
    private void resolveOnce(Runnable action) {
        Log.d(TAG, "resolveOnce() appele, deja resolu=" + resolved);
        if (resolved) return;
        resolved = true;
        if (timeoutThread != null) {
            timeoutThread.interrupt();
        }
        action.run();
        Log.d(TAG, "resolveOnce() action.run() terminee");
    }

    BillingHelper(Activity activity, Listener listener) {
        Log.d(TAG, "Constructeur BillingHelper");
        this.activity = activity;
        this.listener = listener;
    }

    /**
     * Cherche d'abord un achat deja effectue et pas encore consomme cote
     * serveur (app tuee/reseau coupe juste apres le paiement -- Google
     * documente explicitement ce cas, voir CHANGELOG) avant de proposer un
     * nouvel achat. Sans ca, un utilisateur ayant deja paye pourrait se
     * retrouver a payer une seconde fois.
     */
    void startPurchase() {
        Log.d(TAG, "startPurchase() debut");
        resolved = false;
        timeoutThread = new Thread(() -> {
            Log.d(TAG, "thread chien de garde demarre, sleep " + PREPARE_PURCHASE_TIMEOUT_MS + "ms");
            try {
                Thread.sleep(PREPARE_PURCHASE_TIMEOUT_MS);
            } catch (InterruptedException e) {
                Log.d(TAG, "thread chien de garde interrompu (resolu ailleurs)");
                return; // resolu par un vrai callback avant l'expiration du delai
            }
            Log.d(TAG, "chien de garde EXPIRE, post vers le thread principal");
            mainHandler.post(() -> resolveOnce(() -> listener.onError(
                    "Connexion à Google Play trop longue. Vérifiez que le Play Store est installé, à jour et que vous êtes connecté à un compte Google, puis réessayez.")));
        });
        timeoutThread.start();
        Log.d(TAG, "thread chien de garde .start() appele");

        // Construction du client APRES le demarrage du chien de garde : voir
        // le commentaire au-dessus de PREPARE_PURCHASE_TIMEOUT_MS.
        billingClient = BillingClient.newBuilder(activity)
                .setListener(this)
                .enablePendingPurchases(
                        PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
                .build();
        Log.d(TAG, "BillingClient construit, appel startConnection()");

        billingClient.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(BillingResult billingResult) {
                Log.d(TAG, "onBillingSetupFinished responseCode=" + billingResult.getResponseCode() + " debugMessage=" + billingResult.getDebugMessage());
                if (resolved) return; // le timeout a deja resolu (erreur affichee)
                if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    resolveOnce(() -> listener.onError("Connexion à Google Play impossible (" + billingResult.getDebugMessage() + ")."));
                    return;
                }
                recoverExistingPurchaseOrLaunchNew();
            }

            @Override
            public void onBillingServiceDisconnected() {
                Log.d(TAG, "onBillingServiceDisconnected");
                // L'utilisateur peut relancer l'achat depuis SetupActivity -- pas de reconnexion automatique ici.
            }
        });
        Log.d(TAG, "startConnection() appele (retour immediat attendu, async)");
    }

    private void recoverExistingPurchaseOrLaunchNew() {
        Log.d(TAG, "recoverExistingPurchaseOrLaunchNew() appel queryPurchasesAsync");
        QueryPurchasesParams params = QueryPurchasesParams.newBuilder()
                .setProductType(BillingClient.ProductType.INAPP)
                .build();

        billingClient.queryPurchasesAsync(params, (billingResult, purchases) -> {
            Log.d(TAG, "queryPurchasesAsync callback responseCode=" + billingResult.getResponseCode() + " nbPurchases=" + (purchases != null ? purchases.size() : -1));
            if (resolved) return; // le chien de garde a deja resolu (erreur affichee)
            if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                for (Purchase purchase : purchases) {
                    boolean isOurProduct = purchase.getProducts().contains(AppConfig.HOSTED_PRODUCT_ID);
                    boolean isUsable = purchase.getPurchaseState() == Purchase.PurchaseState.PURCHASED;
                    if (isOurProduct && isUsable) {
                        // Lecture seule ici (jamais getOrCreate) : cet achat a pu etre fait
                        // lors d'une installation precedente dont les SharedPreferences ont
                        // disparu -- fabriquer un nouvel identifiant ferait a coup sur
                        // echouer la verification cote serveur (voir InstancePrefs).
                        String provisioningId = InstancePrefs.getPendingProvisioningIdOrNull(activity);
                        resolveOnce(() -> listener.onPurchaseObtained(purchase.getPurchaseToken(), provisioningId));
                        return;
                    }
                }
            }
            queryProductAndLaunch();
        });
    }

    private void queryProductAndLaunch() {
        Log.d(TAG, "queryProductAndLaunch() appel queryProductDetailsAsync pour " + AppConfig.HOSTED_PRODUCT_ID);
        QueryProductDetailsParams.Product product = QueryProductDetailsParams.Product.newBuilder()
                .setProductId(AppConfig.HOSTED_PRODUCT_ID)
                .setProductType(BillingClient.ProductType.INAPP)
                .build();

        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
                .setProductList(Collections.singletonList(product))
                .build();

        billingClient.queryProductDetailsAsync(params, (billingResult, queryProductDetailsResult) -> {
            Log.d(TAG, "queryProductDetailsAsync callback responseCode=" + billingResult.getResponseCode() + " debugMessage=" + billingResult.getDebugMessage());
            if (resolved) return; // le chien de garde a deja resolu (erreur affichee)
            List<ProductDetails> productDetailsList = queryProductDetailsResult.getProductDetailsList();
            if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK || productDetailsList.isEmpty()) {
                resolveOnce(() -> listener.onError("Produit introuvable sur Google Play (" + billingResult.getDebugMessage() + ")."));
                return;
            }

            ProductDetails productDetails = productDetailsList.get(0);

            // Modele "purchase options" pour les produits ponctuels (introduit
            // mi-2025) : un produit peut desormais avoir plusieurs options
            // d'achat (acheter/louer), chacune avec son propre offerToken.
            // setProductDetails() seul ne suffit plus -- setOfferToken() est
            // obligatoire, meme avec une seule option configuree cote Play
            // Console (voir developer.android.com/google/play/billing/
            // one-time-product-multi-purchase-options-offers). Jungly n'a
            // qu'une option ("Acheter", pas de location) : on prend la
            // premiere de la liste, pas de choix a proposer a l'utilisateur.
            List<ProductDetails.OneTimePurchaseOfferDetails> offers = productDetails.getOneTimePurchaseOfferDetailsList();
            if (offers == null || offers.isEmpty()) {
                resolveOnce(() -> listener.onError("Aucune option d'achat disponible pour ce produit sur Google Play."));
                return;
            }
            String offerToken = offers.get(0).getOfferToken();
            Log.d(TAG, "offerToken obtenu, " + offers.size() + " option(s) d'achat disponible(s)");

            BillingFlowParams.ProductDetailsParams productDetailsParams =
                    BillingFlowParams.ProductDetailsParams.newBuilder()
                            .setProductDetails(productDetails)
                            .setOfferToken(offerToken)
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

            // BUG reel trouve le 2026-09-21 : la valeur de retour de
            // launchBillingFlow() etait jusqu'ici totalement ignoree. Or ce
            // retour est SYNCHRONE et distinct du callback onPurchasesUpdated
            // -- il indique si Google a seulement reussi a OUVRIR son propre
            // ecran d'achat (ex. DEVELOPER_ERROR, ITEM_ALREADY_OWNED, produit
            // non actif sur la Play Console peuvent echouer ici silencieusement).
            // Sans cette verification, un tel echec laissait l'ecran
            // "Connexion à Google Play…" affiche indefiniment, puisque plus
            // aucun timeout ne surveille cette etape (on a deja resolu pour
            // laisser la main a l'UI Google) et qu'aucun callback ulterieur
            // n'arrive jamais dans ce cas.
            Log.d(TAG, "appel launchBillingFlow()");
            BillingResult launchResult = billingClient.launchBillingFlow(activity, billingFlowParams);
            Log.d(TAG, "launchBillingFlow() a retourne responseCode=" + launchResult.getResponseCode() + " debugMessage=" + launchResult.getDebugMessage());
            if (launchResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                resolveOnce(() -> listener.onError("Impossible d'ouvrir l'achat Google Play (" + launchResult.getDebugMessage() + ")."));
                return;
            }
            // A partir d'ici, l'ecran d'achat de Google a bien ete ouvert --
            // on arrete de surveiller : la suite attend une vraie interaction
            // humaine (onPurchasesUpdated), qui peut legitimement prendre du
            // temps (saisie de carte, 2FA...), jamais un delai fixe.
            resolveOnce(() -> {});
        });
    }

    @Override
    public void onPurchasesUpdated(BillingResult billingResult, List<Purchase> purchases) {
        Log.d(TAG, "onPurchasesUpdated responseCode=" + billingResult.getResponseCode() + " nbPurchases=" + (purchases != null ? purchases.size() : -1));
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
        if (timeoutThread != null) {
            timeoutThread.interrupt();
        }
        if (billingClient != null) {
            billingClient.endConnection();
        }
    }
}
