#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <esp_sleep.h>

#include "config.h"
#include "secrets.h"

Preferences prefs;

int readAdcAveraged(int pin, int samples) {
  long sum = 0;
  for (int i = 0; i < samples; i++) {
    sum += analogRead(pin);
    delay(2);
  }
  return sum / samples;
}

float adcToVoltage(int raw, float dividerRatio) {
  // 12 bits (0-4095), pleine echelle ~3.3V avec l'attenuation ADC_11db
  // (voir setup() -- necessaire pour lire jusqu'a 3.3V, l'attenuation par
  // defaut du coeur Arduino ne couvre pas toute la plage).
  return (raw / 4095.0f) * 3.3f * dividerRatio;
}

bool isCharging() {
  int raw = readAdcAveraged(PIN_CHARGE_DETECT, 4);
  float v = adcToVoltage(raw, CHARGE_DIVIDER_RATIO);
  return v > CHARGE_DETECT_THRESHOLD_V;
}

int readBatteryPercent() {
  int raw = readAdcAveraged(PIN_BATTERY_ADC, ADC_OVERSAMPLE_COUNT);
  float v = adcToVoltage(raw, BATTERY_DIVIDER_RATIO);
  float pct = (v - BATTERY_EMPTY_V) / (BATTERY_FULL_V - BATTERY_EMPTY_V) * 100.0f;
  if (pct < 0) pct = 0;
  if (pct > 100) pct = 100;
  return (int)roundf(pct);
}

// Calibration 2 points stockee en NVS (voir runCalibrationWindow()).
// Valeurs par defaut plausibles pour une sonde capacitive v2.0 generique,
// a affiner reellement au premier deploiement -- ne pas s'y fier telles
// quelles.
int readSoilMoisturePercent() {
  int dry = prefs.getInt("cal_dry", 2600);
  int wet = prefs.getInt("cal_wet", 1200);

  pinMode(PIN_SOIL_SENSOR_POWER, OUTPUT);
  digitalWrite(PIN_SOIL_SENSOR_POWER, HIGH);
  delay(SENSOR_WARMUP_MS);
  int raw = readAdcAveraged(PIN_SOIL_SENSOR_ADC, ADC_OVERSAMPLE_COUNT);
  digitalWrite(PIN_SOIL_SENSOR_POWER, LOW);

  // La tension baisse quand le sol est humide sur ces sondes capacitives :
  // "dry" (brut, sec) > "wet" (brut, humide).
  float pct = (float)(dry - raw) / (float)(dry - wet) * 100.0f;
  if (pct < 0) pct = 0;
  if (pct > 100) pct = 100;
  return (int)roundf(pct);
}

/**
 * Fenetre de calibration serie, active uniquement sur un vrai reset/reveil
 * a froid (jamais sur un reveil deep-sleep programme -- voir setup()) :
 * connecte en USB, envoyer "DRY" ou "WET" dans les 5s (fenetre prolongee a
 * chaque commande recue) pour enregistrer la valeur brute courante comme
 * point de calibration. Sans action, demarrage normal apres le delai.
 */
void runCalibrationWindow() {
  Serial.begin(115200);
  delay(200);
  Serial.println("Mode calibration -- taper DRY ou WET dans les 5s (sinon demarrage normal)");

  pinMode(PIN_SOIL_SENSOR_POWER, OUTPUT);
  digitalWrite(PIN_SOIL_SENSOR_POWER, HIGH);
  delay(SENSOR_WARMUP_MS);

  unsigned long start = millis();
  while (millis() - start < 5000) {
    int raw = readAdcAveraged(PIN_SOIL_SENSOR_ADC, ADC_OVERSAMPLE_COUNT);
    Serial.printf("brut=%d\n", raw);

    if (Serial.available()) {
      String cmd = Serial.readStringUntil('\n');
      cmd.trim();
      cmd.toUpperCase();
      if (cmd == "DRY") {
        prefs.putInt("cal_dry", raw);
        Serial.printf("DRY enregistre : %d\n", raw);
        start = millis();
      } else if (cmd == "WET") {
        prefs.putInt("cal_wet", raw);
        Serial.printf("WET enregistre : %d\n", raw);
        start = millis();
      }
    }
    delay(500);
  }

  digitalWrite(PIN_SOIL_SENSOR_POWER, LOW);
  Serial.println("Fin de la fenetre de calibration, demarrage normal.");
}

bool connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < WIFI_CONNECT_TIMEOUT_MS) {
    delay(200);
  }
  return WiFi.status() == WL_CONNECTED;
}

bool postReading(bool charging, int batteryPercent, bool haveSoilReading, int soilPercent) {
  WiFiClientSecure client;
  // setInsecure() plutot qu'un certificat racine embarque : zero
  // maintenance sur plusieurs annees (pas de rotation de certificat a
  // suivre sur un appareil qu'on ne reflashe pas souvent), au prix de ne
  // pas verifier l'identite du serveur -- accepte ici pour une lecture
  // d'humidite sur un domaine personnel (voir discussion de conception).
  client.setInsecure();

  HTTPClient http;
  String url = String("https://") + API_HOST + "/api/sensors/" + SENSOR_ID + "/readings";
  if (!http.begin(client, url)) {
    return false;
  }
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Sensor-Key", SENSOR_API_KEY);

  JsonDocument doc;
  if (haveSoilReading) {
    doc["value"] = soilPercent;
    doc["unit"] = SENSOR_UNIT;
  }
  doc["batteryPercent"] = batteryPercent;
  doc["charging"] = charging;

  String body;
  serializeJson(doc, body);

  int status = http.POST(body);
  http.end();
  return status == 201;
}

void goToSleep() {
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
  esp_sleep_enable_timer_wakeup(SLEEP_INTERVAL_US);
  esp_deep_sleep_start();
}

void setup() {
  analogReadResolution(12);
  analogSetAttenuation(ADC_11db); // necessaire pour lire jusqu'a ~3.3V sur les broches ADC

  prefs.begin("soil-sensor", false);

  // Fenetre de calibration seulement sur reset/reveil a froid (bouton
  // reset ou mise sous tension) -- jamais sur un reveil programme par le
  // timer de deep sleep, pour ne pas retarder chaque cycle normal.
  if (esp_sleep_get_wakeup_cause() != ESP_SLEEP_WAKEUP_TIMER) {
    runCalibrationWindow();
  }

  pinMode(PIN_CHARGE_DETECT, INPUT);
  pinMode(PIN_BATTERY_ADC, INPUT);

  bool charging = isCharging();
  int batteryPercent = readBatteryPercent();

  // Lecture d'humidite sautee entierement si en charge -- pas seulement
  // l'envoi -- une sonde manipulee/posee sur son socle ne reflete pas
  // l'etat reel du sol.
  bool haveSoilReading = !charging;
  int soilPercent = haveSoilReading ? readSoilMoisturePercent() : 0;

  if (connectWiFi()) {
    for (int attempt = 0; attempt < MAX_POST_ATTEMPTS; attempt++) {
      if (postReading(charging, batteryPercent, haveSoilReading, soilPercent)) {
        break;
      }
      delay(1000 * (attempt + 1));
    }
  }

  prefs.end();
  goToSleep();
}

void loop() {
  // Jamais atteint : goToSleep() ne retourne pas.
}
