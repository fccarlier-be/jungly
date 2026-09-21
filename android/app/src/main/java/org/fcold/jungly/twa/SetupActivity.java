package org.fcold.jungly.twa;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.PorterDuff;
import android.graphics.Typeface;
import android.os.Bundle;
import android.util.Log;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.core.content.res.ResourcesCompat;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * Ecran de premier lancement : choix entre auto-hebergement (URL du
 * serveur de l'utilisateur) et l'offre hebergee payante (achat unique via
 * Google Play). Construit en code (pas de layout XML) pour rester dans un
 * seul fichier, coherent avec la petite taille de cet ecran.
 *
 * Stylage aligne sur l'identite Jungly (voir src/app/globals.css cote web)
 * -- retour utilisateur du 2026-09-21 : cet ecran, seul endroit de l'app
 * non couvert par la TWA, restait sur le theme systeme par defaut
 * (Theme.DeviceDefault.Light) et jurait completement avec le reste.
 * "J'ai mon propre serveur" reste le choix visuellement mis en avant
 * (bouton plein) : l'auto-hebergement gratuit est prioritaire, l'offre
 * payante secondaire (voir memoire jungly_hosted_offer_philosophy).
 */
public class SetupActivity extends Activity {

    private LinearLayout root;
    private BillingHelper billingHelper;
    private String pendingPurchaseToken;
    private String pendingProvisioningId;

    private Typeface interRegular;
    private Typeface interSemibold;
    private Typeface interBold;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        interRegular = ResourcesCompat.getFont(this, R.font.inter_regular);
        interSemibold = ResourcesCompat.getFont(this, R.font.inter_semibold);
        interBold = ResourcesCompat.getFont(this, R.font.inter_bold);
        showChoiceScreen();
    }

    private LinearLayout newRoot() {
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setBackgroundColor(color(R.color.setup_bg));
        int padding = dp(28);
        layout.setPadding(padding, padding * 2, padding, padding);
        setContentView(layout);
        return layout;
    }

    private int dp(int value) {
        float density = getResources().getDisplayMetrics().density;
        return Math.round(value * density);
    }

    private int color(int resId) {
        // getColor(int) sans Resources : disponible depuis API 23, qui est
        // exactement notre minSdkVersion -- pas besoin de la variante
        // depreciee a un seul argument de Resources.
        return getColor(resId);
    }

    private ImageView logo() {
        ImageView image = new ImageView(this);
        image.setImageResource(R.mipmap.ic_launcher);
        int size = dp(64);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(size, size);
        params.bottomMargin = dp(20);
        params.gravity = Gravity.START;
        image.setLayoutParams(params);
        return image;
    }

    private TextView title(String text) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setTextSize(23);
        view.setTypeface(interBold);
        view.setTextColor(color(R.color.setup_ink));
        view.setGravity(Gravity.START);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        params.bottomMargin = dp(22);
        view.setLayoutParams(params);
        return view;
    }

    private TextView body(String text) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setTextSize(15);
        view.setTypeface(interRegular);
        view.setTextColor(color(R.color.setup_ink_muted));
        view.setLineSpacing(dp(2), 1f);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        params.bottomMargin = dp(18);
        view.setLayoutParams(params);
        return view;
    }

    /** primary=true : bouton plein (action principale). primary=false : bouton discret (contour). */
    private Button button(String text, boolean primary, View.OnClickListener onClick) {
        Button btn = new Button(this);
        btn.setText(text);
        btn.setAllCaps(false);
        btn.setTypeface(interSemibold);
        btn.setTextSize(15);
        btn.setBackgroundResource(primary ? R.drawable.bg_pill_primary : R.drawable.bg_pill_secondary);
        btn.setTextColor(primary ? color(R.color.setup_primary_ink) : color(R.color.setup_ink));
        btn.setPadding(dp(20), dp(16), dp(20), dp(16));
        btn.setStateListAnimator(null);
        btn.setOnClickListener(onClick);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        params.bottomMargin = dp(12);
        btn.setLayoutParams(params);
        return btn;
    }

    private EditText input(String hint, int inputType) {
        EditText edit = new EditText(this);
        edit.setHint(hint);
        edit.setInputType(inputType);
        edit.setTypeface(interRegular);
        edit.setTextSize(15);
        edit.setTextColor(color(R.color.setup_ink));
        edit.setHintTextColor(color(R.color.setup_ink_muted));
        edit.setBackgroundResource(R.drawable.bg_input);
        int h = dp(14);
        int v = dp(14);
        edit.setPadding(h, v, h, v);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        params.bottomMargin = dp(16);
        edit.setLayoutParams(params);
        return edit;
    }

    // ---------- Écran 1 : choix ----------

    private void showChoiceScreen() {
        root = newRoot();
        root.addView(logo());
        root.addView(title("Bienvenue sur Jungly"));
        root.addView(body("Comment voulez-vous utiliser l'application ?"));
        root.addView(button("J'ai mon propre serveur (gratuit)", true, v -> showSelfHostedScreen()));
        root.addView(button("Utiliser l'offre hébergée (achat unique, 2 €)", false, v -> startPurchase()));
    }

    // ---------- Auto-hébergé ----------

    private void showSelfHostedScreen() {
        root = newRoot();
        root.addView(logo());
        root.addView(title("Votre serveur Jungly"));
        root.addView(body("Entrez l'adresse complète de votre instance (ex. https://plantes.mondomaine.fr)."));
        EditText urlInput = input("https://...", InputType.TYPE_TEXT_VARIATION_URI | InputType.TYPE_CLASS_TEXT);
        root.addView(urlInput);
        root.addView(button("Continuer", true, v -> {
            String url = urlInput.getText().toString().trim();
            if (!url.startsWith("https://")) {
                Toast.makeText(this, "L'adresse doit commencer par https://", Toast.LENGTH_LONG).show();
                return;
            }
            InstancePrefs.setTargetUrl(this, url);
            launchMainActivity();
        }));
        root.addView(button("← Retour", false, v -> showChoiceScreen()));
    }

    // ---------- Offre hébergée ----------

    private void startPurchase() {
        Log.d("JunglyBilling", "SetupActivity.startPurchase() -- clic recu");
        root = newRoot();
        root.addView(logo());
        root.addView(title("Connexion à Google Play…"));
        ProgressBar progressBar = new ProgressBar(this);
        if (progressBar.getIndeterminateDrawable() != null) {
            progressBar.getIndeterminateDrawable().setColorFilter(color(R.color.setup_primary), PorterDuff.Mode.SRC_IN);
        }
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        params.gravity = Gravity.START;
        progressBar.setLayoutParams(params);
        root.addView(progressBar);
        Log.d("JunglyBilling", "Ecran de connexion affiche, creation de BillingHelper");

        billingHelper = new BillingHelper(this, new BillingHelper.Listener() {
            @Override
            public void onPurchaseObtained(String purchaseToken, String provisioningId) {
                Log.d("JunglyBilling", "Listener.onPurchaseObtained");
                pendingPurchaseToken = purchaseToken;
                pendingProvisioningId = provisioningId;
                showAccountScreen();
            }

            @Override
            public void onError(String message) {
                Log.d("JunglyBilling", "Listener.onError: " + message);
                Toast.makeText(SetupActivity.this, message, Toast.LENGTH_LONG).show();
                showChoiceScreen();
            }

            @Override
            public void onCancelled() {
                Log.d("JunglyBilling", "Listener.onCancelled");
                showChoiceScreen();
            }
        });
        Log.d("JunglyBilling", "BillingHelper construit, appel startPurchase()");
        billingHelper.startPurchase();
        Log.d("JunglyBilling", "billingHelper.startPurchase() est revenu (appel non bloquant attendu)");
    }

    private void showAccountScreen() {
        root = newRoot();
        root.addView(logo());
        root.addView(title("Créez votre compte"));
        root.addView(body("Achat confirmé — choisissez l'email et le mot de passe de votre compte Jungly."));
        EditText emailInput = input("Email", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        EditText passwordInput = input("Mot de passe (8 caractères minimum)", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        root.addView(emailInput);
        root.addView(passwordInput);
        root.addView(button("Créer mon compte", true, v -> {
            String email = emailInput.getText().toString().trim();
            String password = passwordInput.getText().toString();
            if (email.isEmpty() || password.length() < 8) {
                Toast.makeText(this, "Email valide et mot de passe de 8 caractères minimum requis.", Toast.LENGTH_LONG).show();
                return;
            }
            submitAccountCreation(email, password);
        }));
    }

    private void submitAccountCreation(String email, String password) {
        Toast.makeText(this, "Création du compte…", Toast.LENGTH_SHORT).show();
        JSONObject payload = new JSONObject();
        try {
            payload.put("purchaseToken", pendingPurchaseToken);
            payload.put("productId", AppConfig.HOSTED_PRODUCT_ID);
            payload.put("provisioningId", pendingProvisioningId);
            payload.put("email", email);
            payload.put("password", password);
        } catch (JSONException e) {
            Toast.makeText(this, "Erreur interne, réessayez.", Toast.LENGTH_LONG).show();
            return;
        }

        ApiClient.postJson(AppConfig.VERIFY_PURCHASE_ENDPOINT, payload, new ApiClient.Callback() {
            @Override
            public void onSuccess(int statusCode, JSONObject body) {
                if (statusCode == 201) {
                    InstancePrefs.clearPendingProvisioningId(SetupActivity.this);
                    InstancePrefs.setTargetUrl(SetupActivity.this, AppConfig.HOSTED_URL);
                    launchMainActivity();
                } else {
                    String error = body.optString("error", "Impossible de créer le compte.");
                    Toast.makeText(SetupActivity.this, error, Toast.LENGTH_LONG).show();
                }
            }

            @Override
            public void onFailure(Exception error) {
                Toast.makeText(SetupActivity.this, "Connexion impossible, vérifiez votre accès Internet.", Toast.LENGTH_LONG).show();
            }
        });
    }

    private void launchMainActivity() {
        startActivity(new Intent(this, LauncherActivity.class));
        finish();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (billingHelper != null) {
            billingHelper.endConnection();
        }
    }
}
