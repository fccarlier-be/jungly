package org.fcold.jungly.twa;

import android.os.Handler;
import android.os.Looper;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.io.OutputStream;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/** Petit client HTTP pour POST /api/billing/verify-purchase -- pas besoin d'une dependance externe pour un seul appel. */
final class ApiClient {

    interface Callback {
        void onSuccess(int statusCode, JSONObject body);
        void onFailure(Exception error);
    }

    private ApiClient() {}

    static void postJson(String urlString, JSONObject payload, Callback callback) {
        Handler mainHandler = new Handler(Looper.getMainLooper());
        new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                URL url = new URL(urlString);
                connection = (HttpURLConnection) url.openConnection();
                connection.setRequestMethod("POST");
                connection.setRequestProperty("Content-Type", "application/json");
                connection.setConnectTimeout(15000);
                connection.setReadTimeout(15000);
                connection.setDoOutput(true);

                try (OutputStream os = connection.getOutputStream()) {
                    os.write(payload.toString().getBytes(StandardCharsets.UTF_8));
                }

                int status = connection.getResponseCode();
                InputStream stream = status >= 200 && status < 300
                        ? connection.getInputStream()
                        : connection.getErrorStream();
                String responseText = readAll(stream);
                JSONObject responseBody = parseJsonOrEmpty(responseText);

                mainHandler.post(() -> callback.onSuccess(status, responseBody));
            } catch (Exception e) {
                mainHandler.post(() -> callback.onFailure(e));
            } finally {
                if (connection != null) connection.disconnect();
            }
        }).start();
    }

    private static String readAll(InputStream stream) throws IOException {
        if (stream == null) return "";
        ByteArrayOutputStream result = new ByteArrayOutputStream();
        byte[] buffer = new byte[1024];
        int length;
        while ((length = stream.read(buffer)) != -1) {
            result.write(buffer, 0, length);
        }
        return result.toString(StandardCharsets.UTF_8.name());
    }

    private static JSONObject parseJsonOrEmpty(String text) {
        try {
            return new JSONObject(text);
        } catch (JSONException e) {
            return new JSONObject();
        }
    }
}
