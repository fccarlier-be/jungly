package org.fcold.plantes.twa;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * Persiste le choix fait au premier lancement (auto-heberge ou offre
 * hebergee) : l'URL cible que LauncherActivity doit charger. Tant qu'aucune
 * valeur n'est enregistree, LauncherActivity redirige vers SetupActivity
 * au lieu de lancer la TWA.
 */
final class InstancePrefs {
    private static final String PREFS_NAME = "jungly_instance";
    private static final String KEY_TARGET_URL = "target_url";
    private static final String KEY_PENDING_PROVISIONING_ID = "pending_provisioning_id";

    private InstancePrefs() {}

    static String getTargetUrl(Context context) {
        return prefs(context).getString(KEY_TARGET_URL, null);
    }

    static void setTargetUrl(Context context, String url) {
        prefs(context).edit().putString(KEY_TARGET_URL, url).apply();
    }

    static boolean isConfigured(Context context) {
        return getTargetUrl(context) != null;
    }

    /**
     * Identifiant genere avant de lancer un achat Google Play (voir
     * BillingHelper), envoye a la fois a Google (setObfuscatedAccountId) et
     * a notre backend au moment de la creation du compte -- persiste pour
     * survivre a un redemarrage de process pendant l'achat (voir
     * queryPurchasesAsync/recuperation d'achat interrompu).
     */
    static String getOrCreatePendingProvisioningId(Context context) {
        SharedPreferences prefs = prefs(context);
        String existing = prefs.getString(KEY_PENDING_PROVISIONING_ID, null);
        if (existing != null) {
            return existing;
        }
        String generated = java.util.UUID.randomUUID().toString();
        prefs.edit().putString(KEY_PENDING_PROVISIONING_ID, generated).apply();
        return generated;
    }

    static void clearPendingProvisioningId(Context context) {
        prefs(context).edit().remove(KEY_PENDING_PROVISIONING_ID).apply();
    }

    /**
     * Lecture seule, contrairement a getOrCreatePendingProvisioningId() --
     * pour la recuperation d'un achat deja effectue (queryPurchasesAsync) :
     * si les donnees locales ont ete effacees (app reinstallee/donnees
     * effacees entre le paiement et la creation du compte), il ne faut
     * surtout pas en fabriquer un nouveau ici, il ne correspondrait jamais
     * a celui que Google a enregistre au moment de l'achat -- ca ferait
     * echouer la recuperation au lieu de simplement l'affaiblir legerement
     * (voir provisionHostedAccount cote serveur, provisioningId optionnel).
     */
    static String getPendingProvisioningIdOrNull(Context context) {
        return prefs(context).getString(KEY_PENDING_PROVISIONING_ID, null);
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }
}
