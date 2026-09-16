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

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }
}
