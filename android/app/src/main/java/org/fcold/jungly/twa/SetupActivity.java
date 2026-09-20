package org.fcold.jungly.twa;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * Ecran de premier lancement : choix entre auto-hebergement (URL du
 * serveur de l'utilisateur) et l'offre hebergee payante (achat unique via
 * Google Play). Construit en code (pas de layout XML) pour rester dans un
 * seul fichier, coherent avec la petite taille de cet ecran.
 */
public class SetupActivity extends Activity {

    private LinearLayout root;
    private BillingHelper billingHelper;
    private String pendingPurchaseToken;
    private String pendingProvisioningId;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        showChoiceScreen();
    }

    private LinearLayout newRoot() {
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        int padding = dp(24);
        layout.setPadding(padding, padding * 2, padding, padding);
        setContentView(layout);
        return layout;
    }

    private int dp(int value) {
        float density = getResources().getDisplayMetrics().density;
        return Math.round(value * density);
    }

    private TextView title(String text) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setTextSize(22);
        view.setGravity(Gravity.START);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        params.bottomMargin = dp(24);
        view.setLayoutParams(params);
        return view;
    }

    private TextView body(String text) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setTextSize(15);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        params.bottomMargin = dp(16);
        view.setLayoutParams(params);
        return view;
    }

    private Button button(String text, View.OnClickListener onClick) {
        Button button = new Button(this);
        button.setText(text);
        button.setOnClickListener(onClick);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        params.bottomMargin = dp(12);
        button.setLayoutParams(params);
        return button;
    }

    private EditText input(String hint, int inputType) {
        EditText edit = new EditText(this);
        edit.setHint(hint);
        edit.setInputType(inputType);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        params.bottomMargin = dp(16);
        edit.setLayoutParams(params);
        return edit;
    }

    // ---------- Écran 1 : choix ----------

    private void showChoiceScreen() {
        root = newRoot();
        root.addView(title("Bienvenue sur Jungly"));
        root.addView(body("Comment voulez-vous utiliser l'application ?"));
        root.addView(button("J'ai mon propre serveur (gratuit)", v -> showSelfHostedScreen()));
        root.addView(button("Utiliser l'offre hébergée (achat unique, 2 €)", v -> startPurchase()));
    }

    // ---------- Auto-hébergé ----------

    private void showSelfHostedScreen() {
        root = newRoot();
        root.addView(title("Votre serveur Jungly"));
        root.addView(body("Entrez l'adresse complète de votre instance (ex. https://plantes.mondomaine.fr)."));
        EditText urlInput = input("https://...", InputType.TYPE_TEXT_VARIATION_URI | InputType.TYPE_CLASS_TEXT);
        root.addView(urlInput);
        root.addView(button("Continuer", v -> {
            String url = urlInput.getText().toString().trim();
            if (!url.startsWith("https://")) {
                Toast.makeText(this, "L'adresse doit commencer par https://", Toast.LENGTH_LONG).show();
                return;
            }
            InstancePrefs.setTargetUrl(this, url);
            launchMainActivity();
        }));
        root.addView(button("← Retour", v -> showChoiceScreen()));
    }

    // ---------- Offre hébergée ----------

    private void startPurchase() {
        root = newRoot();
        root.addView(title("Connexion à Google Play…"));
        ProgressBar progressBar = new ProgressBar(this);
        root.addView(progressBar);

        billingHelper = new BillingHelper(this, new BillingHelper.Listener() {
            @Override
            public void onPurchaseObtained(String purchaseToken, String provisioningId) {
                pendingPurchaseToken = purchaseToken;
                pendingProvisioningId = provisioningId;
                showAccountScreen();
            }

            @Override
            public void onError(String message) {
                Toast.makeText(SetupActivity.this, message, Toast.LENGTH_LONG).show();
                showChoiceScreen();
            }

            @Override
            public void onCancelled() {
                showChoiceScreen();
            }
        });
        billingHelper.startPurchase();
    }

    private void showAccountScreen() {
        root = newRoot();
        root.addView(title("Créez votre compte"));
        root.addView(body("Achat confirmé — choisissez l'email et le mot de passe de votre compte Jungly."));
        EditText emailInput = input("Email", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        EditText passwordInput = input("Mot de passe (8 caractères minimum)", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        root.addView(emailInput);
        root.addView(passwordInput);
        root.addView(button("Créer mon compte", v -> {
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
